const functions = require('firebase-functions');
// const admin = require('firebase-admin');
// admin.initializeApp();
const http = require('http');
const static = require('node-static');
const fileServer = new static.Server('.', { cache: 3600 });
const path = require('path');
const fs = require('fs');
const debug = require('debug')('example:resume-upload');

let uploads = Object.create(null);

function onUpload(req, res) {

  let fileId = req.headers['x-file-id'];
  let startByte = +req.headers['x-start-byte'];

  if (!fileId) {
    res.writeHead(400, "No file id");
    res.end();
  }

  // we'll files "nowhere"
  // let filePath = '/dev/null';
  // could use a real path instead, e.g.
  // ** edited
  let filePath = __dirname + '/tmp/' + fileId;
  console.log("filePath", filePath)

  debug("onUpload fileId: ", fileId);

  // initialize a new upload
  if (!uploads[fileId]) uploads[fileId] = {};
  let upload = uploads[fileId];

  debug("bytesReceived:" + upload.bytesReceived + " startByte:" + startByte)

  let fileStream;

  // if startByte is 0 or not set, create a new file, otherwise check the size and append to existing one
  if (!startByte) {
    upload.bytesReceived = 0;
    fileStream = fs.createWriteStream(filePath, {
      flags: 'w'
    });
    debug("New file created: " + filePath);
  } else {
    // we can check on-disk file size as well to be sure
    if (upload.bytesReceived != startByte) {
      res.writeHead(400, "Wrong start byte");
      res.end(upload.bytesReceived);
      return;
    }
    // append to existing file
    fileStream = fs.createWriteStream(filePath, {
      flags: 'a'
    });
    debug("File reopened: " + filePath);
  }


  req.on('data', function(data) {
    debug("bytes received", upload.bytesReceived);
    upload.bytesReceived += data.length;
  });

  // send request body to file
  req.pipe(fileStream);

  // when the request is finished, and all its data is written
  fileStream.on('close', function() {
    if (upload.bytesReceived == req.headers['x-file-size']) {
      debug("Upload finished");
      delete uploads[fileId];

      // can do something else with the uploaded file here

      res.end("Success " + upload.bytesReceived);
    } else {
      // connection lost, we leave the unfinished file around
      debug("File unfinished, stopped at " + upload.bytesReceived);
      res.end();
    }
  });

  // in case of I/O error - finish the request
  fileStream.on('error', function(err) {
    debug("fileStream error");
    res.writeHead(500, "File error");
    res.end();
  });

}

function onStatus(req, res) {
  let fileId = req.headers['x-file-id'];
  let upload = uploads[fileId];
  debug("onStatus fileId:", fileId, " upload:", upload);
  if (!upload) {
    res.end("0")
  } else {
    res.end(String(upload.bytesReceived));
  }
}


function accept(req, res) {
  if (req.url == '/status') {
    onStatus(req, res);
  } else if (req.url == '/upload' && req.method == 'POST') {
    onUpload(req, res);
  } else {
    fileServer.serve(req, res, function (err, result) {
      
    // ** server side render
      res.sendFile(__dirname + '/index.html')

      if (err) { // There was an error serving the file
          console.error("Error serving " + req.url + " - " + err.message);
 
          // Respond to the client
          res.writeHead(err.status, err.headers);
          res.end();
        }
    });
  }

}


// ** create a web service with firebase cloud functions
exports.sws = functions.https.onRequest(accept);

// -----------------------------------

// if (!module.parent) {
  // ** create local server
  // http.createServer(accept).listen(8000);

  // exports.sws = functions.https.onRequest(accept);
  // console.log('Server working in google firebase cloud functions');
// } else {
  // exports.accept = accept;
// }


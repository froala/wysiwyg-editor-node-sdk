var express = require('express');
var app = express();
var cors = require('cors')
var FroalaEditor = require('../lib/editor.js');

app.use(cors());

app.post('/upload_image', function (req, res) {

  FroalaEditor.uploadImage(req, res);
  // or call FroalaEditor.uploadImage(req, res, options);
});

app.post('/upload_file', function (req, res) {

  FroalaEditor.uploadFile(req, res);
  // or call FroalaEditor.uploadFile(req, res, options);
});

// generic upload
app.post('/upload', function (req, res) {

  FroalaEditor.upload(req, res);
  // or call FroalaEditor.upload(req, res, options);
});

app.get('/uploads/:filename', function (req, res) {

  res.sendFile(path.join(__dirname, req.params.filename));
});

app.listen(3000, function () {
  console.log('Example app listening on port 3000!');
});
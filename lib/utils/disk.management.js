var utils = require('./utils.js');
var Busboy = require('busboy');
var merge = require('merge');
var path = require('path');
var fs = require('fs');
var sha1 = require('sha1');
var gm = require('gm').subClass({imageMagick: true});

/**
* Generic upload to disk.
*
* @param req request stream
* @param fileRoute string
* @param options [optional]
*   {
*     validation: array OR function
*     resize: array [only for images]
*   }
* @param callback returns {link: 'linkPath'} or error string
*/
function upload(req, fileRoute, options, callback) {

  var saveToPath = null;

  var errorMessage = null;
  function handleStreamError(error) {

    if (errorMessage) {
      return;
    }
    errorMessage = error;

    // Cleanup.
    if (saveToPath) {
      return fs.unlink(saveToPath, function (err) {
        return callback(errorMessage);
      });
    }

    return callback(errorMessage);
  }


  try {
    var busboy = new Busboy({ headers: req.headers });
  } catch(e) {
    return callback(e);
  }

  // This is used for sending response.
  var link = null;
  var error = null;

  // Handle file arrival.
  busboy.on('file', function(fieldname, file, filename, encoding, mimetype) {
        
    // Validate uploaded file.
    if (
      options.validation &&
      !utils.handleValidation(options.validation, filename, mimetype)
    ) {

      // Stop receiving from this stream.
      file.resume();
      return callback('File does not meet the validation.');
    }

    // Generate link.
    var randomName = sha1(new Date().getTime()) + '.' + utils.getExtension(filename);
    link = fileRoute + randomName;
    
    var appDir = path.dirname(require.main.filename);
    // Generate path where the file will be saved.
    saveToPath = path.join(appDir, link);

    // Pipe reader stream (file from client) into writer stream (file from disk).
    file.on('error', handleStreamError);

    var diskWriterStream = fs.createWriteStream(saveToPath);
    diskWriterStream.on('error', handleStreamError);
    diskWriterStream.on('finish', function() {
      return callback(null, {link: link});
    })

    if (options.resize && mimetype != 'image/svg+xml') {

      var gmFile = gm(file);
      var imageResizeStream = gmFile
                    .resize.apply(gmFile, options.resize)
                    .stream();
      imageResizeStream.on('error', handleStreamError);

      imageResizeStream.pipe(diskWriterStream);
    } else {
      file.pipe(diskWriterStream);
    }
    

  });

  // Handle file upload termination.
  busboy.on('error', handleStreamError);
  req.on('error', handleStreamError);

  // Pipe reader stream into writer stream.
  return req.pipe(busboy);
}

/**
* Delete file from disk.
*
* @param src string path to file
* @param callback returns null/undefined or error string
*/
var _delete = function(src, callback) {

  fs.unlink(path.join(path.dirname(require.main.filename), src), function (err) {

      if (err) {
          return callback(err);
      }
      return callback();
  });
}


// Exporting:

exports['delete'] = _delete;
exports.upload = upload;

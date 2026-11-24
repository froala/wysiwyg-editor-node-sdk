var utils = require('./utils.js');
var busboy = require('busboy');
var merge = require('merge');
var path = require('path');
var fs = require('fs');
var sha1 = require('sha1');
var sharp = require('sharp');

// The resize option keeps the [width, height, flag] shape it had with gm/ImageMagick.
// No flag fits the image inside the box keeping its aspect ratio.
var RESIZE_FLAGS = {
  '!': { fit: 'fill' },
  '^': { fit: 'outside' },
  '>': { fit: 'inside', withoutEnlargement: true },
  '<': { fit: 'inside', withoutReduction: true }
};

function toDimension(value) {
  return value === undefined || value === null || value === '' ? null : Number(value);
}

function createResizer(resize) {
  var flag = resize[2];
  var fit = flag ? RESIZE_FLAGS[flag] : { fit: 'inside' };

  if (!fit) {
    throw new Error('Unsupported resize option: ' + flag);
  }

  return sharp({ animated: true }).resize(merge(true, fit, {
    width: toDimension(resize[0]),
    height: toDimension(resize[1])
  }));
}

/**
* Upload a file to the specified location.
*
* @param req request stream
* @param fileRoute string
* @param options [optional]
*   {
*     fieldname: string
*     validation: array OR function(filePath, mimetype, callback)
*     resize: array [only for images]
*   }
* @param callback returns {link: 'linkPath'} or error string
*/
function upload(req, fileRoute, options, callback) {

  var saveToPath = null;
  var errorMessage = null;

  // Used for sending response.
  var link = null;

  function handleStreamError(error) {

    // Do not enter twice in here.
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
    var parser = busboy({ headers: req.headers, defParamCharset: 'utf8' });
  } catch(e) {
    return callback(e);
  }

  function sendResponse() {
    callback(null, {link: link});
  }

  // Handle file arrival.
  parser.on('file', function(fieldname, file, info) {
    var filename = info.filename;
    var mimetype = info.mimeType;

    // Check fieldname:
    if (fieldname != options.fieldname) {

      // Stop receiving from this stream.
      file.resume();
      return callback('Fieldname is not correct. It must be: ' + options.fieldname);
    }

    // Build the resizer before anything is written, so a bad option leaves no file behind.
    var resize = options.resize && mimetype !== 'image/svg+xml';
    if (resize) {
      try {
        var imageResizeStream = createResizer(options.resize);
      } catch (e) {
        file.resume();
        return handleStreamError(e.message);
      }
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

      // Validate uploaded file.
      if (options.validation) {

        return utils.isValid(options.validation, saveToPath, mimetype, function(err, status) {

          if (err) {
            return handleStreamError(err);
          }

          if (!status) {
            return handleStreamError('File does not meet the validation.');
          }

          return sendResponse();
        });
      }
      return sendResponse();
    })

    if (resize) {

      imageResizeStream.on('error', function(err) {
        diskWriterStream.destroy();
        handleStreamError(err.message);
      });

      file.pipe(imageResizeStream).pipe(diskWriterStream);
    } else {
      file.pipe(diskWriterStream);
    }
  });

  // Handle file upload termination.
  parser.on('error', handleStreamError);
  req.on('error', handleStreamError);

  // Pipe reader stream into writer stream.
  return req.pipe(parser);
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

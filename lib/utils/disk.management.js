var utils = require('./utils.js');
var Busboy = require('busboy');
var merge = require('merge');
var path = require('path');
var fs = require('fs');
var sha1 = require('sha1');
var gm = require('gm').subClass({imageMagick: true});

/**

Generic upload to disk.

@param req request stream
@param options 
  {
    fileRoute: string
    validation: string: 'file', 'image'. OR function
  }
@param callback
*/
function upload(req, options, callback) {

  var saveToPath = null;

  var errorMessage = null;
  function handleStreamError(error) {

    if (errorMessage) {
      return;
    }
    errorMessage = error;

    // cleanup
    if (saveToPath) {
      return fs.unlink(saveToPath, function (err) {
        return callback(errorMessage);
      });
    }

    // callback
    return callback(errorMessage);
  }


  // merge options with default options
  options = merge(utils.defaultUploadOptions, options);

  try {
    var busboy = new Busboy({ headers: req.headers });
  } catch(e) {
    return callback(e);
  }

  // this is used for sending response
  var link = null;
  var error = null;

  // handle file arrival
  busboy.on('file', function(fieldname, file, filename, encoding, mimetype) {
        
    // validate uploaded file
    if (!utils.handleValidation(options.validation, filename, mimetype)) {

      // stop receiving from this stream
      file.resume();
      return callback('File does not meet the validation.');
    }

    // generate link
    var randomName = sha1(new Date().getTime()) + '.' + utils.getExtension(filename);
    link = options.fileRoute + randomName;
    
    var appDir = path.dirname(require.main.filename);
    // generate path where the file will be saved
    saveToPath = path.join(appDir, link);

    // pipe reader stream (file from client) into writer stream (file from disk)
    file.on('error', handleStreamError);

    var diskWriterStream = fs.createWriteStream(saveToPath);
    diskWriterStream.on('error', handleStreamError);
    diskWriterStream.on('finish', function() {
      return callback(null, {link: link});
    })

    if (options.resize) {

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

  // handle file upload termination
  busboy.on('error', handleStreamError);
  req.on('error', handleStreamError);

  // pipe reader stream into writer stream
  return req.pipe(busboy);
}

/**

Delete file from disk

@param res response stream
@param fileFolder string
@param fileName string

*/
var _delete = function(src, callback) {

  fs.unlink(path.join(path.dirname(require.main.filename), src), function (err) {

      if (err) {
          return callback(err);
      }
      return callback();
  });
}

function list(folderName, callback) {

  // TODO problem: callback hell + too hackish ---> use async lib instead

  var images = [];

  var absoluteFolderName = path.join(path.dirname(require.main.filename), folderName);
  fs.readdir(absoluteFolderName, function(err, list) {

    if (err) {
      return callback(err);
    }

    if (!list || !list.length) {
      return callback(null, images);
    }

    var errObj = null;
    var step = 0;
    list.forEach(function(fileName) {

      var extension = utils.getExtension(fileName).toLowerCase();

      fs.stat(path.join(absoluteFolderName, fileName), function(err, stats) {

        if (err) {
          errObj = err;
        } else if (stats.isFile() && utils.allowedImageExts.indexOf(extension) != -1) {
          images.push({
            url: folderName + fileName,
            thumb: folderName + fileName,
            tag: fileName
          })
        }

        step++;
        if (step == list.length) {

          if (errObj) {
            return callback(err);
          }
          return callback(null, images);
        }
      });
    });
  });
}

// exporting:
exports['delete'] = _delete;
exports.upload = upload;
exports.list = list;
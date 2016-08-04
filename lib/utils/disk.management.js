var utils = require('./utils.js');
var Busboy = require('busboy');
var merge = require('merge');
var path = require('path');
var fs = require('fs');
var sha1 = require('sha1');

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

  //TODO add error handling on the stream: eg: the user stops sending file, disk space exceeded

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
      return file.resume();
    }

    // generate link
    var randomName = sha1(new Date().getTime()) + utils.getExtension(filename);
    link = options.fileRoute + randomName;
    
    var appDir = path.dirname(require.main.filename);
    // generate path where the file will be saved
    var saveTo = path.join(appDir, link);

    // pipe reader stream (file from client) into writer stream (file from disk)
    file.pipe(fs.createWriteStream(saveTo));
  });

  // handle file upload termination
  busboy.on('finish', function() {

    // the file stream was resumed
    if (!link) {

      // send fail
      return callback('File does not meet the validation.');
    }
    
    // send success
    return callback(null, {link: link});
  });

  // pipe reader stream into writer stream
  return req.pipe(busboy);
}

/**

Delete file from disk

@param res response stream
@param fileFolder string
@param fileName string

*/
var doDelete = function(src, callback) {

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
      fs.stat(path.join(absoluteFolderName, fileName), function(err, stats) {

        if (err) {
          errObj = err;
        } else if (stats.isFile()) {
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
exports['delete'] = doDelete;
exports.upload = upload;
exports.list = list;
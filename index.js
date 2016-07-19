var Busboy = require('busboy');
var merge = require('merge');
var path = require('path');
var fs = require('fs');
var sha1 = require('sha1');

function isFileValid(filename, mimetype) {

	var allowedExts = ['gif', 'jpeg', 'jpg', 'png', 'blob'];
	var allowedMimeTypes = ['image/gif', 'image/jpeg', 'image/pjpeg', 'image/x-png', 'image/png'];

	var fileExtension = getFileExtension(filename);

	return allowedExts.indexOf(fileExtension.toLowerCase()) != -1  &&
		   allowedMimeTypes.indexOf(mimetype) != -1
	;

}

function getFileExtension(filename) {
	return filename.split('.').pop();
}

var defaultImageOptions = {
	fileFolder: null,
	fileRoute: '/uploads/'
}

/**
@param req request stream
@param res response stream
@param options 
	{
		fileFolder: string

	}
*/
function uploadImage(req, res, options) {

	options = merge(defaultImageOptions, options);

	var busboy = new Busboy({ headers: req.headers });
	var link = null;

	busboy.on('file', function(fieldname, file, filename, encoding, mimetype) {

		if (!isFileValid(filename, mimetype)) {

			file.resume();
			return res.status(400).json({status: "error"});
		}

		var randomName = sha1(new Date().getTime()); //+ '.' + getFileExtension(filename);
		link = options.fileRoute + randomName;

		var saveTo = path.join(options.fileFolder || __dirname, randomName);
		file.pipe(fs.createWriteStream(saveTo));
	});

	busboy.on('finish', function() {

		res.send({link: link});
	});

	return req.pipe(busboy);
}


exports.uploadImage = uploadImage;
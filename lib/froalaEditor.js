var merge = require('merge');

// New modules will be inserted into this array as entry points to them.
var modules = [
  require('./file.js'),
  require('./image.js'),
  require('./s3.js'),
  require('./video.js'),
  require('./collaborative.js'),
  require('./collab_persistence.js'),
  require('./version_history.js'),
  require('./async_save.js')
];

// Merge modules functionalities.
var exposedFunctionality = {};
modules.forEach(function(moduleFunctionality) {
  exposedFunctionality = merge(moduleFunctionality, exposedFunctionality);
});

module.exports = exposedFunctionality;
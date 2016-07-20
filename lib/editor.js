var merge = require('merge');

// new modules will be inserted into this array as entry points to them
var modules = [
  require('./upload.js')
];

// merge modules functionalities
var exposedFunctionality = {};
modules.forEach(function(moduleFunctionality) {
  exposedFunctionality = merge(moduleFunctionality, exposedFunctionality);
});

module.exports = exposedFunctionality;
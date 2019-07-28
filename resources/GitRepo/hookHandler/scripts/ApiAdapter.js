'use strict';

var self = ApiAdapter;
module.exports = self;

var async = require('async');
var request = require('request');
var util = require('util');

function ApiAdapter(token) {
  console.log('Initializing', self.name);

  // Initialize if token is provided, its a public adapter otherwise.
  if (token)
    this.token = token;
}

var baseUrl = process.env.api_url;

/***********************/
/*     HTTP METHODS    */
/***********************/
/* GET PUT POST DELETE */
/***********************/

// generic GET method
ApiAdapter.prototype.get = function (relativeUrl, callback) {
  console.log('GET data', relativeUrl);
  var opts = {
    method: 'GET',
    url: relativeUrl.indexOf('http') === 0 ?
      relativeUrl : baseUrl + relativeUrl,
    headers: {
      'Content-Type': 'application/json; charset=utf-8'
    }
  };

  // Only set a token for non-public adapter.
  if (this.token)
    /*jshint -W069 */
    opts.headers['Authorization'] = 'apiToken ' + this.token;
    /*jshint +W069 */

  var bag = {
    opts: opts,
    relativeUrl: relativeUrl,
    token: this.token
  };

  async.series([
      _performCall.bind(null, bag),
      _parseResponse.bind(null, bag)
    ],
    function () {
      callback(bag.err, bag.parsedBody, bag.res);
    }
  );
};

// generic POST method
ApiAdapter.prototype.post = function (relativeUrl, json, callback) {
  console.log('POST data', relativeUrl);
  var opts = {
    method: 'POST',
    url: relativeUrl.indexOf('http') === 0 ?
      relativeUrl : baseUrl + relativeUrl,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Authorization': 'apiToken ' + this.token
    },
    json: json
  };
  var bag = {
    opts: opts,
    relativeUrl: relativeUrl,
    token: this.token
  };

  async.series([
      _performCall.bind(null, bag),
      _parseResponse.bind(null, bag)
    ],
    function () {
      callback(bag.err, bag.parsedBody, bag.res);
    }
  );
};

// generic PUT method
ApiAdapter.prototype.put = function (relativeUrl, json, callback) {
  console.log('PUT data', relativeUrl);
  var opts = {
    method: 'PUT',
    url: relativeUrl.indexOf('http') === 0 ?
      relativeUrl : baseUrl + relativeUrl,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Authorization': 'apiToken ' + this.token
    },
    json: json
  };
  var bag = {
    opts: opts,
    relativeUrl: relativeUrl,
    token: this.token
  };

  async.series([
      _performCall.bind(null, bag),
      _parseResponse.bind(null, bag)
    ],
    function () {
      callback(bag.err, bag.parsedBody, bag.res);
    }
  );
};

// generic DELETE method
ApiAdapter.prototype.delete = function (relativeUrl, callback) {
  var opts = {
    method: 'DELETE',
    url: relativeUrl.indexOf('http') === 0 ?
      relativeUrl : baseUrl + relativeUrl,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Authorization': 'apiToken ' + this.token
    }
  };

  var bag = {
    opts: opts,
    relativeUrl: relativeUrl,
    token: this.token
  };

  async.series([
      _performCall.bind(null, bag),
      _parseResponse.bind(null, bag)
    ],
    function () {
      callback(bag.err, bag.parsedBody, bag.res);
    }
  );
};

// common helper methods
function _performCall(bag, next) {
  var who = self.name + '|' + _performCall.name;
  console.log('Inside', who);

  bag.startedAt = Date.now();
  request(bag.opts,
    function (err, res, body) {
      var interval = Date.now() - bag.startedAt;
      console.log('Request ' + bag.opts.method + ' ' +
        bag.relativeUrl + ' took ' + interval +
        ' ms and returned HTTP status ' + (res && res.statusCode));

      bag.res = res;
      bag.body = body;
      bag.statusCode = res && res.statusCode;
      if (res && res.statusCode > 299) err = err || res.statusCode;
      if (err) {
        console.log('Returned status', err,
          'for request', bag.relativeUrl);
        bag.err = err;
      }
      return next();
    }
  );
}

function _parseResponse(bag, next) {
  var who = self.name + '|' + _parseResponse.name;
  console.log('Inside', who);

  if (bag.err)
    bag.err = bag.opts.method + ' ' + bag.relativeUrl + ' returned ' + bag.err;

  if (bag.body) {
    if (typeof bag.body === 'object') {
      bag.parsedBody = bag.body;
      if (bag.err && bag.parsedBody && bag.parsedBody.id)
        bag.err = bag.parsedBody;
    } else {
      try {
        bag.parsedBody = JSON.parse(bag.body);
        if (bag.err && bag.parsedBody && bag.parsedBody.id)
          bag.err = bag.parsedBody;
      } catch (e) {
        if (!bag.err)
          console.log('Unable to parse bag.body', bag.body, e);
        bag.err = bag.err || 'Could not parse response';
      }
    }
  }

  if (bag.err)
    bag.err.statusCode = bag.statusCode;

  return next();
}

/***************************/
/*         ROUTES          */
/***************************/
/* Sorted alphabetically   */
/* by object name          */
/***************************/

// hooks
ApiAdapter.prototype.getHookById =
  function (hookId, callback) {
    var url = '/hooks/' + hookId;
    this.get(url, callback);
  };

// projectIntegrations
ApiAdapter.prototype.getProjectIntegrationById =
  function (projectIntegrationId, callback) {
    var url = '/projectIntegrations/' + projectIntegrationId;
    this.get(url, callback);
  };

// resources
ApiAdapter.prototype.getResourceById =
  function (resourceId, callback) {
    var url = '/resources/' + resourceId;
    this.get(url, callback);
  };

ApiAdapter.prototype.getResources =
  function (query, callback) {
    var url = '/resources?' + query;
    this.get(url, callback);
  };

// resourceVersions
ApiAdapter.prototype.getResourceVersions =
  function (query, callback) {
    var url = '/resourceVersions?' + query;
    this.get(url, callback);
  };

ApiAdapter.prototype.getResourceVersionById =
  function (resourceVersionId, callback) {
    var url = '/resourceVersions/' + resourceVersionId;
    this.get(url, callback);
  };

// resourceVersions
ApiAdapter.prototype.postResourceVersion =
  function (json, callback) {
    var url = '/resourceVersions';
    this.post(url, json, callback);
  };

//system Codes
ApiAdapter.prototype.getSystemCodes =
  function (callback) {
    this.get(
      util.format('/systemCodes'),
      callback
    );
  };

// vortex
ApiAdapter.prototype.postToVortex = function (where, message, callback) {
  var json = {
    where: where,
    payload: message
  };
  var url = '/vortex';
  this.post(url, json, callback);
};

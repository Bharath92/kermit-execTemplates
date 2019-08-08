'use strict';

var async = require('async');
var request = require('request');
var _ = require('underscore');

function Bitbucket(appPassword, url, username) {
  appPassword = typeof appPassword === 'string' ? appPassword : '';
  username = typeof username === 'string' ? username : '' + username;

  if (!appPassword)
    console.log('Bitbucket app password is required.');

  if (!username)
    console.log('Bitbucket username is required.');

  this.baseUrlv2 = url + '/2.0';

  this.token = new Buffer(username + ':' + appPassword).toString('base64');
}

Bitbucket.prototype.get = function (url, options, callback) {
  var self = this;
  console.log('GET ' + url);

  var retryOpts = {
    times: options && options.retry ? 5 : 1,
    interval: function (retryCount) {
      return Math.pow(2, retryCount) * 1000;
    }
  };

  async.retry(retryOpts,
    function (retryCallback) {
      var bag = {
        opts: {
          method: 'GET',
          url: url,
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Authorization': 'Basic ' + self.token,
            'User-Agent': 'JFrog Pipelines'
          }
        }
      };

      async.series([
          _performCall.bind(null, bag),
          _parseResponse.bind(null, bag)
        ],
        function () {
          var result = {
            res: bag.res,
            body: bag.body
          };
          return retryCallback(bag.err, result);
        }
      );
    },
    function (err, result) {
      return callback(err, result.body, result.res);
    }
  );
};

Bitbucket.prototype.post = function (url, body, callback) {
  var self = this;
  console.log('POST ' + url);

  var bag = {
    opts: {
      method: 'POST',
      url: url,
      followAllRedirects: true,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Authorization': 'Basic ' + self.token,
        'User-Agent': 'JFrog Pipelines'
      },
      json: body
    }
  };

  async.series([
      _performCall.bind(null, bag),
      _parseResponse.bind(null, bag)
    ],
    function () {
      callback(bag.err, bag.body, bag.res);
    }
  );
};

Bitbucket.prototype.del = function (url, callback) {
  var self = this;
  console.log('DELETE ' + url);

  var bag = {
    opts: {
      method: 'DELETE',
      url: url,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Authorization': 'Basic ' + self.token,
        'User-Agent': 'JFrog Pipelines'
      }
    }
  };

  async.series([
      _performCall.bind(null, bag),
      _parseResponse.bind(null, bag)
    ],
    function () {
      callback(bag.err, bag.body, bag.res);
    }
  );
};

// common helper methods
function _performCall(bag, next) {
  var who = _performCall.name;
  console.log('Inside', who);

  bag.startedAt = Date.now();
  request(bag.opts,
    function (err, res, body) {
      var interval = Date.now() - bag.startedAt;
      console.log('Request ' + bag.opts.method + ' ' +
        bag.opts.url + ' took ' + interval +
        ' ms and returned HTTP status ' + (res && res.statusCode));

      bag.res = res;
      bag.body = body;
      if (res && res.statusCode > 299)
        err = err || res.statusCode;

      if (err) {
        console.log('Bitbucket returned status', err,
          'for request', bag.who);
        bag.err = err;
      }

      return next();
    }
  );
}

function _parseResponse(bag, next) {
  var who = _parseResponse.name;
  console.log('Inside', who);

  if (bag.res && bag.res.headers['content-type']) {
    var contentType = bag.res.headers['content-type'];
    if (contentType.indexOf('application/json') >= 0) {
      if (typeof bag.body !== 'object' && !bag.err) {
        try {
          bag.body = JSON.parse(bag.body);
        } catch (e) {
          console.log('Unable to parse bag.body', bag.body, e);
          bag.err = e;
        }
      }
    } else if (contentType.indexOf('text/html') >= 0) {
      bag.body = 'Filtered by adapter because the returned ' +
        ' content-type is ' + contentType;
    }
  }

  if (bag.err && _.isObject(bag.err))
    bag.err.data = bag.body;

  return next();
}

Bitbucket.prototype.getRepository = function (owner, repo, callback) {
  var url = this.baseUrlv2 + '/repositories/' + owner + '/' + repo;
  this.get(url, {}, callback);
};

Bitbucket.prototype.getBranchSha = function (owner, repo, ref, callback) {
  var url = this.baseUrlv2 +
    '/repositories/' + owner + '/' + repo + '/refs/branches/' + ref;
  this.get(url, {}, callback);
};

Bitbucket.prototype.delWebhook = function (owner, repo, hookId, callback) {
  var url = this.baseUrlv2 + '/repositories/' + owner + '/' + repo +
    '/hooks/' + hookId;
  this.del(url, callback);
};

Bitbucket.prototype.postWebhook = function (
  owner, repo, url, fields, callback) {
  var finishedUrl = this.baseUrlv2 + '/repositories/' + owner + '/' +
    repo + '/hooks/';

  this.post(finishedUrl, fields, callback);
};

Bitbucket.prototype.getHooks = function (owner, repo, callback) {
  var url = this.baseUrlv2 + '/repositories/' + owner + '/' + repo +
    '/hooks';
  this.get(url, {}, callback);
};

module.exports = Bitbucket;

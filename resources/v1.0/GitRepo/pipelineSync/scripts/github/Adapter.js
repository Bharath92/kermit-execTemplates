'use strict';
var self = Adapter;
module.exports = self;

var async = require('async');
var request = require('request');
var _ = require('underscore');
var util = require('util');

var parseLinks = require('parse-links');

function Adapter(token, url) {
  this.token = token;
  if (url)
    this.baseUrl = url;
  else
    console.log('GitHub API endpoint URL is required.');
}

Adapter.prototype.get = function (relativeUrl, options, callback) {
  var opts = {
    method: 'GET',
    url: relativeUrl.indexOf('http') === 0 ? relativeUrl : this.baseUrl +
      relativeUrl,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'User-Agent': 'JFrog Pipelines',
      'Accept': 'application/vnd.GithubProvider.v3'
    }
  };

  if (!_.isEmpty(this.token))
    opts.headers.Authorization = 'token ' + this.token;

  var bag = {
    opts: opts,
    relativeUrl: relativeUrl,
    token: this.token,
    retry: options && options.retry
  };

  bag.who = util.format('github|%s|GET|url:%s', self.name, relativeUrl);
  console.log('Starting', bag.who);

  async.series([
      _performCall.bind(null, bag),
      _parseResponse.bind(null, bag)
    ],
    function () {
      console.log('Completed', bag.who);
      callback(bag.err, bag.parsedBody, bag.headerLinks, bag.res);
    }
  );
};

Adapter.prototype.post = function (relativeUrl, json, callback) {
  var opts = {
    method: 'POST',
    url: this.baseUrl + relativeUrl,
    followAllRedirects: true,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Authorization': 'token ' + this.token,
      'User-Agent': 'JFrog Pipelines',
      'Accept': 'application/vnd.GithubProvider.v3'
    },
    json: json
  };
  var bag = {
    opts: opts,
    relativeUrl: relativeUrl,
    token: this.token
  };

  bag.who = util.format('github|%s|POST|url:%s', self.name, relativeUrl);
  console.log('Starting', bag.who);

  async.series([
      _performCall.bind(null, bag),
      _parseResponse.bind(null, bag)
    ],
    function () {
      console.log('Completed', bag.who);
      callback(bag.err, bag.parsedBody, bag.headerLinks, bag.res);
    }
  );
};

Adapter.prototype.put = function (relativeUrl, json, callback) {
  var opts = {
    method: 'PUT',
    url: this.baseUrl + relativeUrl,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Authorization': 'token ' + this.token,
      'User-Agent': 'JFrog Pipelines',
      'Accept': 'application/vnd.GithubProvider.v3'
    },
    json: json
  };
  var bag = {
    opts: opts,
    relativeUrl: relativeUrl,
    token: this.token
  };

  bag.who = util.format('github|%s|PUT|url:%s', self.name, relativeUrl);
  console.log('Starting', bag.who);

  async.series([
      _performCall.bind(null, bag),
      _parseResponse.bind(null, bag)
    ],
    function () {
      console.log('Completed', bag.who);
      callback(bag.err, bag.parsedBody, bag.headerLinks, bag.res);
    }
  );
};

Adapter.prototype.del = function (relativeUrl, callback) {
  var opts = {
    method: 'DELETE',
    url: this.baseUrl + relativeUrl,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Authorization': 'token ' + this.token,
      'User-Agent': 'JFrog Pipelines',
      'Accept': 'application/vnd.GithubProvider.v3'
    }
  };

  var bag = {
    opts: opts,
    relativeUrl: relativeUrl,
    token: this.token
  };

  bag.who = util.format('github|%s|DELETE|url:%s', self.name, relativeUrl);
  console.log('Starting', bag.who);

  async.series([
      _performCall.bind(null, bag),
      _parseResponse.bind(null, bag)
    ],
    function () {
      console.log('Completed', bag.who);
      callback(bag.err, bag.parsedBody, bag.res);
    }
  );
};

// common helper methods
function _performCall(bag, next) {
  var who = bag.who + '|' + _performCall.name;
  console.log('Inside', who);

  bag.startedAt = Date.now();

  var retryOpts = {
    times: bag.retry ? 5: 1,
    interval: function (retryCount) {
      return Math.pow(2, retryCount) * 1000;
    }
  };

  async.retry(retryOpts,
    function (callback) {
      request(bag.opts,
        function (err, res, body) {
          var interval = Date.now() - bag.startedAt;
          console.log('Request ' + bag.opts.method + ' ' +
            bag.opts.url + ' took ' + interval +
            ' ms and returned HTTP status ' + (res && res.statusCode));

          if (res && res.statusCode > 299)
            err = err || res.statusCode;
          if (err)
            console.log(who, 'GitHub returned status', err);

          bag.err = err;
          bag.res = res;
          bag.body = body;
          return callback(err);
        }
      );
    },
    function () {
      return next();
    }
  );
}

function _parseResponse(bag, next) {
  var who = bag.who + '|' + _parseResponse.name;
  console.log('Inside', who);

  if (bag.res && bag.res.headers.link)
    bag.headerLinks = parseLinks(bag.res.headers.link);

  if (bag.body) {
    if (typeof bag.body === 'object') {
      bag.parsedBody = bag.body;
    } else {
      try {
        bag.parsedBody = JSON.parse(bag.body);
      } catch (e) {
        console.log('Unable to parse bag.body', bag.body, e);
        bag.err = e;
      }
    }
  }
  return next();
}

Adapter.prototype.getRateLimit = function (callback) {
  this.get('/rate_limit', {}, callback);
};

Adapter.prototype.getRepository = function (fullRepoName, callback) {
  this.get('/repos/' + fullRepoName, {}, callback);
};

Adapter.prototype.postHook = function (owner, repo, apiUrl, callback) {
  var url = '/repos/' + owner + '/' + repo + '/hooks';
  // request parameter name has a default value web
  var body = {
    events: ['push', 'pull_request', 'release'],
    config: {
      url: apiUrl
    }
  };
  this.post(url, body, callback);
};

Adapter.prototype.deleteHook = function (owner, repo, hookId, callback) {
  var url = '/repos/' + owner + '/' + repo + '/hooks/' + hookId;
  this.del(url, callback);
};

Adapter.prototype.getHooks = function (owner, repo, callback) {
  var url = '/repos/' + owner + '/' + repo + '/hooks';
  this.get(url, {}, callback);
};

Adapter.prototype.getReference =
  function (owner, repo, branch, callback) {
    if (branch)
      branch = encodeURIComponent(branch);
    var url = '/repos/' + owner + '/' + repo + '/git/refs/heads/' + branch;
    this.get(url, {}, callback);
  };

Adapter.prototype.getCommitContent =
  function (owner, repo, sha, callback) {
    var url = '/repos/' + owner + '/' + repo + '/commits/' + sha;
    this.get(url, {}, callback);
  };

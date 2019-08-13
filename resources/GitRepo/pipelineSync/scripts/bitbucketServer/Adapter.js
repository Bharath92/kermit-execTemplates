'use strict';
var self = Adapter;
module.exports = self;

var request = require('request');
var parseLinks = require('parse-links');
var _ = require('underscore');
var async = require('async');
var urlParser = require('url');
var util = require('util');


function Adapter(integrationValues, url) {
  var basicAuth = new Buffer(integrationValues.username + ':' +
    integrationValues.password).toString('base64');
  this.authorizationHeader = 'Basic ' + basicAuth;

  if (!url)
    console.log('Bitbucket Server API endpoint URL is required.');
  else
    this.baseUrl = url;

  this.v1ApiPrefix = '/rest/api/1.0';
  this.v1KeysPrefix = '/rest/keys/1.0';
}

// basic get/post/delete/put methods
Adapter.prototype.get = function (relativeUrl, json, callback) {
  var opts = {
    method: 'GET',
    url: relativeUrl.indexOf('http') === 0 ? relativeUrl : this.baseUrl +
      relativeUrl,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Authorization': this.authorizationHeader,
      'User-Agent': 'JFrog Pipelines'
    },
    json: json
  };

  var bag = {
    opts: opts,
    relativeUrl: relativeUrl
  };

  bag.who = util.format('bitbucketServer|%s|GET|url:%s', self.name,
    relativeUrl);
  console.log('Starting', bag.who);

  async.series([
      _performCall.bind(null, bag),
      _parseResponse.bind(null, bag)
    ],
    function () {
      console.log('Completed', bag.who);
      return callback(bag.err, bag.parsedBody, bag.headerLinks, bag.res);
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
      'Authorization': this.authorizationHeader,
      'User-Agent': 'JFrog Pipelines'
    },
    json: json
  };
  var bag = {
    opts: opts,
    relativeUrl: relativeUrl
  };

  bag.who = util.format('bitbucketServer|%s|POST|url:%s', self.name,
    relativeUrl);
  console.log('Starting', bag.who);

  async.series([
      _performCall.bind(null, bag),
      _parseResponse.bind(null, bag)
    ],
    function () {
      console.log('Completed', bag.who);
      return callback(bag.err, bag.parsedBody, bag.headerLinks, bag.res);
    }
  );
};

Adapter.prototype.put = function (relativeUrl, json, callback) {
  var opts = {
    method: 'PUT',
    url: this.baseUrl + relativeUrl,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Authorization': this.authorizationHeader,
      'User-Agent': 'JFrog Pipelines'
    },
    json: json
  };
  var bag = {
    opts: opts,
    relativeUrl: relativeUrl
  };

  bag.who = util.format('bitbucketServer|%s|PUT|url:%s',
    self.name, relativeUrl);
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

Adapter.prototype.delete = function (relativeUrl, callback) {
  var opts = {
    method: 'DELETE',
    url: this.baseUrl + relativeUrl,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Authorization': this.authorizationHeader,
      'User-Agent': 'JFrog Pipelines'
    }
  };

  var bag = {
    opts: opts,
    relativeUrl: relativeUrl
  };

  bag.who = util.format('bitbucketServer|%s|DELETE|url:%s', self.name,
    relativeUrl);
  console.log('Starting', bag.who);

  async.series([
      _performCall.bind(null, bag),
      _parseResponse.bind(null, bag)
    ],
    function () {
      console.log('Completed', bag.who);
      return callback(bag.err, bag.parsedBody, bag.res);
    }
  );
};

// Projects
Adapter.prototype.getProjectBranches = function (projectKey, repoSlug,
  callback) {

  var url = util.format('%s/projects/%s/repos/%s/branches',
    this.v1ApiPrefix, projectKey, repoSlug);
  var self = this;
  this.get(url, {}, _onResponse);

  var branches = [];
  function _onResponse(err, body) {
    if (err)
      return callback(err, body);

    branches = branches.concat(body.values);
    if (_.has(body, 'values') && body.isLastPage === false &&
        _.has(body, 'nextPageStart'))
      return self.get(url + '?start=' + body.nextPageStart, {}, _onResponse);
    else
      return callback(err, branches);
  }
};

Adapter.prototype.getCommits = function (projectKey, repoSlug, branchName,
  callback) {
  var url = util.format('%s/projects/%s/repos/%s/commits/%s',
    this.v1ApiPrefix, projectKey, repoSlug, branchName);
  this.get(url, {}, callback);
};

Adapter.prototype.getHooks = function (projectKey, repoSlug, callback) {
  var url = util.format('%s/projects/%s/repos/%s/webhooks', this.v1ApiPrefix,
    projectKey, repoSlug);
  var self = this;
  this.get(url, {}, _onResponse);

  var hooks = [];
  function _onResponse(err, body) {
    if (err)
      return callback(err, body);

    hooks = hooks.concat(body.values);
    if (_.has(body, 'values') && body.isLastPage === false &&
        _.has(body, 'nextPageStart'))
      return self.get(url + '?start=' + body.nextPageStart, {}, _onResponse);
    else
      return callback(err, hooks);
  }
};

Adapter.prototype.enableHook = function (projectKey, repoSlug, webhookUrl,
  callback) {
  var url;
  var body = {
    url: webhookUrl
  };

  url = util.format('%s/projects/%s/repos/%s/webhooks', this.v1ApiPrefix,
    projectKey, repoSlug);
  body.name = 'JFrog Pipelines webhook';
  body.active = true;
  body.events = ['repo:refs_changed', 'pr:opened', 'pr:declined'];
  body.configuration = {
    secret: urlParser.parse(webhookUrl).auth
  };

  this.post(url, body, callback);
};

Adapter.prototype.disableHook = function (projectKey, repoSlug, webhookUrlKey,
  callback) {
  var url = util.format('%s/projects/%s/repos/%s/webhooks/%s',
    this.v1ApiPrefix, projectKey, repoSlug, webhookUrlKey);

  this.delete(url, callback);
};

// common helper methods
function _performCall(bag, next) {
  var who = bag.who + '|' + _performCall.name;
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
      if (res && res.statusCode > 299) err = err || res.statusCode;
      if (err) {
        console.log('Bitbucket Server returned status', err,
          'for request', bag.who);
        bag.err = err;
      }
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
        bag.parsedBody = bag.body;
      }
    }
  }
  return next();
}

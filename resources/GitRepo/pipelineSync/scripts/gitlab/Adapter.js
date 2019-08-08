'use strict';
var self = Adapter;
module.exports = self;

var async = require('async');
var request = require('request');
var util = require('util');

var querystring = require('querystring');
var parseLinks = require('parse-links');

function Adapter(token, url) {
  this.token = token;
  if (url) {
    console.log(
      util.format('Inside gitlab|Adapter: Using %s url', url)
    );
    this.baseUrl = url;

    this.gitlabVersion = 'v3';
    if (this.baseUrl.endsWith('v4'))
      this.gitlabVersion = 'v4';
  } else {
    console.log('GitLab API endpoint URL is required.');
  }
}

Adapter.prototype.visibilityLevels = {
  PRIVATE: 0,
  INTERNAL: 10,
  PUBLIC: 20
};

Adapter.prototype.groupAccessLevels = {
  GUEST: 10,
  REPORTER: 20,
  DEVELOPER: 30,
  MASTER: 40,
  OWNER: 50
};

// Commenting out authorization headers for pm issue 9565
Adapter.prototype.get = function (relativeUrl, options, callback) {
  var opts = {
    method: 'GET',
    url: relativeUrl.indexOf('http') === 0 ? relativeUrl : this.baseUrl +
      relativeUrl,
    headers: {
      'Private-Token': this.token,
      'PRIVATE-TOKEN': this.token,
      'Content-Type': 'application/json; charset=utf-8',
      'User-Agent': 'JFrog Pipelines',
      'Accept': 'application/json'
    }
  };

  var bag = {
    opts: opts,
    relativeUrl: relativeUrl,
    token: this.token,
    retry: options && options.retry
  };

  bag.who = util.format('gitlab|%s|GET|url:%s', self.name, relativeUrl);
  console.log(bag.who, 'Starting');

  async.series([
      _performCall.bind(null, bag),
      _parseResponse.bind(null, bag)
    ],
    function () {
      console.log(bag.who, 'Completed');
      return callback(bag.err, bag.parsedBody, bag.headerLinks, bag.res);
    }
  );
};

Adapter.prototype.post = function (relativeUrl, json, callback) {
  var opts = {
    method: 'POST',
    url: this.baseUrl + relativeUrl,
    headers: {
      'Private-Token': this.token,
      'Content-Type': 'application/json; charset=utf-8',
      'User-Agent': 'JFrog Pipelines',
      'Accept': 'application/json'
    },
    json: json
  };

  var bag = {
    opts: opts,
    relativeUrl: relativeUrl,
    token: this.token
  };

  bag.who = util.format('gitlab|%s|POST|url:%s', self.name,
    relativeUrl);
  console.log(bag.who, 'Starting');

  async.series([
      _performCall.bind(null, bag),
      _parseResponse.bind(null, bag)
    ],
    function () {
      console.log(bag.who, 'Completed');
      return callback(bag.err, bag.parsedBody, bag.headerLinks, bag.res);
    }
  );
};

Adapter.prototype.put = function (relativeUrl, json, callback) {
  var opts = {
    method: 'PUT',
    url: this.baseUrl + relativeUrl,
    headers: {
      'Private-Token': this.token,
      'Content-Type': 'application/json; charset=utf-8',
      'User-Agent': 'JFrog Pipelines',
      'Accept': 'application/json'
    },
    json: json
  };

  var bag = {
    opts: opts,
    relativeUrl: relativeUrl,
    token: this.token
  };

  bag.who = util.format('gitlab|%s|PUT|url:%s', self.name, relativeUrl);
  console.log(bag.who, 'Starting');

  async.series([
      _performCall.bind(null, bag),
      _parseResponse.bind(null, bag)
    ],
    function () {
      console.log(bag.who, 'Completed');
      return callback(bag.err, bag.parsedBody, bag.headerLinks, bag.res);
    }
  );
};

Adapter.prototype.del = function (relativeUrl, callback) {
  var opts = {
    method: 'DELETE',
    url: this.baseUrl + relativeUrl,
    headers: {
      'Private-Token': this.token,
      'Content-Type': 'application/json; charset=utf-8',
      'User-Agent': 'JFrog Pipelines',
      'Accept': 'application/json'
    }
  };

  var bag = {
    opts: opts,
    relativeUrl: relativeUrl,
    token: this.token
  };

  bag.who = util.format('gitlab|%s|DELETE|url:%s', self.name,
    relativeUrl);
  console.log(bag.who, 'Starting');

  async.series([
      _performCall.bind(null, bag),
      _parseResponse.bind(null, bag)
    ],
    function () {
      console.log(bag.who, 'Completed');
      return callback(bag.err, bag.parsedBody, bag.res);
    }
  );
};

// Common helper methods
function _performCall(bag, next) {
  var who = bag.who + '|' + _performCall.name;
  console.log(who, 'Inside');

  bag.startedAt = Date.now();
  var retryOpts = {
    times: bag.retry ? 5 : 1,
    interval: function (retryCount) {
      return Math.pow(2, retryCount) * 1000;
    }
  };

  async.retry(retryOpts,
    function (callback) {
      request(bag.opts,
        function (err, res, body) {
          var interval = Date.now() - bag.startedAt;
          console.log(who, 'Request ' + bag.opts.method + ' ' +
            bag.opts.url + ' took ' + interval +
            ' ms and returned HTTP status ' + (res && res.statusCode));

          if (res && res.statusCode > 299)
            err = err || res.statusCode;
          if (err)
            console.log(who, 'GitLab returned an error', err);

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
  console.log(who, 'Inside');

  if (bag.res && bag.res.headers.link)
    bag.headerLinks = parseLinks(bag.res.headers.link);

  if (bag.body) {
    if (typeof bag.body === 'object') {
      bag.parsedBody = bag.body;
    } else {
      try {
        bag.parsedBody = JSON.parse(bag.body);
      } catch (e) {
        console.log(who, 'Unable to parse bag.body', bag.body, e);
        bag.err = e;
      }
    }
  }
  return next();
}

// Projects
Adapter.prototype.getProject = function (projectFullName, callback) {
  var escapedProjectFullName = querystring.escape(projectFullName);
  var url = '/projects/' + escapedProjectFullName;
  this.get(url, {}, callback);
};

Adapter.prototype.getCommits = function (projectFullName, branchName,
  callback) {
  var escapedProjectFullName = querystring.escape(projectFullName);
  var escapedBranchName =  querystring.escape(branchName);
  var url = '/projects/' + escapedProjectFullName + '/repository/commits?' +
    'ref_name=' + escapedBranchName;
  this.get(url, {}, callback);
};

// Webhooks
Adapter.prototype.getHooks = function (projectFullName, callback) {
  var escapedProjectFullName = querystring.escape(projectFullName);
  var url = '/projects/' + escapedProjectFullName + '/hooks';
  this.get(url, {}, callback);
};

Adapter.prototype.postHook = function (projectFullName, webhookUrl, callback) {
  var escapedProjectFullName = querystring.escape(projectFullName);
  var url = '/projects/' + escapedProjectFullName + '/hooks';

  /* jshint camelcase: false */
  var body = {
    url: webhookUrl,
    push_events: true,
    merge_requests_events: true,
    tag_push_events: true
  };
  /* jshint camelcase: true */

  this.post(url, body, callback);
};

Adapter.prototype.deleteHook = function (projectFullName, webhookId, callback) {
  var escapedProjectFullName = querystring.escape(projectFullName);
  var url = '/projects/' + escapedProjectFullName + '/hooks/' + webhookId;
  this.del(url, callback);
};

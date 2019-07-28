'use strict';

var self = validateWebhook;
module.exports = self;

var crypto = require('crypto');
var async = require('async');
var fs = require('fs');
var util = require('util');
var _ = require('underscore');

var ApiAdapter = require('./ApiAdapter.js');

var validationStrategies = {
  bitbucket: require('./bitbucket/validateWebhook.js'),
  bitbucketServer: require('./bitbucketServer/validateWebhook.js'),
  github: require('./github/validateWebhook.js'),
  gitlab: require('./gitlab/validateWebhook.js')
};

function validateWebhook() {
  var bag = {
    hookId: process.env.hook_id,
    apiAdapter: new ApiAdapter(process.env.api_token),
    reqHeaders: {},
    reqBody: {},
    isValidWebhook: false
  };

  bag.who = util.format('hooks|%s|id:', self.name, bag.hookId);
  console.log(bag.who, 'Starting');

  async.series([
      _readHeaders.bind(null, bag),
      _readBody.bind(null, bag),
      _getHook.bind(null, bag),
      _getHookIntegration.bind(null, bag),
      _validateWebhook.bind(null, bag),
      _authorizeWebhook.bind(null, bag)
    ],
    function (err) {
      console.log(bag.who, 'Completed');
      if (err)
        process.exit(1);

    }
  );
}

function _readHeaders(bag, next) {
  var who = bag.who + '|' + _readHeaders.name;
  console.log(who, 'Inside');

  var headersFilePath = process.env.hook_headers_path;

  fs.readFile(headersFilePath, 'utf8',
    function (err, data) {
      if (err) {
        console.log(who, 'Failed to read headers file with error: ' +
          util.inspect(err));
        return next(err);
      }

      try {
        console.log(who, 'Parsing headers file');
        bag.reqHeaders = JSON.parse(data);
      } catch (e) {
        console.log(who, 'Failed to parse headers file ' +
          'with error: ' + util.inspect(e));
        return next(e);
      }

      return next();
    }
  );
}

function _readBody(bag, next) {
  var who = bag.who + '|' + _readBody.name;
  console.log(who, 'Inside');

  var bodyFilePath = process.env.hook_body_path;

  fs.readFile(bodyFilePath, 'utf8',
    function (err, data) {
      if (err) {
        console.log(who, 'Failed to read body file ' +
          'with error: ' + util.inspect(err));
          return next(err);
      }

      try {
        console.log(who, 'Parsing body file');
        bag.reqBody = JSON.parse(data);
      } catch (e) {
        console.log(who, 'Failed to parse body file ' +
          'with error: ' + util.inspect(e));
        return next(e);
      }

      return next();
    }
  );
}

function _getHook(bag, next) {
  var who = bag.who + '|' + _getHook.name;
  console.log(who, 'Inside');

  bag.apiAdapter.getHookById(bag.hookId,
    function (err, hook) {
      if (err) {
        var msg = util.format('getHookById failed for id: %s ' +
          'with error: %s', bag.hookId, err.message);
        return next(msg);
      }

      bag.hook = hook;
      return next();
    }
  );
}

function _getHookIntegration(bag, next) {
  var who = bag.who + '|' + _getHookIntegration.name;
  console.log(who, 'Inside');

  bag.apiAdapter.getProjectIntegrationById(bag.hook.projectIntegrationId,
    function (err, integration) {
      if (err) {
        var msg = util.format('getProjectIntegrationById failed for id: %s ' +
          'with error: %s', bag.hook.projectIntegrationId, err.message);
        return next(msg);
      }

      bag.integration = integration;
      return next();
    }
  );
}

function _validateWebhook(bag, next) {
  var who = bag.who + '|' + _validateWebhook.name;
  console.log(who, 'Inside');

  var strategy = null;
  if (_.has(bag.reqHeaders, 'x-github-event'))
    strategy = validationStrategies.github;
  else if (_.has(bag.reqHeaders, 'x-event-key') && _.has(bag.reqHeaders,
    'x-request-uuid'))
    strategy = validationStrategies.bitbucket;
  else if (_.has(bag.reqHeaders, 'x-gitlab-event'))
    strategy = validationStrategies.gitlab;
  else if (_.has(bag.reqHeaders, 'x-bitbucket-server-event') ||
    (_.has(bag.reqHeaders, 'x-event-key') && _.has(bag.reqHeaders,
      'x-request-id')))
    strategy = validationStrategies.bitbucketServer;

  if (!strategy)
    return next('A webhook with unsupported headers was ignored' +
    ' for hookId: ' + bag.hookId +
    ' from sourceProvider ' + bag.reqHeaders['user-agent']);

  strategy(bag.reqBody, bag.reqHeaders,
    function (err, isValidWebhook) {
      if (err)
        return next('Error validating webhook for hookId ' +
            bag.hookId + ' ' + util.inspect(err));

      if (!isValidWebhook)
        return next('Invalid webhook for hookId ' + bag.hookId);

      return next();
    }
  );
}

function _authorizeWebhook(bag, next) {
  var who = bag.who + '|' + _authorizeWebhook.name;
  console.log(who, 'Inside');

  if ((bag.integration.masterIntegrationName === 'bitbucketServer' ||
    bag.integration.masterIntegrationName === 'bitbucketServerBasic') &&
    _.has(bag.reqHeaders, 'x-hub-signature')) {
      var secret = bag.hook.propertyBag.username + ':' +
        bag.hook.propertyBag.password;
      var body = JSON.stringify(bag.reqBody);
      var hmac = crypto.createHmac('sha256', secret).update(body).digest('hex');
      if (('sha256=' + hmac) === bag.reqHeaders['x-hub-signature'])
        return next();
    }

    var headerValues = bag.reqHeaders.authorization &&
      bag.reqHeaders.authorization.split(' ');
    var scheme = headerValues && headerValues[0];
    if (scheme === 'Basic') {
      var credentials = headerValues[1];
      var decoded = new Buffer(credentials, 'base64').toString();
      var user = decoded.split(':')[0];
      var pass = decoded.split(':')[1];

      if (user === bag.hook.propertyBag.username &&
        pass === bag.hook.propertyBag.password) {
        console.log('Webhook authenticated for hookId', bag.hookId);
        return next();
      }
    }

    return next('Unauthorized webhook received for hookId: ' + bag.hookId);
}

validateWebhook();

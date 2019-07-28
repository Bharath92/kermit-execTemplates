'use strict';

var self = validateWebhook;
module.exports = self;

var async = require('async');
var util = require('util');
var runTypes = require('../runTypes.js');

function validateWebhook(reqBody, reqHeaders, callback) {
  var bag = {
    reqBody: reqBody,
    reqHeaders: reqHeaders,
    parsedPayload: null,
    isValidWebhook: true
  };

  bag.who = util.format('github|%s', self.name);
  console.log(bag.who, 'Starting');

  async.series([
      _checkInputParams.bind(null, bag),
      _parsePayload.bind(null, bag),
      _checkZenWebhook.bind(null, bag),
      _setWebhookType.bind(null, bag),
      _validateWebhookCommit.bind(null, bag),
      _validateWebhookPullRequest.bind(null, bag),
      _validateWebhookPullRequestClose.bind(null, bag),
      _validateWebhookRelease.bind(null, bag),
      _validateWebhookTag.bind(null, bag)
    ],
    function (err) {
      console.log(bag.who, 'Completed');
      return callback(err, bag.isValidWebhook);
    }
  );
}

function _checkInputParams(bag, next) {
  var who = bag.who + '|' + _checkInputParams.name;
  console.log(who, 'Inside');

  if (!bag.reqBody)
    return next('Missing body');

  if (!bag.reqHeaders)
    return next('Missing headers');

  if (!bag.reqHeaders.authorization)
    return next('Missing header data :authorization');

  return next();
}

function _parsePayload(bag, next) {
  var who = bag.who + '|' + _parsePayload.name;
  console.log(who, 'Inside');

  var payload = null;
  try {
    payload = JSON.parse(bag.reqBody.payload);
  } catch (e) {
    return next('Error parsing payload: ' + util.inspect(e));
  }
  bag.parsedPayload = payload;

  return next();
}

function _checkZenWebhook(bag, next) {
  if (!bag.isValidWebhook) return next();
  if (!bag.parsedPayload.zen) return next();

  var who = bag.who + '|' + _checkZenWebhook.name;
  console.log(who, 'Inside');

  console.log('Ignoring the github webhook ping', who);

  bag.isValidWebhook = false;

  return next();
}

function _setWebhookType(bag, next) {
  if (!bag.isValidWebhook) return next();

  var who = bag.who + '|' + _setWebhookType.name;
  console.log(who, 'Inside');

  var githubEvent = bag.reqHeaders['x-github-event'];
  var tagMatcher = new RegExp(/refs\/tags\/(.*)/);
  var ref = bag.parsedPayload.ref;
  var isTagPush = tagMatcher.test(ref);

  if (githubEvent === 'push' && !isTagPush) {
    bag.webhookType = runTypes.WEBHOOK_COMMIT;
    return next();
  }

  if (githubEvent === 'pull_request') {
    var action = bag.parsedPayload.action;
    if (action === 'closed')
      bag.webhookType = runTypes.WEBHOOK_PR_CLOSE;
    else
      bag.webhookType = runTypes.WEBHOOK_PR;
    return next();
  }

  if (githubEvent === 'release') {
    bag.webhookType = runTypes.WEBHOOK_RELEASE;
    return next();
  }

  if (githubEvent === 'push' && isTagPush) {
    bag.webhookType = runTypes.WEBHOOK_TAG;
    return next();
  }

  return next('No valid webhook event in headers.');
}

function _validateWebhookCommit(bag, next) {
  if (!bag.isValidWebhook) return next();
  if (bag.webhookType !== runTypes.WEBHOOK_COMMIT) return next();

  var who = bag.who + '|' + _validateWebhookCommit.name;
  console.log(who, 'Inside');

  if (!bag.parsedPayload.pusher)
    return next('Missing body data :payload.pusher');
  /* jshint camelcase:false */
  if (!bag.parsedPayload.head_commit) {
    console.log(who,'Ignoring GitHub push webhook because the ' +
      'push event was a result of deletion of a reference for project ' +
      bag.parsedPayload.repository.full_name);
    bag.isValidWebhook = false;
    return next();
  }
  /* jshint camelcase:true */

  if (bag.parsedPayload.ref || bag.parsedPayload.after)
    return next();

  return next('Missing body data :payload.ref or :payload.after');
}

function _validateWebhookPullRequest(bag, next) {
  if (!bag.isValidWebhook) return next();
  if (bag.webhookType !== runTypes.WEBHOOK_PR) return next();

  var who = bag.who + '|' + _validateWebhookPullRequest.name;
  console.log(who, 'Inside');

  /* jshint camelcase:false */
  if (!bag.parsedPayload.pull_request)
  /* jshint camelcase:true */
    return next('Missing body data :payload.pull_request');

  /* jshint camelcase:false */
  var action = bag.parsedPayload.action;
  if (action === 'opened' || action === 'synchronize' || action === 'reopened')
    return next();

  console.log(who, 'Ignoring GitHub webhook PR webhook because of ' +
    'unsupported ' + bag.parsedPayload.action + ' action for project '+
    bag.parsedPayload.repository.full_name);
  bag.isValidWebhook = false;
  return next();
  /* jshint camelcase:true */
}

function _validateWebhookPullRequestClose(bag, next) {
  if (!bag.isValidWebhook) return next();
  if (bag.webhookType !== runTypes.WEBHOOK_PR_CLOSE) return next();

  var who = bag.who + '|' + _validateWebhookPullRequestClose.name;
  console.log(who, 'Inside');

  /* jshint camelcase:false */
  if (!bag.parsedPayload.pull_request)
  /* jshint camelcase:true */
    return next('Missing body data :payload.pull_request');

  return next();
}

function _validateWebhookRelease(bag, next) {
  if (!bag.isValidWebhook) return next();
  if (bag.webhookType !== runTypes.WEBHOOK_RELEASE) return next();

  var who = bag.who + '|' + _validateWebhookRelease.name;
  console.log(who, 'Inside');

  if (!bag.parsedPayload.release)
    return next('Missing body date :payload.release');

  // At the time of writing, 'published' is the only valid value for action
  // on release webhooks
  if (bag.parsedPayload.action === 'published')
    return next();

  /* jshint camelcase:false */
  console.log(who, 'Ignoring GitHub release webhook because of ' +
    'unsupported ' + bag.parsedPayload.action + ' action for project '+
    bag.parsedPayload.repository.full_name);
  /* jshint camelcase:true */

  bag.isValidWebhook = false;
  return next();
}

function _validateWebhookTag(bag, next) {
  if (!bag.isValidWebhook) return next();
  if (bag.webhookType !== runTypes.WEBHOOK_TAG) return next();

  var who = bag.who + '|' + _validateWebhookTag.name;
  console.log(who, 'Inside');

  if (!bag.parsedPayload.pusher)
    return next('Missing body data :payload.pusher');
  /* jshint camelcase:false */
  if (!bag.parsedPayload.head_commit) {
    console.log(who,'Ignoring GitHub push webhook because the ' +
      'push event was a result of deletion of a reference for project ' +
       bag.parsedPayload.repository.full_name);
    bag.isValidWebhook = false;
    return next();
  }
  /* jshint camelcase:true */

  if (bag.parsedPayload.ref || bag.parsedPayload.after)
    return next();

  return next('Missing body data :payload.ref or :payload.after');
}

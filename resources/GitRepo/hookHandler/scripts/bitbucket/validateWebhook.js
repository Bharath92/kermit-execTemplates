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
    isValidWebhook: true,
  };

  bag.who = util.format('bitbucket|%s', self.name);
  console.log(bag.who, 'Starting');

  async.series([
      _checkInputParams.bind(null, bag),
      _parsePayload.bind(null, bag),
      _setWebhookType.bind(null, bag),
      _validateWebhookCommit.bind(null, bag),
      _validateWebhookPullRequest.bind(null, bag),
      _validateWebhookPullRequestClose.bind(null, bag)
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
    return next('Missing data: reqBody');
  if (!bag.reqHeaders)
    return next('Missing data: reqHeaders');
  if (!bag.reqHeaders.authorization)
    return next('Missing data: reqHeaders.authorization');

  return next();
}

function _parsePayload(bag, next) {
  var who = bag.who + '|' + _parsePayload.name;
  console.log(who, 'Inside');

  bag.parsedPayload = bag.reqBody;
  return next();
}

function _setWebhookType(bag, next) {
  var who = bag.who + '|' + _setWebhookType.name;
  console.log(who, 'Inside');

  var bitbucketEvent = bag.reqHeaders['x-event-key'];
  /* jshint camelcase:false */
  if (bitbucketEvent === 'repo:push') {
    bag.webhookType = runTypes.WEBHOOK_COMMIT; // May be a tag webhook
  } else if (bitbucketEvent === 'pullrequest:created') {
    bag.webhookType = runTypes.WEBHOOK_PR;
  } else if (bitbucketEvent === 'pullrequest:updated') {
    bag.webhookType = runTypes.WEBHOOK_PR;
  } else if (bitbucketEvent === 'pullrequest:rejected') {
    bag.webhookType = runTypes.WEBHOOK_PR_CLOSE;
  } else {
    console.log(who, 'Ignoring Bitbucket webhook because of an ' +
       'unsupported event ' + bitbucketEvent + ' in headers for project ' +
        bag.parsedPayload.repository.full_name);
    bag.isValidWebhook = false;
  }
  /* jshint camelcase:true */

  return next();
}

function _validateWebhookCommit(bag, next) {
  if (!bag.isValidWebhook) return next();
  if (bag.webhookType !== runTypes.WEBHOOK_COMMIT) return next();

  var who = bag.who + '|' + _validateWebhookCommit.name;
  console.log(who, 'Inside');

  /* jshint camelcase:false */
  if (!bag.parsedPayload.push || !bag.parsedPayload.push.changes) {
    console.log(who, 'Ignoring Bitbucket push webhook because ' +
       'because the payload does not contain the push event for project ' +
       bag.parsedPayload.repository.full_name);
    bag.isValidWebhook = false;
    return next();
  }

  var commitMessage = null;

  var lastCommit = bag.parsedPayload.push.changes[0];
  if (lastCommit) {
    if (!lastCommit.new) {
      console.log(who, 'Ignoring Bitbucket push webhook because ' +
       'push event was a result of deletion of a reference for project ' +
       bag.parsedPayload.repository.full_name);
      // Deleted branch
      bag.isValidWebhook = false;
      return next();
    }
    commitMessage = lastCommit.new.target.message;
  }

  /* jshint camelcase:true */
  return next();
}

function _validateWebhookPullRequest(bag, next) {
  if (!bag.isValidWebhook) return next();
  if (bag.webhookType !== runTypes.WEBHOOK_PR) return next();

  var who = bag.who + '|' + _validateWebhookPullRequest.name;
  console.log(who, 'Inside');

  if (!bag.parsedPayload.pullrequest)
    return next('Missing body data: payload.pullrequest');

  return next();
}

function _validateWebhookPullRequestClose(bag, next) {
  if (!bag.isValidWebhook) return next();
  if (bag.webhookType !== runTypes.WEBHOOK_PR_CLOSE) return next();

  var who = bag.who + '|' + _validateWebhookPullRequestClose.name;
  console.log(who, 'Inside');

  if (!bag.parsedPayload.pullrequest)
    return next('Missing body data: payload.pullrequest');

  return next();
}

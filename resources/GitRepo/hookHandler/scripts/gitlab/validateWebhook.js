'use strict';

var self = validateWebhook;
module.exports = self;

var async = require('async');
var util = require('util');
var _ = require('underscore');
var runTypes = require('../runTypes.js');

function validateWebhook(reqBody, reqHeaders, callback) {
  var bag = {
    reqBody: reqBody,
    reqHeaders: reqHeaders,
    parsedPayload: null,
    isValidWebhook: true,
  };

  bag.who = util.format('gitlab|%s', self.name);
  console.log(bag.who, 'Starting');

  async.series([
      _checkInputParams.bind(null, bag),
      _parsePayload.bind(null, bag),
      _setWebhookType.bind(null, bag),
      _validateWebhookCommit.bind(null, bag),
      _validateWebhookPullRequest.bind(null, bag)
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

  /* jshint camelcase:false */
  var gitlabEvent = bag.reqHeaders['x-gitlab-event'];
  if (gitlabEvent === 'Push Hook') {
    bag.webhookType = runTypes.WEBHOOK_COMMIT;
  } else if (gitlabEvent === 'Merge Request Hook') {
    var action = bag.parsedPayload.object_attributes.action;
    if (action === 'close')
      bag.webhookType = runTypes.WEBHOOK_PR_CLOSE;
    else
      bag.webhookType = runTypes.WEBHOOK_PR;
  } else if (gitlabEvent === 'Tag Push Hook') {
    bag.webhookType = runTypes.WEBHOOK_TAG;
  } else {
    console.log(who, 'Ignoring GitLab webhook because of an ' +
      'unsupported event ' + gitlabEvent + ' in headers for project ' +
      bag.parsedPayload.repository.name);
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

  if (_.isEmpty(bag.reqBody.commits)) {
    console.log(who, 'Ignoring GitLab push webhook because commits ' +
      'were not found.');
    bag.isValidWebhook = false;
    return next();
  }

  return next();
}

function _validateWebhookPullRequest(bag, next) {
  if (!bag.isValidWebhook) return next();
  if (bag.webhookType !== runTypes.WEBHOOK_PR) return next();

  var who = bag.who + '|' + _validateWebhookPullRequest.name;
  console.log(who, 'Inside');

  /* jshint camelcase:false */
  var action = bag.parsedPayload.object_attributes.action;
  /* jshint camelcase:true */
  if (action === 'open' || action === 'reopen' || action === 'update')
    console.log(who, 'Allowing supported GitLab PR webhook action: ' + action);
  else {
    console.log(who, 'Ignoring GitLab PR webhook because of unsupported ' +
      action + ' action for project '+ bag.parsedPayload.project.name);
    bag.isValidWebhook = false;
  }

  return next();
}

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

  bag.who = util.format('bitbucketServer|%s', self.name);
  console.log(bag.who, 'Starting');

  async.series([
      _checkInputParams.bind(null, bag),
      _setWebhookType.bind(null, bag),
      _validateWebhookCommit.bind(null, bag)
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

  if (!(bag.reqHeaders.authorization ||
    _.has(bag.reqHeaders, 'x-hub-signature')))
    return next(
      'Missing data: reqHeaders.authorization or reqHeaders.x-hub-signature');

  return next();
}

function _setWebhookType(bag, next) {
  var who = bag.who + '|' + _setWebhookType.name;
  console.log(who, 'Inside');

  /* jshint camelcase:false */
  var bitbucketServerEvent = bag.reqHeaders['x-bitbucket-server-event'] ||
    bag.reqHeaders['x-event-key'];
  bag.repoName = bag.reqBody.repository && bag.reqBody.repository.name;
  if (bitbucketServerEvent === 'push' ||
    (bitbucketServerEvent === 'repo:refs_changed' &&
    _.first(bag.reqBody.changes).ref.type === 'BRANCH' &&
    _.first(bag.reqBody.changes).type === 'UPDATE')) {
    bag.webhookType = runTypes.WEBHOOK_COMMIT;
  } else if (bitbucketServerEvent === 'pullrequest:created' ||
    bitbucketServerEvent === 'pr:opened') {
    bag.webhookType = runTypes.WEBHOOK_PR;
  } else if (bitbucketServerEvent === 'pullrequest:updated') {
    bag.webhookType = runTypes.WEBHOOK_PR;
  } else if (bitbucketServerEvent === 'pr:declined') {
     bag.webhookType = runTypes.WEBHOOK_PR_CLOSE;
  } else if (bitbucketServerEvent === 'tag') {
    bag.webhookType = runTypes.WEBHOOK_TAG;
  } else if (bitbucketServerEvent === 'repo:refs_changed' &&
    _.first(bag.reqBody.changes).ref.type === 'TAG' &&
    _.first(bag.reqBody.changes).type === 'ADD') {
    bag.webhookType = runTypes.WEBHOOK_TAG;
  } else {
    console.log(who, 'Ignoring Bitbucket Server webhook because of an ' +
       'unsupported event ' + bitbucketServerEvent +
       ' in headers for project ' + bag.repoName);
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
  if (_.isEmpty(bag.reqBody.changesets) && _.isEmpty(bag.reqBody.changes)) {
    console.log(who, 'Ignoring Bitbucket Server push webhook because ' +
      'commits were not found.');
    bag.isValidWebhook = false;
    return next();
  }

  var commitMessage;
  if (!_.isEmpty(bag.reqBody.changesets))
    commitMessage = bag.reqBody.changesets[0].toCommit.message;

  /* jshint camelcase:true */
  return next();
}

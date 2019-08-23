'use strict';

var self = getWebhookRunType;
module.exports = self;

var async = require('async');
var _ = require('underscore');
var util = require('util');

var runTypes = require('../runTypes.js');

function getWebhookRunType(params, callback) {
  var bag = {
    params: params,
    runType: runTypes.INVALID
  };

  bag.who = util.format('bitbucketServer|%s|hookId:%s',
    self.name, bag.params.hookId);
  console.log(bag.who, 'Starting');

  async.series([
      _getRunType.bind(null, bag)
    ],
    function (err) {
      if (err)
        console.log(bag.who, 'Completed with errors');
      else
        console.log(bag.who, 'Completed');

      return callback(err, bag.runType);
    }
  );
}

function _getRunType(bag, next) {
  var who = bag.who + '|' + _getRunType.name;
  console.log(who, 'Inside');

  var bitbucketServerEvent =
    bag.params.reqHeaders['x-bitbucket-server-event'] ||
      bag.params.reqHeaders['x-event-key'];
  var basicBBSChanges = bag.params.reqBody && bag.params.reqBody.changes;
  if (bitbucketServerEvent === 'push' ||
    (bitbucketServerEvent === 'repo:refs_changed' &&
    _.first(basicBBSChanges).ref.type === 'BRANCH' &&
    _.first(basicBBSChanges).type === 'UPDATE')) {
    bag.runType = runTypes.WEBHOOK_COMMIT;
  } else if (bitbucketServerEvent === 'pullrequest:created' ||
    bitbucketServerEvent === 'pr:opened') {
    bag.runType = runTypes.WEBHOOK_PR;
  } else if (bitbucketServerEvent === 'pullrequest:updated') {
    bag.runType = runTypes.WEBHOOK_PR;
  } else if (bitbucketServerEvent === 'pr:declined') {
    bag.runType = runTypes.WEBHOOK_PR_CLOSE;
  } else if (bitbucketServerEvent === 'tag') {
    bag.runType = runTypes.WEBHOOK_TAG;
  } else if (bitbucketServerEvent === 'repo:refs_changed' &&
    _.first(basicBBSChanges).ref.type === 'TAG' &&
    _.first(basicBBSChanges).type === 'ADD') {
    bag.runType = runTypes.WEBHOOK_TAG;
  } else {
    return next('Invalid event type ' + bitbucketServerEvent +
      ' for provider: ' + bag.params.masterIntegrationName);
  }

  return next();
}

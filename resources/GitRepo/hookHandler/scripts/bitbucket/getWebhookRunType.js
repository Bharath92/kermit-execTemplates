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

  bag.who = util.format('bitbucket|%s|hookId:%s',
    self.name, bag.params.hookId);
  console.log(bag.who, 'Starting');

  async.series([
      _getWebhookRunType.bind(null, bag)
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

function _getWebhookRunType(bag, next) {
  var who = bag.who + '|' + _getWebhookRunType.name;
  console.log(who, 'Inside');

  var eventType = bag.params.reqHeaders['x-event-key'];

  if (eventType === 'repo:push') {
    bag.runType = runTypes.WEBHOOK_COMMIT;

    // Check if this is actually a tag push
    var payload = bag.params.reqBody;
    if (_.has(payload, 'push') && _.has(payload.push, 'changes') &&
      !_.isEmpty(payload.push.changes)) {
      var change = payload.push.changes[0];

      if (_.has(change, 'new') && change.new.type === 'tag')
        bag.runType = runTypes.WEBHOOK_TAG;
    }
  } else if (eventType === 'pullrequest:created') {
    bag.runType = runTypes.WEBHOOK_PR;
  } else if (eventType === 'pullrequest:updated') {
    bag.runType = runTypes.WEBHOOK_PR;
  } else if (eventType === 'pullrequest:rejected') {
    bag.runType = runTypes.WEBHOOK_PR_CLOSE;
  } else {
    return next('Invalid event type ' + eventType + ' for provider: ' +
      bag.params.masterIntegrationName);
  }

  return next();
}

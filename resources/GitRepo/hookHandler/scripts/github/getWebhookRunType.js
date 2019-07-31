'use strict';

var self = getWebhookRunType;
module.exports = self;

var async = require('async');
var util = require('util');

var runTypes = require('../runTypes.js');

function getWebhookRunType(params, callback) {
  var bag = {
    params: params,
    runType: runTypes.INVALID
  };

  bag.who = util.format('github|%s|hookId:%s', self.name, bag.params.hookId);
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

  var payload;
  try {
    payload = JSON.parse(bag.params.reqBody.payload);
  } catch (err) {
    return next('Failed to parse payload for webhook: ' + util.inspect(err));
  }

  var tagMatcher = new RegExp(/refs\/tags\/(.*)/);
  var ref = payload.ref;
  var isTagPush = tagMatcher.test(ref);

  if (bag.params.reqHeaders['x-github-event'] === 'push' && !isTagPush) {
    bag.runType = runTypes.WEBHOOK_COMMIT;
    return next();
  } else if (bag.params.reqHeaders['x-github-event'] === 'pull_request') {
    payload = null;
    try {
      payload = JSON.parse(bag.params.reqBody && bag.params.reqBody.payload);
    } catch (e) {
      return next('Error parsing payload: ' + util.inspect(e));
    }
    var action = payload.action;
    if (action === 'closed')
      bag.runType = runTypes.WEBHOOK_PR_CLOSE;
    else
      bag.runType = runTypes.WEBHOOK_PR;
    return next();
  } else if (bag.params.reqHeaders['x-github-event'] === 'release') {
    bag.runType = runTypes.WEBHOOK_RELEASE;
    return next();
  } else if (bag.params.reqHeaders['x-github-event'] === 'push' &&
    isTagPush) {
    bag.runType = runTypes.WEBHOOK_TAG;
    return next();
  } else {
    //means runType is invalid and hence error
    return next('Invalid event type ' +
      bag.params.reqHeaders['x-github-event'] +
      ' for provider: ' + bag.params.masterIntegrationName);
  }
}

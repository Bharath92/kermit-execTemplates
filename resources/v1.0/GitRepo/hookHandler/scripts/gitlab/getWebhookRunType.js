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

  bag.who = util.format('gitlab|%s|hookId:%s', self.name, bag.params.hookId);
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

  var gitlabEvent = bag.params.reqHeaders['x-gitlab-event'];
  if (gitlabEvent === 'Push Hook') {
    bag.runType = runTypes.WEBHOOK_COMMIT;
  } else if (gitlabEvent === 'Merge Request Hook') {
    /* jshint camelcase:false */
    var action = bag.params.reqBody && bag.params.reqBody.object_attributes &&
      bag.params.reqBody.object_attributes.action;
    /* jshint camelcase:true */
    if (action === 'close')
      bag.runType = runTypes.WEBHOOK_PR_CLOSE;
    else
      bag.runType = runTypes.WEBHOOK_PR;
  } else if (gitlabEvent === 'Tag Push Hook') {
    bag.runType = runTypes.WEBHOOK_TAG;
  } else {
    return next('Invalid event type ' + gitlabEvent + ' for provider: ' +
      bag.params.masterIntegrationName);
  }

  return next();
}

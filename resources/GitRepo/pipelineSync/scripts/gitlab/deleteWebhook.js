'use strict';

var self = deleteWebhook;
module.exports = self;

var async = require('async');
var util = require('util');
var GitlabAdapter = require('./Adapter.js');

function deleteWebhook(providerIntegrationValues, webhookId, owner, repo,
  providerUrl, callback) {
  var bag = {
    token: providerIntegrationValues.token,
    webhookId: webhookId,
    owner: owner,
    repo: repo,
    providerUrl: providerUrl
  };

  bag.who = util.format('gitlab|%s:%s/%s', self.name, bag.owner, bag.repo);
  console.log(bag.who, 'Starting');

  async.series([
      _checkInputParams.bind(null, bag),
      _createAdapter.bind(null, bag),
      _deleteHook.bind(null, bag)
    ],
    function (err) {
      console.log(bag.who, 'Completed');
      if (err)
        return callback(err);

      return callback(null);
    }
  );
}

function _checkInputParams(bag, next) {
  var who = bag.who + '|' + _checkInputParams.name;
  console.log(who, 'Inside');

  var missing = [];

  if (!bag.token)
    missing.push('bag.providerIntegrationValues');

  if (!bag.webhookId)
    missing.push('bag.webhookId');

  if (!bag.owner)
    missing.push('bag.owner');

  if (!bag.repo)
    missing.push('bag.repo');

  if (!bag.providerUrl)
    missing.push('bag.providerUrl');

  if (missing.length > 0)
    return next(util.format('%s is missing: %s', who, bag.missing.join(', ')));

  bag.projectFullName = util.format('%s/%s', bag.owner, bag.repo);
  return next();
}

function _createAdapter(bag, next) {
  var who = bag.who + '|' + _createAdapter.name;
  console.log(who, 'Inside');

  bag.gitlabAdapter = new GitlabAdapter(bag.token, bag.providerUrl);

  return next();
}

function _deleteHook(bag, next) {
  var who = bag.who + '|' + _deleteHook.name;
  console.log(who, 'Inside');

  bag.gitlabAdapter.deleteHook(bag.projectFullName, bag.webhookId,
    function (err) {
      if (err)
        return next(
          util.format('deleteHook returned error %s ' +
          'for webhookId %s', util.inspect(err), bag.webhookId)
        );

      return next();
    }
  );
}

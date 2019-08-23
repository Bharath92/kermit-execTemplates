'use strict';

var self = deleteWebhook;
module.exports = self;

var async = require('async');
var util = require('util');

var BitbucketAdapter = require('./Adapter.js');

function deleteWebhook(providerIntegrationValues, webhookId, owner, repo,
  providerUrl, callback) {
  var bag = {
    appPassword: providerIntegrationValues.token,
    username: providerIntegrationValues.username,
    webhookId: webhookId,
    owner: owner,
    repo: repo,
    providerUrl: providerUrl
  };

  bag.who = util.format('bitbucket|%s:%s/%s', self.name, bag.owner, bag.repo);
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

  if (!bag.appPassword)
    missing.push('bag.appPassword');

  if (!bag.username)
    missing.push('bag.username');

  if (!bag.webhookId)
    missing.push('bag.webhookId');

  if (!bag.owner)
    missing.push('bag.owner');

  if (!bag.repo)
    missing.push('bag.repo');

  if (missing.length > 0)
    return next(util.format('%s is missing: %s', who, bag.missing.join(', ')));

  return next();
}

function _createAdapter(bag, next) {
  var who = bag.who + '|' + _createAdapter.name;
  console.log(who, 'Inside');

  bag.adapter = new BitbucketAdapter(bag.appPassword, bag.providerUrl,
    bag.username);

  return next();
}

function _deleteHook(bag, next) {
  var who = bag.who + '|' + _deleteHook.name;
  console.log(who, 'Inside');

  bag.adapter.delWebhook(bag.owner, bag.repo, bag.webhookId,
    function (err, body) {
      if (err)
        return next(util.format('deleteHook returned error %s ' +
          'with response %s for webhookId %s', err, util.inspect(body),
          bag.webhookId)
        );

      return next();
    }
  );
}

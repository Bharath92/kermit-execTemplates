'use strict';

var self = postWebhook;
module.exports = self;

var async = require('async');
var util = require('util');
var _ = require('underscore');

var BitbucketServerAdapter = require('./Adapter.js');

function postWebhook(providerIntegrationValues, webhookUrl, webhookTitle,
  owner, repo, providerUrl, callback) {
  var bag = {
    providerIntegrationValues: providerIntegrationValues,
    webhookUrl: webhookUrl,
    owner: owner,
    repo: repo,
    providerUrl: providerUrl,
    webhook: {}
  };

  bag.who = util.format('bitbucketServer|%s:%s/%s', self.name, bag.owner,
    bag.repo);
  console.log(bag.who, 'Starting');

  async.series([
      _checkInputParams.bind(null, bag),
      _createAdapter.bind(null, bag),
      _getHooks.bind(null, bag),
      _enableHook.bind(null, bag)
    ],
    function (err) {
      console.log(bag.who, 'Completed');
      if (err)
        return callback(err, bag.webhook);

      return callback(null, bag.webhook);
    }
  );
}

function _checkInputParams(bag, next) {
  var who = bag.who + '|' + _checkInputParams.name;
  console.log(who, 'Inside');

  var missing = [];

  if (!bag.providerIntegrationValues)
    missing.push('bag.providerIntegrationValues');

  if (!bag.webhookUrl)
    missing.push('bag.webhookUrl');

  if (!bag.owner)
    missing.push('bag.owner');

  if (!bag.repo)
    missing.push('bag.repo');

  if (!bag.providerUrl)
    missing.push('bag.providerUrl');

  if (missing.length > 0)
    return next(util.format('%s is missing: %s', who, bag.missing.join(', ')));

  return next();
}

function _createAdapter(bag, next) {
  var who = bag.who + '|' + _createAdapter.name;
  console.log(who, 'Inside');

  bag.bitbucketServerAdapter =
    new BitbucketServerAdapter(bag.providerIntegrationValues, bag.providerUrl);

  return next();
}

function _getHooks(bag, next) {
  var who = bag.who + '|' + _getHooks.name;
  console.log(who, 'Inside');

  bag.bitbucketServerAdapter.getHooks(bag.owner, bag.repo,
    function (err, hooks) {
      if (err)
        return next(util.format(
          'getHooks returned an error %s with response %s',
          err, util.inspect(hooks))
        );

      var hook = _.findWhere(hooks, {url: bag.webhookUrl});

      if (hook)
        bag.webhook.id = hook.id;

      return next();
    }
  );
}

function _enableHook(bag, next) {
  if (bag.webhook.id) return next();
  var who = bag.who + '|' + _enableHook.name;
  console.log(who, 'Inside');

  bag.bitbucketServerAdapter.enableHook(bag.owner, bag.repo, bag.webhookUrl,
    function (err, body) {
      if (err)
        return next(
          util.format('enableHook returned error %s ' +
          'for project %s', util.inspect(err), bag.projectFullName)
        );

      bag.webhook = {
        enabled: true,
        webhookUrl: bag.webhookUrl
      };

      bag.webhook.id = body.id;
      return next();
    }
  );
}

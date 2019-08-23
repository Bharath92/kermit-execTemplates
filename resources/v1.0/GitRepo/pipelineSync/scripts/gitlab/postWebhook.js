'use strict';

var self = postWebhook;
module.exports = self;

var async = require('async');
var util = require('util');
var _ = require('underscore');
var GitlabAdapter = require('./Adapter.js');

function postWebhook(providerIntegrationValues, webhookUrl, webhookTitle,
  owner, repo, providerUrl, callback) {
  var bag = {
    token: providerIntegrationValues.token,
    webhookUrl: webhookUrl,
    owner: owner,
    repo: repo,
    providerUrl: providerUrl,
    webhook: {}
  };

  bag.who = util.format('gitlab|%s:%s/%s', self.name, bag.owner, bag.repo);
  console.log(bag.who, 'Starting');

  async.series([
      _checkInputParams.bind(null, bag),
      _createAdapter.bind(null, bag),
      _getHooks.bind(null, bag),
      _processHooks.bind(null, bag)
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

  if (!bag.token)
    missing.push('bag.token');

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

  bag.projectFullName = util.format('%s/%s', bag.owner, bag.repo);
  return next();
}

function _createAdapter(bag, next) {
  var who = bag.who + '|' + _createAdapter.name;
  console.log(who, 'Inside');

  bag.gitlabAdapter = new GitlabAdapter(bag.token, bag.providerUrl);

  return next();
}

function _getHooks(bag, next) {
  var who = bag.who + '|' + _getHooks.name;
  console.log(who, 'Inside');

  bag.gitlabAdapter.getHooks(bag.projectFullName,
    function (err, body) {
      if (err)
        return next(
          util.format('getHooks returned error %s ' +
          'for %s', util.inspect(err), bag.projectFullName)
        );
      bag.hooks = body;

      return next();
    }
  );
}

function _processHooks(bag, next) {
  var who = bag.who + '|' + _processHooks.name;
  console.log(who, 'Inside');

  var existingWebhook = _.findWhere(bag.hooks, { url: bag.webhookUrl });

  if (existingWebhook) {
    bag.webhook = {
      // Webhooks in GitLab cannot be disabled.
      enabled: true,
      id: existingWebhook.id,
      webhookUrl: existingWebhook.url
    };
    return next();
  }

  bag.gitlabAdapter.postHook(bag.projectFullName, bag.webhookUrl,
    function (err, body) {
      if (err)
        return next(
          util.format('postHook returned error %s ' +
          'for %s', util.inspect(err), bag.projectFullName)
        );

      bag.webhook = {
        enabled: true,
        id: body.id,
        webhookUrl: body.url
      };
      return next();
    }
  );
}

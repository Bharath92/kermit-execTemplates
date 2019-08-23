'use strict';

var self = postWebhook;
module.exports = self;
var async = require('async');
var util = require('util');
var _ = require('underscore');

var GitHubAdapter = require('./Adapter.js');
var delWebhook = require('./deleteWebhook.js');

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

  bag.who = util.format('github|%s:%s/%s', self.name, bag.owner, bag.repo);
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

  bag.adapter = new GitHubAdapter(bag.providerIntegrationValues.token,
    bag.providerUrl);

  return next();
}

function _getHooks(bag, next) {
  var who = bag.who + '|' + _getHooks.name;
  console.log(who, 'Inside');

  bag.adapter.getHooks(bag.owner, bag.repo,
    function (err, body) {
      if (err || !body)
        return next(
          'getHooks failed for ' + bag.owner + '/' + bag.repo
        );
      bag.hooks = body;

      return next();
    }
  );
}

function _processHooks(bag, next) {
  var who = bag.who + '|' + _processHooks.name;
  console.log(who, 'Inside');
  var webhookFound = false;
  //if hook is already present then just return it.
  _.each(bag.hooks,
    function (hk) {
      if (webhookFound)
        return;
      if (hk.config && hk.config.url) {
        if (hk.config.url === bag.webhookUrl) {
          webhookFound = true;
          bag.webhook = {
            enabled: true,
            id: hk.id,
            webhookUrl: hk.config.url
          };
        }
        else if
        (hk.config.url.lastIndexOf(bag.webhookUrl.split('@')[1]) !== -1) {
          delWebhook(bag.providerIntegrationValues, hk.id, bag.owner, bag.repo,
          bag.providerUrl,
            function (err) {
              if (err)
                console.log('Webhook delete failed', err);
            }
          );
        }
      }
    }
  );

  if (webhookFound)
    return next();

  bag.adapter.postHook(bag.owner, bag.repo, bag.webhookUrl,
    function (err, body) {
      if (err || !body)
        return next(
          util.format('postHook returned error %s ' +
          'for %s/%s', util.inspect(err), bag.owner, bag.repo)
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

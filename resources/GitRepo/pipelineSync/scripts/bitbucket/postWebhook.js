'use strict';

var self = postWebhook;
module.exports = self;

var async = require('async');
var util = require('util');

var BitbucketAdapter = require('./Adapter.js');
var deleteWebhook = require('./deleteWebhook.js');

function postWebhook(providerIntegrationValues, webhookUrl, webhookTitle,
  owner, repo, providerUrl, callback) {
  var bag = {
    providerIntegrationValues: providerIntegrationValues,
    webhookUrl: webhookUrl,
    webhookTitle: webhookTitle,
    owner: owner,
    repo: repo,
    providerUrl: providerUrl,
    webhook: {}
  };

  bag.who = util.format('bitbucket|%s:%s/%s', self.name, bag.owner, bag.repo);
  console.log(bag.who, 'Starting');

  async.series([
      _checkInputParams.bind(null, bag),
      _createAdapter.bind(null, bag),
      _getHooks.bind(null, bag),
      _deleteWebhooks.bind(null, bag),
      _postHook.bind(null, bag)
    ],
    function (err) {
      console.log(bag.who, 'Completed');
      if (err)
        return callback(err, bag.webhook);

      bag.webhook = {
        id: bag.webhook.id,
        enabled: true
      };

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

  if (!bag.webhookTitle)
    missing.push('bag.webhookTitle');

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

  bag.adapter =
    new BitbucketAdapter(bag.providerIntegrationValues.token, bag.providerUrl,
      bag.providerIntegrationValues.username);

  return next();
}

function _getHooks(bag, next) {
  var who = bag.who + '|' + _getHooks.name;
  console.log(who, 'Inside');

  bag.adapter.getHooks(bag.owner, bag.repo,
    function (err, hooks) {
      if (err)
        return next(util.format(
          'getHooks returned an error %s with response %s',
          err, util.inspect(hooks))
        );

      if (hooks)
        bag.oldWebhooks = hooks.values;

      return next();
    }
  );
}

function _deleteWebhooks(bag, next) {
  if (!bag.oldWebhooks) return next();

  var who = bag.who + '|' + _deleteWebhooks.name;
  console.log(who, 'Inside');

  async.eachLimit(bag.oldWebhooks, 10,
    function (webhook, done) {
      if (webhook.description !== bag.webhookTitle)
        return done();

      if (webhook.url === bag.webhookUrl) {
        bag.webhook.id = webhook.uuid.replace('{', '').replace('}', '');
        return done();
      }

      deleteWebhook(bag.providerIntegrationValues, webhook.uuid,
        bag.owner, bag.repo, bag.providerUrl,
        function (err) {
          if (err)
            console.log(who, util.format(
              'Webhook deletion failed for repository %s/%s with error %s',
                bag.owner, bag.repo, err)
            );
          return done();
        }
      );
    },
    function () {
      return next();
    }
  );
}

function _postHook(bag, next) {
  if (bag.webhook.id) return next();

  var who = bag.who + '|' + _postHook.name;
  console.log(who, 'Inside');

  var request = {
    description: bag.webhookTitle,
    url: bag.webhookUrl,
    active: true,
    /* jshint camelcase:false */
    skip_cert_verification: false,
    /* jshint camelcase:true */
    events: [
      'repo:push',
      'pullrequest:created',
      'pullrequest:updated',
      'pullrequest:rejected'
    ]
  };

  bag.adapter.postWebhook(bag.owner, bag.repo, bag.webhookUrl, request,
    function (err, webhook) {
      if (err)
        return next(
          util.format('postWebhook returned an error %s' +
          ' with response %s for %s/%s',
          err, util.inspect(webhook), bag.owner, bag.repo)
        );

      if (webhook)
        bag.webhook.id = webhook.uuid.replace('{', '').replace('}', '');

      return next();
    }
  );
}

'use strict';

var self = normalizeCommitWebhook;
module.exports = self;

var async = require('async');
var _ = require('underscore');
var util = require('util');

var GenShaHash = require('../GenShaHash.js');
var Adapter = require('./Adapter.js');

function normalizeCommitWebhook(params, callback) {
  var bag = {
    params: params,
    adapter: new Adapter(params.providerIntegrationValues.token,
      params.providerUrl),
    sha: {
      providerDomain: 'github.com',
      isPullRequest: false,
      baseCommitRef: '',
      headCommitRef: '',
      headPROrgName: '',
      skipDecryption: false,
      branchName: null
    }
  };

  bag.who = util.format('github|%s|hookId:%s', self.name, bag.params.hookId);
  console.log(bag.who, 'Starting');

  async.series([
      _checkInputParams.bind(null, bag),
      _normalizePayload.bind(null, bag)
    ],
    function (err) {
      if (err)
        console.log(bag.who, 'Completed with errors');
      else
        console.log(bag.who, 'Completed');

      return callback(err, new GenShaHash(bag.sha));
    }
  );
}

function _checkInputParams(bag, next) {
  var who = bag.who + '|' + _checkInputParams.name;
  console.log(who, 'Inside');

  if (!bag.params.webhookPayload)
    return next('Missing webhook payload');

  if (!bag.params.webhookPayload.payload)
    return next('Missing payload property in webhook payload');

  try {
    bag.payload = JSON.parse(bag.params.webhookPayload.payload);
  } catch (e) {
    return next('Error parsing webhook payload');
  }

  var missing = [];

  if (!bag.payload.pusher)
    missing.push('pusher');

  if (!bag.payload.ref)
    missing.push('ref');

  /* jshint camelcase:false */
  if (!bag.payload.head_commit)
    missing.push('head_commit');
  /* jshint camelcase:true */

  if (missing.length > 0)
    return next(who + ' Missing params data: ' + missing.join(', '));

  return next();
}

function _normalizePayload(bag, next) {
  var who = bag.who + '|' + _normalizePayload.name;
  console.log(who, 'Inside');

  var branchRegex = /refs\/heads\/(.*)/;

  if (bag.payload.ref && _.isString(bag.payload.ref)) {
    var branchParsed = bag.payload.ref.match(branchRegex);
    if (branchParsed) //if it doesnt match, parsed will be null
      bag.sha.branchName = branchParsed[1];
  }

  bag.sha.commitSha = bag.payload.after;
  bag.sha.beforeCommitSha = bag.payload.before;
  bag.sha.triggeredByLogin = bag.payload.pusher.name;
  bag.sha.triggeredByEmail = bag.payload.pusher.email;
  bag.sha.triggeredByDisplayName = bag.payload.pusher.name;
  /* jshint camelcase:false */
  bag.sha.commitUrl = bag.payload.head_commit.url;
  bag.sha.commitMessage = bag.payload.head_commit.message;
  if (bag.payload.head_commit.committer) {
    bag.sha.committerEmail = bag.payload.head_commit.committer.email;
    bag.sha.committerDisplayName = bag.payload.head_commit.committer.name;
    bag.sha.committerLogin = bag.payload.head_commit.committer.username;
  }
  if (bag.payload.head_commit.author) {
    bag.sha.lastAuthorEmail = bag.payload.head_commit.author.email;
    bag.sha.lastAuthorDisplayName = bag.payload.head_commit.author.name;
    bag.sha.lastAuthorLogin = bag.payload.head_commit.author.username;
  }
  /* jshint camelcase:true */
  bag.sha.compareUrl = util.format('https://github.com/%s/%s/compare/%s...%s',
    bag.params.subscriptionOrgName, bag.params.projectName,
    bag.sha.beforeCommitSha, bag.sha.commitSha);
  return next();
}

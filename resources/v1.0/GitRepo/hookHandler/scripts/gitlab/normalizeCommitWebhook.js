'use strict';

var self = normalizeCommitWebhook;
module.exports = self;

var async = require('async');
var _ = require('underscore');
var url = require('url');
var util = require('util');

var GenShaHash = require('../GenShaHash.js');
var Adapter = require('./Adapter.js');

function normalizeCommitWebhook(params, callback) {
  var bag = {
    params: params,
    adapter: new Adapter(params.providerIntegrationValues.token,
      params.providerUrl),
    sha: {
      providerDomain: url.parse(params.providerUrl).host,
      isPullRequest: false,
      baseCommitRef: '',
      headCommitRef: '',
      headPROrgName: '',
      skipDecryption: false
    }
  };

  bag.who = util.format('gitlab|%s|hookId:%s', self.name, bag.params.hookId);
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

  bag.payload = bag.params.webhookPayload;
  return next();
}

function _normalizePayload(bag, next) {
  var who = bag.who + '|' + _normalizePayload.name;
  console.log(who, 'Inside');

  bag.payload = bag.params.webhookPayload;

  /* jshint camelcase:false */
  // Removes the first two elements, eg. refs/head/master, refs/head/feature/1
  bag.sha.branchName = bag.payload.ref.split('/').splice(2).join('/');
  bag.sha.commitSha = bag.payload.after;
  bag.sha.beforeCommitSha = bag.payload.before;
  bag.sha.triggeredByLogin = bag.payload.user_username;
  bag.sha.triggeredByEmail = bag.payload.user_email;
  bag.sha.triggeredByDisplayName = bag.payload.user_name;
  bag.sha.triggeredByAvatarUrl = bag.payload.user_avatar;
  bag.sha.commitUrl = _.last(bag.payload.commits).url;
  bag.sha.commitMessage = _.last(bag.payload.commits).message;
  bag.sha.committerEmail = _.last(bag.payload.commits).author.email;
  bag.sha.committerDisplayName = _.last(bag.payload.commits).author.name;
  bag.sha.lastAuthorEmail = _.last(bag.payload.commits).author.email;
  bag.sha.lastAuthorDisplayName = _.last(bag.payload.commits).author.name;
  /* jshint camelcase:true */

  return next();
}

'use strict';

var self = normalizePRWebhook;
module.exports = self;

var async = require('async');
var _ = require('underscore');
var url = require('url');
var util = require('util');

var GenShaHash = require('../GenShaHash.js');
var Adapter = require('./Adapter.js');

function normalizePRWebhook(params, callback) {
  var bag = {
    params: params,
    adapter: new Adapter(params.providerIntegrationValues.token,
      params.providerUrl),
    sha: {
      providerDomain: url.parse(params.providerUrl).host,
      isPullRequest: true,
      skipDecryption: true
    }
  };

  bag.who = util.format('gitlab|%s|hookId:%s', self.name, bag.params.hookId);
  console.log(bag.who, 'Starting');

  async.series([
      _checkInputParams.bind(null, bag),
      _processWebhookPayload.bind(null, bag),
      _getBaseCommit.bind(null, bag)
    ],
    function (err) {
      if (err)
        console.log(bag.who, 'Completed with errors');
      else
        console.log(bag.who, 'Complete');

      return callback(err, new GenShaHash(bag.sha));
    }
  );
}

function _checkInputParams(bag, next) {
  var who = bag.who + '|' + _checkInputParams.name;
  console.log(who, 'Inside');

  if (!bag.params.webhookPayload)
    return next('Missing webhook payload');

  /* jshint camelcase:false */
  if (!bag.params.webhookPayload.object_attributes)
  /* jshint camelcase:true */
    return next('Missing webhook payload.object_attributes');

  /* jshint camelcase:false */
  if (!bag.params.webhookPayload.object_attributes.last_commit)
  /* jshint camelcase:true */
    return next('Missing webhook payload.object_attributes.last_commit');

  bag.payload = bag.params.webhookPayload;
  return next();
}

function _processWebhookPayload(bag, next) {
  var who = bag.who + '|' + _processWebhookPayload.name;
  console.log(who, 'Inside');

  /*jshint camelcase:false*/
  bag.sha.isPullRequest = true;
  bag.sha.pullRequestBaseBranch = bag.payload.object_attributes.target_branch;
  bag.sha.baseCommitRef = bag.payload.object_attributes.target_branch;
  bag.sha.branchName = bag.payload.object_attributes.target_branch;
  bag.sha.headCommitRef = bag.payload.object_attributes.source_branch;
  bag.sha.commitSha = bag.payload.object_attributes.last_commit.id;
  bag.sha.commitMessage = bag.payload.object_attributes.last_commit.message;
  bag.sha.headPROrgName = bag.payload.object_attributes.source.namespace;
  bag.sha.commitUrl = bag.payload.object_attributes.url;
  bag.sha.pullRequestNumber = bag.payload.object_attributes.iid;
  bag.sha.compareUrl = bag.payload.object_attributes.url;
  bag.sha.committerEmail =
    bag.payload.object_attributes.last_commit.author.email;
  bag.sha.committerDisplayName =
    bag.payload.object_attributes.last_commit.author.name;
  bag.sha.lastAuthorEmail =
    bag.payload.object_attributes.last_commit.author.email;
  bag.sha.lastAuthorDisplayName =
    bag.payload.object_attributes.last_commit.author.name;
  bag.sha.triggeredByEmail =
    bag.payload.object_attributes.last_commit.author.email;
  bag.sha.triggeredByLogin = bag.payload.user.username;
  bag.sha.pullRequestRepoFullName =
    bag.payload.object_attributes.source.path_with_namespace;

  if (bag.payload.object_attributes.action === 'close') {
    bag.sha.isPullRequest = false;
    bag.sha.isPullRequestClose = true;
  }
  /*jshint camelcase:true*/

  return next();
}

function _getBaseCommit(bag, next) {
  var who = bag.who + '|' + _getBaseCommit.name;
  console.log(who, 'Inside');

  bag.adapter.getCommits(bag.params.projectFullName,
    bag.sha.pullRequestBaseBranch,
    function (err, commits) {
      if (err)
        return next(who + ' Error getting base repo refs');

      var latestCommit = _.first(commits);
      bag.sha.beforeCommitSha = latestCommit.id;

      return next();
    }
  );
}

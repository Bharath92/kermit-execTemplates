'use strict';

var self = normalizePRWebhook;
module.exports = self;

var async = require('async');
var util = require('util');

var GenShaHash = require('../GenShaHash.js');
var Adapter = require('./Adapter.js');

function normalizePRWebhook(params, callback) {
  var bag = {
    params: params,
    adapter: new Adapter(params.providerIntegrationValues.token,
      params.providerUrl),
    sha: {
      providerDomain: 'github.com',
      isPullRequest: true,
      skipDecryption: true
    }
  };

  bag.who = util.format('github|%s|hookId:%s', self.name, bag.params.hookId);
  console.log(bag.who, 'Starting');

  async.series([
      _checkInputParams.bind(null, bag),
      _processWebhookPayload.bind(null, bag),
      _digestCommitContent.bind(null, bag)
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

  return next();
}

function _processWebhookPayload(bag, next) {
  var who = bag.who + '|' + _processWebhookPayload.name;
  console.log(who, 'Inside');

  /*jshint camelcase:false*/
  if (bag.payload.pull_request.base) {
    bag.sha.isPullRequest = true;
    bag.sha.pullRequestBaseBranch = bag.payload.pull_request.base.ref;
    bag.sha.baseCommitRef = bag.payload.pull_request.base.ref;
    bag.sha.beforeCommitSha = bag.payload.pull_request.base.sha;
    bag.sha.branchName = bag.payload.pull_request.base.ref;
  }

  if (bag.payload.pull_request.state === 'closed') {
    bag.sha.isPullRequest = false;
    bag.sha.isPullRequestClose = true;
  }

  if (bag.payload.pull_request.head) {
    bag.sha.headCommitRef = bag.payload.pull_request.head.ref;
    bag.sha.commitSha = bag.payload.pull_request.head.sha;
    bag.sha.headPROrgName = bag.payload.pull_request.head.repo.owner.login;

    if (bag.payload.pull_request.head.repo)
      bag.sha.pullRequestRepoFullName =
        bag.payload.pull_request.head.repo.full_name;
  }

  if (bag.payload.sender) {
    bag.sha.triggeredByLogin = bag.payload.sender.login;
    bag.sha.triggeredByAvatarUrl = bag.payload.sender.avatar_url;
    bag.sha.triggeredByDisplayName = bag.payload.sender.login;
  }

  bag.sha.commitUrl = bag.payload.pull_request.html_url;
  bag.sha.pullRequestNumber = bag.payload.number;
  bag.sha.compareUrl = util.format('%s/files', bag.sha.commitUrl);
  /*jshint camelcase:true*/

  return next();
}


function _digestCommitContent(bag, next) {
  if (!bag.sha.commitSha) return next();
  var who = bag.who + '|' + _digestCommitContent.name;
  console.log(who, 'Inside');

  bag.adapter.getCommitContent(bag.params.subscriptionOrgName,
    bag.params.projectName, bag.sha.commitSha,
    function (err, commitData) {
      if (err) {
        var msg = util.format('%s, Error getting commit content for ' +
          'subscription:%s, project:%s, sha:%s with err:%s',
          who, bag.params.subscriptionOrgName,
          bag.params.projectName, bag.sha.commitSha, err);
        return next(msg);
      }
      bag.sha.commitMessage = commitData.commit && commitData.commit.message;

      if (commitData.commit) {
        if (commitData.commit.committer) {
          bag.sha.committerEmail = commitData.commit.committer.email;
          bag.sha.committerDisplayName = commitData.commit.committer.name;
        }

        if (commitData.commit.author) {
          bag.sha.lastAuthorEmail = commitData.commit.author.email;
          bag.sha.lastAuthorDisplayName = commitData.commit.author.name;
        }
      }

      /*jshint camelcase:false*/
      if (commitData.committer) {
        bag.sha.committerLogin = commitData.committer.login;
        bag.sha.committerAvatarUrl = commitData.committer.avatar_url;
      }

      if (commitData.author) {
        bag.sha.lastAuthorLogin = commitData.author.login;
        bag.sha.lastAuthorAvatarUrl = commitData.author.avatar_url;
      }

      var headRepo = bag.payload.pull_request.head &&
        bag.payload.pull_request.head.repo &&
        bag.payload.pull_request.head.repo.full_name;

      if ((!bag.params.isPrivateRepository) &&
        headRepo !== bag.params.projectFullName)
        bag.sha.skipDecryption = false;
      /*jshint camelcase:true*/

      return next();
    }
  );
}

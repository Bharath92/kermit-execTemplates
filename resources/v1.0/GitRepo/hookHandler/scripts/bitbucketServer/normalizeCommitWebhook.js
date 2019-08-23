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
    sha: {
      providerDomain: url.parse(params.providerUrl).host,
      isPullRequest: false,
      baseCommitRef: '',
      headCommitRef: '',
      headPROrgName: '',
      skipDecryption: false
    }
  };

  bag.who = util.format('bitbucketServer|%s|hookId:%s',
    self.name, bag.params.hookId);
  console.log(bag.who, 'Starting');

  async.series([
      _checkInputParams.bind(null, bag),
      _normalizePayload.bind(null, bag),
      _getCommitContent.bind(null, bag)
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
  var projectKey = bag.params.projectFullName.split('/')[0];
  var repoSlug = bag.params.projectFullName.split('/')[1];

  if (bag.payload.refChanges) {
    bag.sha.branchName = _.first(bag.payload.refChanges).ref.displayId;
    bag.sha.commitSha = _.first(bag.payload.refChanges).toHash;
    bag.sha.beforeCommitSha = _.first(bag.payload.refChanges).fromHash;
    bag.sha.commitUrl = util.format('%s/projects/%s/repos/%s/commits/%s',
      bag.params.providerUrl, projectKey, repoSlug, bag.sha.commitSha);
    bag.sha.commitMessage = _.first(bag.payload.changesets).toCommit.message;
    bag.sha.triggeredByLogin =
      _.first(bag.payload.changesets).toCommit.author.name;
    bag.sha.committerEmail =
      _.first(bag.payload.changesets).toCommit.author.email;
    bag.sha.committerDisplayName =
      _.first(bag.payload.changesets).toCommit.author.name;
    bag.sha.lastAuthorEmail =
      _.first(bag.payload.changesets).toCommit.author.email;
    bag.sha.lastAuthorDisplayName =
      _.first(bag.payload.changesets).toCommit.author.name;
  } else {
    bag.sha.branchName = _.first(bag.payload.changes).ref.displayId;
    bag.sha.commitSha = _.first(bag.payload.changes).toHash;
    bag.sha.beforeCommitSha = _.first(bag.payload.changes).fromHash;
    bag.sha.commitUrl = util.format('%s/projects/%s/repos/%s/commits/%s',
      bag.params.providerUrl, projectKey, repoSlug, bag.sha.commitSha);
    bag.sha.commitMessage = '';
    bag.sha.triggeredByLogin = bag.payload.actor.name;
    bag.sha.committerEmail = bag.payload.actor.emailAddress;
    bag.sha.committerDisplayName = bag.payload.actor.displayName;
    bag.sha.lastAuthorEmail = bag.payload.actor.emailAddress;
    bag.sha.lastAuthorDisplayName = bag.payload.actor.displayName;
  }

  return next();
}

// For user basic bbs, payload does not have commit message
// we need to get commit by sha for that
function _getCommitContent(bag, next) {
  if (bag.sha.commitMessage) return next();

  var who = bag.who + '|' + _getCommitContent.name;
  console.log(who, 'Inside');

  bag.adapter = new Adapter(bag.params.providerIntegrationValues,
    bag.params.providerUrl);

  bag.slugs = bag.params.projectFullName.split('/');
  var projectKey = bag.slugs[0];
  var repoName = bag.slugs[1];

  bag.adapter.getCommits(projectKey, repoName, bag.sha.commitSha,
    function (err, commit) {
      if (err)
        return next(who + ' Error getting repo refs');

      bag.sha.commitMessage = commit.message;
      return next();
    }
  );
}

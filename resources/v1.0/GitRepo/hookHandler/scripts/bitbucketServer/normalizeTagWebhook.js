'use strict';

var self = normalizeTagWebhook;
module.exports = self;

var async = require('async');
var _ = require('underscore');
var util = require('util');

var GenShaHash = require('../GenShaHash.js');
var Adapter = require('./Adapter.js');

function normalizeTagWebhook(params, callback) {
  var bag = {
    params: params,
    sha: {
      providerDomain: '',
      isPullRequest: false,
      skipDecryption: false,
      isGitTag: true,
      gitTagName: null
    }
  };

  bag.who = util.format('bitbucketServer|%s|hookId:%s',
    self.name, bag.params.hookId);
  console.log(bag.who, 'Starting');

  async.series([
      _checkInputParams.bind(null, bag),
      _processWebhookPayload.bind(null, bag),
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

  if (bag.payload.refChanges) {
    if (!bag.payload.changesets)
      return next('Missing property changesets in webhook payload');

    var changeSets = _.first(bag.payload.changesets);
    if (changeSets && changeSets.toCommit)
      return next();

    //if we get here its an error
    return next(who + ' Could not find any new commits');
  } else {
    if (!bag.payload.changes)
      return next('Missing property changes in webhook payload');

    if (!bag.payload.actor)
      return next('Missing property actor in webhook payload');
  }

  return next();
}

function _processWebhookPayload(bag, next) {
  var who = bag.who + '|' + _processWebhookPayload.name;
  console.log(who, 'Inside');

  if (bag.payload.refChanges) {
    var changeSets = _.first(bag.payload.changesets);
    var refChanges = _.first(bag.payload.refChanges);
    var branch = refChanges.ref.displayId.match(/refs\/tags\/(.*)/);
    bag.sha.branchName = branch[1] || refChanges.ref.displayId;
    bag.sha.gitTagName = branch[1] || refChanges.ref.displayId;
    bag.sha.commitSha = refChanges.toHash;
    bag.sha.commitMessage = changeSets.toCommit.message;
    bag.sha.lastAuthorEmail = changeSets.toCommit.author.email;
    bag.sha.lastAuthorLogin = changeSets.toCommit.author.name ||
      bag.payload.actor.username;
    bag.sha.beforeCommitSha = refChanges.fromHash;
    bag.sha.committerLogin = changeSets.toCommit.author.name ||
      bag.payload.actor.username;

    if (bag.payload.repository.project.owner)
      bag.sha.owner = bag.payload.repository.project.owner.username;
    bag.sha.triggeredByLogin = bag.payload.actor.username ||
      changeSets.toCommit.author.name;

    if (!bag.sha.commitSha || !bag.sha.beforeCommitSha) return next();

    bag.sha.commitUrl = util.format(
      '%s/projects/%s/repos/%s/commits/%s',
      bag.params.providerUrl, bag.payload.repository.project.key,
      bag.payload.repository.slug, bag.sha.commitSha);
  } else {
    bag.sha.branchName = _.first(bag.payload.changes).ref.displayId;
    bag.sha.gitTagName = _.first(bag.payload.changes).ref.displayId;
    bag.sha.commitSha =  _.first(bag.payload.changes).toHash;
    bag.sha.beforeCommitSha = _.first(bag.payload.changes).fromHash;
    bag.sha.commitMessage = '';
    bag.sha.lastAuthorEmail = bag.payload.actor.emailAddress;
    bag.sha.lastAuthorLogin = bag.payload.actor.name;
    bag.sha.committerLogin = bag.payload.actor.name;
    bag.sha.triggeredByLogin = bag.payload.actor.name;

    if (!bag.sha.commitSha || !bag.sha.beforeCommitSha) return next();

    bag.sha.commitUrl = util.format(
      '%s/projects/%s/repos/%s/commits/%s',
      bag.params.providerUrl, bag.payload.repository.project.key,
      bag.payload.repository.slug, bag.sha.commitSha);
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

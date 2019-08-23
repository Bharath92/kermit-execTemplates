'use strict';

var self = normalizePRWebhook;
module.exports = self;

var async = require('async');
var _ = require('underscore');
var url = require('url');
var util = require('util');

var runTypes = require('../runTypes.js');
var GenShaHash = require('../GenShaHash.js');

function normalizePRWebhook(params, callback) {
  var bag = {
    params: params,
    sha: {
      providerDomain: '',
      isPullRequest: true,
      skipDecryption: true
    }
  };

  bag.who = util.format('bitbucketServer|%s|hookId:%s',
    self.name, bag.params.hookId);
  console.log(bag.who, 'Starting');

  async.series([
      _checkInputParams.bind(null, bag),
      _processWebhookPayload.bind(null, bag)
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

function _processWebhookPayload(bag, next) {
  var who = bag.who + '|' + _processWebhookPayload.name;
  console.log(who, 'Inside');

  var pullRequestSourceUrl;
  var repoSshUrl;

  if (bag.payload.refChanges) {
    if (bag.payload.sourceRepositoryCloneLinks) {
      if (bag.params.isPrivateRepository) {
        pullRequestSourceUrl = _.findWhere(
          bag.payload.sourceRepositoryCloneLinks, {'name': 'ssh'}).href;
      } else {
        if (_.findWhere(bag.payload.sourceRepositoryCloneLinks,
          {'name': 'https'}))
          pullRequestSourceUrl = _.findWhere(
            bag.payload.sourceRepositoryCloneLinks, {'name': 'https'}).href;
        else
          pullRequestSourceUrl = _.findWhere(
            bag.payload.sourceRepositoryCloneLinks, {'name': 'http'}).href;
      }
    } else {
      repoSshUrl = url.parse(bag.params.projectSshURL);
      pullRequestSourceUrl = util.format('ssh://git@%s/%s/%s.git',
        repoSshUrl.host, bag.payload.repository.project.key,
        bag.payload.repository.slug);
    }
    // TODO: remove `bag.payload.repository` as destinationRepo
    // once addon is updated
    var destinationRepo =
      bag.payload.destinationRepository || bag.payload.repository;

    bag.sha.pullRequestSourceUrl = pullRequestSourceUrl.toLowerCase();
    bag.sha.pullRequestBaseBranch = bag.payload.destinationBranch;
    bag.sha.baseCommitRef = bag.payload.destinationBranch;
    bag.sha.beforeCommitSha = _.first(bag.payload.refChanges).toHash;
    bag.sha.branchName = bag.payload.destinationBranch;
    bag.sha.headCommitRef = bag.payload.sourceBranch;
    bag.sha.commitSha = _.first(bag.payload.refChanges).fromHash;
    bag.sha.pullRequestNumber = bag.payload.PRNumber;
    bag.sha.lastAuthorLogin = bag.payload.PRAuthorName;
    bag.sha.committerLogin = bag.payload.PRAuthorName;
    bag.sha.triggeredByLogin = bag.payload.PRAuthorName;
    bag.sha.headPROrgName = bag.payload.repository.project.key;
    bag.sha.commitUrl = util.format(
      '%s/projects/%s/repos/%s/pull-requests/%s/commits',
      bag.params.providerUrl, destinationRepo.project.key,
      bag.payload.repository.slug, bag.payload.PRNumber);
    bag.sha.compareUrl = util.format(
      '%s/projects/%s/repos/%s/pull-requests/%s/diff',
      bag.params.providerUrl, destinationRepo.project.key,
      bag.payload.repository.slug, bag.payload.PRNumber);

    bag.sha.commitMessage = bag.payload.PRDescription;
    bag.sha.pullRequestRepoFullName = bag.payload.repository.project.key +
      '/' + bag.payload.repository.name;
  } else {
    repoSshUrl = url.parse(bag.params.projectSshURL);
    pullRequestSourceUrl = util.format('ssh://git@%s/%s/%s.git',
      repoSshUrl.host, bag.payload.pullRequest.fromRef.repository.project.key,
      bag.payload.pullRequest.toRef.repository.slug);

    bag.sha.pullRequestSourceUrl = pullRequestSourceUrl.toLowerCase();
    bag.sha.pullRequestBaseBranch = bag.payload.pullRequest.toRef.displayId;
    bag.sha.baseCommitRef = bag.payload.pullRequest.toRef.displayId;
    bag.sha.beforeCommitSha = bag.payload.pullRequest.toRef.latestCommit;
    bag.sha.branchName = bag.payload.pullRequest.toRef.displayId;
    bag.sha.headCommitRef = bag.payload.pullRequest.fromRef.displayId;
    bag.sha.commitSha = bag.payload.pullRequest.fromRef.latestCommit;
    bag.sha.pullRequestNumber = bag.payload.pullRequest.id;
    bag.sha.lastAuthorLogin =  bag.payload.pullRequest.author.user.name;
    bag.sha.committerLogin = bag.payload.pullRequest.author.user.name;
    bag.sha.triggeredByLogin = bag.payload.pullRequest.author.user.name;
    bag.sha.headPROrgName =
      bag.payload.pullRequest.fromRef.repository.project.key;
    bag.sha.commitUrl = util.format(
      '%s/projects/%s/repos/%s/pull-requests/%s/commits',
      bag.params.providerUrl,
      bag.payload.pullRequest.toRef.repository.project.key,
      bag.payload.pullRequest.toRef.repository.slug, bag.sha.pullRequestNumber);
    bag.sha.compareUrl = util.format(
      '%s/projects/%s/repos/%s/pull-requests/%s/diff',
      bag.params.providerUrl,
      bag.payload.pullRequest.toRef.repository.project.key,
      bag.payload.pullRequest.toRef.repository.slug, bag.sha.pullRequestNumber);

    bag.sha.commitMessage = bag.payload.pullRequest.title;
    bag.sha.pullRequestRepoFullName =
      bag.payload.pullRequest.fromRef.repository.project.key +
      '/' + bag.payload.pullRequest.fromRef.repository.name;
  }

  if (bag.params.runType === runTypes.WEBHOOK_PR_CLOSE) {
    bag.sha.isPullRequest = false;
    bag.sha.isPullRequestClose = true;
  }

  return next();
}

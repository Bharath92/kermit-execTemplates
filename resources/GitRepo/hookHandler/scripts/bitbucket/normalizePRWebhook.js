'use strict';

var self = normalizePRWebhook;
module.exports = self;

var async = require('async');
var _ = require('underscore');
var util = require('util');

var GenShaHash = require('../GenShaHash.js');
var Adapter = require('./Adapter.js');

function normalizePRWebhook(params, callback) {
  var bag = {
    params: params,
    sha: {
      providerDomain: 'bitbucket.org',
      isPullRequest: true,
      skipDecryption: true
    }
  };

  bag.who = util.format('bitbucket|%s|hookId:%s',
    self.name, bag.params.hookId);
  console.log(bag.who, 'Starting');

  async.series([
      _checkInputParams.bind(null, bag),
      _buildCloneUrl.bind(null, bag),
      _ensureReadAccess.bind(null, bag),
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

  if (!bag.params.webhookPayload.pullrequest)
   return next('Missing webhook payload.pullrequest');

  var missing = [];

  var pullRequestPayload = bag.params.webhookPayload.pullrequest;

  if (_.isObject(pullRequestPayload.destination)) {
    if (!_.isObject(pullRequestPayload.destination.branch))
      missing.push('destination.branch');
    if (!_.isObject(pullRequestPayload.destination.commit))
      missing.push('destination.commit');
  } else {
    missing.push('destination');
  }

  if (_.isObject(pullRequestPayload.source)) {
    if (!_.isObject(pullRequestPayload.source.branch))
      missing.push('source.branch');
    if (!_.isObject(pullRequestPayload.source.commit))
      missing.push('source.commit');
  } else {
    missing.push('source');
  }

  if (_.isObject(pullRequestPayload.author)) {
    if (!_.isObject(pullRequestPayload.author.links) ||
      !_.isObject(pullRequestPayload.author.links.avatar))
      missing.push('author.links.avatar');
  } else {
    missing.push('author');
  }

  if (_.isObject(pullRequestPayload.links)) {
    if (!_.isObject(pullRequestPayload.links.html))
      missing.push('links.html');
  } else {
    missing.push('links');
  }

  if (!_.isEmpty(missing))
    return next(missing.join(',') + ' not found in webhook payload');

  bag.payload = bag.params.webhookPayload;

  bag.adapter =
    new Adapter(bag.params.providerIntegrationValues.token,
      bag.params.providerUrl, bag.params.providerIntegrationValues.username);

  return next();
}

function _buildCloneUrl(bag, next) {
  if (_.isEmpty(bag.params.customCloneUrl)) return next();

  var who = bag.who + '|' + _buildCloneUrl.name;
  console.log(who, 'Inside');

  /* jshint camelcase: false */
  var splitSourceName =
    bag.payload.pullrequest.source.repository.full_name.split('/');
  var sourceUser = splitSourceName[0];
  var sourceRepo = splitSourceName[1];
  /* jshint camelcase: true */

  // Use whatever protocol the custom clone URL uses.
  if (bag.params.customCloneUrl.startsWith('ssh'))
    bag.sha.pullRequestSourceUrl = util.format(
      'ssh://git@bitbucket.org/%s/%s.git', sourceUser, sourceRepo
    );
  else if (bag.params.customCloneUrl.startsWith('https'))
    bag.sha.pullRequestSourceUrl = util.format(
      'https://bitbucket.org/%s/%s.git', sourceUser, sourceRepo
    );
  else if (bag.params.customCloneUrl.startsWith('http'))
    bag.sha.pullRequestSourceUrl = util.format(
      'http://bitbucket.org/%s/%s.git', sourceUser, sourceRepo
    );

  return next();
}

function _ensureReadAccess(bag, next) {
  if (!_.isEmpty(bag.params.customCloneUrl)) return next();

  var who = bag.who + '|' + _ensureReadAccess.name;
  console.log(who, 'Inside');

  /*jshint camelcase:false*/
  var splitSourceName =
    bag.payload.pullrequest.source.repository.full_name.split('/');
  bag.sourceUser = splitSourceName[0];
  bag.sourceRepo = splitSourceName[1];

  bag.adapter.getRepository(
    bag.sourceUser,
    bag.sourceRepo,
    function(err, repo) {
      if (err) {
        // This is a private repository, build the ssh key
        if (err.statusCode === 403) {
          bag.sha.pullRequestSourceUrl = util.format(
            'ssh://git@bitbucket.org/%s/%s.git', bag.sourceUser, bag.sourceRepo
          );
          return next();
        }

        return next('Failed to obtain PR repository.');
      }

      if (repo.is_private)
        bag.sha.pullRequestSourceUrl =
          _.findWhere(repo.links.clone, { name: 'ssh' }).href;
      else
        bag.sha.pullRequestSourceUrl =
          _.findWhere(repo.links.clone, { name: 'https' }).href;

      return next();
    }
  );
  /*jshint camelcase:true*/
}

function _processWebhookPayload(bag, next) {
  var who = bag.who + '|' + _processWebhookPayload.name;
  console.log(who, 'Inside');

  var pullRequestPayload = bag.payload.pullrequest;

  bag.sha.pullRequestBaseBranch = pullRequestPayload.destination.branch.name;
  bag.sha.baseCommitRef = pullRequestPayload.destination.branch.name;
  bag.sha.beforeCommitSha = pullRequestPayload.destination.commit.hash;
  bag.sha.branchName = pullRequestPayload.destination.branch.name;
  bag.sha.headCommitRef = pullRequestPayload.source.branch.name;
  bag.sha.commitSha = pullRequestPayload.source.commit.hash;
  bag.sha.pullRequestNumber = pullRequestPayload.id;

  bag.sha.lastAuthorLogin = pullRequestPayload.author.username;
  bag.sha.lastAuthorAvatarUrl = pullRequestPayload.author.links.avatar.href;
  bag.sha.committerLogin = pullRequestPayload.author.username;
  bag.sha.committerAvatarUrl = pullRequestPayload.author.links.avatar.href;
  bag.sha.triggeredByLogin = pullRequestPayload.author.username;
  bag.sha.triggeredByAvatarUrl = pullRequestPayload.author.links.avatar.href;
  bag.sha.headPROrgName = pullRequestPayload.author.username;

  bag.sha.commitUrl = pullRequestPayload.links.html.href;
  bag.sha.compareUrl = pullRequestPayload.links.html.href;
  bag.sha.commitMessage = pullRequestPayload.title;

  /*jshint camelcase:false*/
  if (pullRequestPayload.source && pullRequestPayload.source.repository)
    bag.sha.pullRequestRepoFullName =
      pullRequestPayload.source.repository.full_name;
  /*jshint camelcase:true*/
  if (pullRequestPayload.state === 'DECLINED') {
    bag.sha.isPullRequest = false;
    bag.sha.isPullRequestClose = true;
  }

  return next();
}

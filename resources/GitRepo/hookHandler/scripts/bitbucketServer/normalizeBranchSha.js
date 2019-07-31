'use strict';

var self = normalizeBranchSha;
module.exports = self;

var async = require('async');
var url = require('url');
var util = require('util');

var GenShaHash = require('../GenShaHash.js');
var Adapter = require('./Adapter.js');

function normalizeBranchSha(params, callback) {
  var bag = {
    params: params,
    sha: {
      branchName: params.branchName,
      providerDomain: url.parse(params.providerUrl).host,
      isPullRequest: false,
      baseCommitRef: '',
      skipDecryption: false
    }
  };

  bag.who = util.format('bitbucketServer|%s|hookId:%s',
    self.name, bag.params.hookId);
  console.log(bag.who, 'Starting');

  async.series([
      _checkInputParams.bind(null, bag),
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

  if (!bag.params.branchName)
    return next(who + ' Missing params data: branchName');
  else
    bag.sha.branchName = bag.params.branchName;

  bag.adapter =
    new Adapter(bag.params.providerIntegrationValues, bag.params.providerUrl);

  return next();
}

function _getCommitContent(bag, next) {
  var who = bag.who + '|' + _getCommitContent.name;
  console.log(who, 'Inside');

  bag.slugs = bag.params.projectFullName.split('/');
  var projectKey = bag.slugs[0];
  var repoName = bag.slugs[1];

  bag.adapter.getCommits(projectKey, repoName, bag.params.branchName,
    function (err, commit) {
      if (err)
        return next(who + ' Error getting repo refs');

      bag.sha.commitSha = commit.id;
      bag.sha.commitMessage = commit.message;
      bag.sha.lastAuthorEmail = commit.author.emailAddress;
      bag.sha.lastAuthorLogin = commit.author.name;
      bag.sha.committerEmail = commit.author.emailAddress;
      bag.sha.committerDisplayName = commit.author.name;
      var projectKey = bag.params.projectFullName.split('/')[0];
      var repoSlug = bag.params.projectFullName.split('/')[1];
      bag.sha.commitUrl = util.format('%s/projects/%s/repos/%s/commits/%s',
        bag.params.providerUrl, projectKey, repoSlug, bag.sha.commitSha);

      return next();
    }
  );
}

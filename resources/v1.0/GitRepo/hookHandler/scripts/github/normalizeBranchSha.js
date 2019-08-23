'use strict';

var self = normalizeBranchSha;
module.exports = self;

var async = require('async');
var util = require('util');

var GenShaHash = require('../GenShaHash.js');
var Adapter = require('./Adapter.js');

function normalizeBranchSha(params, callback) {
  var bag = {
    params: params,
    adapter: new Adapter(params.providerIntegrationValues.token,
      params.providerUrl),
    sha: {
      branchName: params.branchName,
      providerDomain: 'github.com',
      isPullRequest: false,
      baseCommitRef: '',
      skipDecryption: false
    }
  };

  bag.who = util.format('github|%s|hookId:%s', self.name, bag.params.hookId);
  console.log(bag.who, 'Starting');

  async.series([
      _checkInputParams.bind(null, bag),
      _getCommitSha.bind(null, bag),
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

  bag.sha.branchName = bag.params.branchName;
  return next();
}

function _getCommitSha(bag, next) {
  var who = bag.who + '|' + _getCommitSha.name;
  console.log(who, 'Inside');

  bag.adapter.getReference(bag.params.subscriptionOrgName,
    bag.params.projectName, bag.params.branchName,
    function (err, ref) {
      if (err) {
        if (err === 409)
          return next(who + ' Empty repository');
        else
          return next(who + ' Error: Unable to get repository ' +
            'references. Please make sure the repository exists and has ' +
            'correct permissions.'
          );
      }

      if (ref.object)
        bag.sha.commitSha = ref.object.sha;

      if (Array.isArray(ref))
        ref.forEach(
          function (reference) {
            if (reference.ref === 'refs/heads/' + bag.params.branchName)
              bag.sha.commitSha = reference.object.sha;
          }
        );
      return next();
    }
  );
}

function _getCommitContent(bag, next) {
  if (!bag.sha.commitSha) return next();

  var who = bag.who + '|' + _getCommitContent.name;
  console.log(who, 'Inside');

  bag.adapter.getCommitContent(bag.params.subscriptionOrgName,
    bag.params.projectName, bag.sha.commitSha,
    function (err, commitData) {
      if (err)
        return next(who + ' Error getting commit content');

      if (commitData.parents && commitData.parents.length)
        bag.sha.beforeCommitSha = commitData.parents[0] &&
          commitData.parents[0].sha;
      /*jshint camelcase:false*/
      bag.sha.commitUrl = commitData.html_url;
      if (!bag.sha.commitUrl) {
        if (commitData.commit && commitData.commit.html_url)
          bag.sha.commitUrl = commitData.commit.html_url;
        else if (commitData.html_url)
          bag.sha.commitUrl = commitData.html_url;
      }
      /*jshint camelcase:true*/
      bag.sha.commitMessage = commitData.commit && commitData.commit.messages;

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

      if (commitData.committer) {
        bag.sha.committerLogin = commitData.committer.login;
        /*jshint camelcase:false*/
        bag.sha.committerAvatarUrl = commitData.committer.avatar_url;
        /*jshint camelcase:true*/
      }

      if (commitData.author) {
        bag.sha.lastAuthorLogin = commitData.author.login;
        /*jshint camelcase:false*/
        bag.sha.lastAuthorAvatarUrl = commitData.author.avatar_url;
        /*jshint camelcase:true*/
      }

      var sha = bag.sha;
      if (sha.compareUrl || !sha.commitSha || !sha.beforeCommitSha)
        return next();

      bag.sha.compareUrl =
        util.format('https://github.com/%s/%s/compare/%s...%s',
          bag.params.subscriptionOrgName, bag.params.projectName,
          bag.sha.beforeCommitSha, bag.sha.commitSha);
      return next();
    }
  );
}

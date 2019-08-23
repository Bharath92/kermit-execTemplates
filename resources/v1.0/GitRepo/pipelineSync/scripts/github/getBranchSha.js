'use strict';

var self = getBranchSha;
module.exports = self;

var async = require('async');
var util = require('util');

var GenShaHash = require('../GenShaHash.js');
var Adapter = require('./Adapter.js');

function getBranchSha(params, callback) {
  var bag = {
    params: params,
    sha: {
      branchName: null,
      providerDomain: 'github.com',
      isPullRequest: false,
      baseCommitRef: '',
      skipDecryption: false
    }
  };

  bag.who = util.format('github|%s|resourceId:%s',
    self.name, bag.params.resourceId);
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

  var missing = [];

  if (!bag.params)
    missing.push('bag.params');

  if (!bag.params.providerIntegrationValues)
    missing.push('bag.params.providerIntegrationValues');

  if (!bag.params.providerUrl)
    missing.push('bag.params.providerUrl');

  if (!bag.params.projectFullName)
    missing.push('bag.params.projectFullName');

  if (!bag.params.branchName)
    missing.push('bag.params.branchName');

  if (missing.length > 0)
    return next(util.format('%s is missing: %s', who, bag.missing.join(', ')));

  bag.adapter = new Adapter(bag.params.providerIntegrationValues.token,
    bag.params.providerUrl);

  bag.sha.branchName = bag.params.branchName;

  return next();
}

function _getCommitSha(bag, next) {
  var who = bag.who + '|' + _getCommitSha.name;
  console.log(who, 'Inside');

  var name = bag.params.projectFullName.split('/');

  bag.adapter.getReference(name[0], name[1], bag.params.branchName,
    function (err, ref) {
      if (err) {
        if (err === 409)
          return next('Empty repository');

        return next('Unable to get repository references. Please make sure ' +
          'the repository exists and the integration has permission.');
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

  var name = bag.params.projectFullName.split('/');

  bag.adapter.getCommitContent(name[0], name[1], bag.sha.commitSha,
    function (err, commitData) {
      if (err)
        return next('Commit not found');

      if (commitData.parents && commitData.parents.length)
        bag.sha.beforeCommitSha = (commitData.parents[0] &&
          commitData.parents[0].sha) || null;
      /*jshint camelcase:false*/
      bag.sha.commitUrl = commitData.html_url;
      if (!bag.sha.commitUrl)
        bag.sha.commitUrl = (commitData.commit && commitData.commit.html_url) ||
          null;
      /*jshint camelcase:true*/
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

      //not sure why we need this chec. but var is to reduce length of line
      var sha = bag.sha;
      if (sha.compareUrl || !sha.commitSha || !sha.beforeCommitSha)
        return next();

      bag.sha.compareUrl =
        util.format('https://github.com/%s/compare/%s...%s',
          bag.params.projectFullName, bag.sha.beforeCommitSha,
          bag.sha.commitSha);
      return next();
    }
  );
}

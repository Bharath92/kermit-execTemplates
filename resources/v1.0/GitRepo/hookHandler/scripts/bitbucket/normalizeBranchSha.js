'use strict';

var self = normalizeBranchSha;
module.exports = self;

var async = require('async');
var emailAddresses = require('email-addresses');
var util = require('util');

var GenShaHash = require('../GenShaHash.js');
var Adapter = require('./Adapter.js');

function normalizeBranchSha(params, callback) {
  var bag = {
    params: params,
    sha: {
      branchName: params.branchName,
      providerDomain: 'bitbucket.org',
      isPullRequest: false,
      baseCommitRef: '',
      headCommitRef: '',
      skipDecryption: false
    }
  };

  bag.who = util.format('bitbucket|%s|hookId:%s',
    self.name, bag.params.hookId);
  console.log(bag.who, 'Starting');

  async.series([
      _checkInputParams.bind(null, bag),
      _getCommit.bind(null, bag)
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

  bag.adapter =
    new Adapter(bag.params.providerIntegrationValues.token,
      bag.params.providerUrl, bag.params.providerIntegrationValues.username);

  return next();
}

function _getCommit(bag, next) {
  var who = bag.who + '|' + _getCommit.name;
  console.log(who, 'Inside');

  bag.adapter.getBranchSha(bag.params.subscriptionOrgName,
    bag.params.projectName, bag.params.branchName,
    function (err, commit) {
      if (err) {
        if (err.statusCode === 404)
          return next(who + ' Empty repository');
        else
          return next(who + util.format(
            'getCommit returned an error %s with response %s',
            err.statusCode, err.data)
          );
      }

      if (!commit.target)
        return next(util.format('Unable to find the new commit' +
          ' details for branch %s', commit.name));

      bag.sha.commitSha = commit.target.hash;
      bag.sha.commitUrl = commit.target.links.html.href;
      bag.sha.commitMessage = commit.target.message;
      bag.sha.beforeCommitSha = commit.target.parents &&
        commit.target.parents[0] && commit.target.parents[0].hash;

      if (commit.target.author) {
        // commit.target.author.raw field is in format
        // Joseph Walton <jwalton@atlassian.com>
        // Hence try to extract email address from the field
        var parsed = emailAddresses.parseAddressList(commit.target.author.raw);
        if (parsed && parsed.length) {
          bag.sha.committerEmail = parsed[0].address;
          bag.sha.lastAuthorEmail = parsed[0].address;
        } else {
          bag.sha.committerEmail = commit.target.author.raw;
          bag.sha.lastAuthorEmail = commit.target.author.raw;
        }

        if (commit.target.author.user) {
          /*jshint camelcase:false*/
          bag.sha.committerLogin = commit.target.author.user.username;
          bag.sha.committerDisplayName = commit.target.author.user.display_name;
          bag.sha.committerAvatarUrl = (commit.target.author.user.links &&
            commit.target.author.user.links.avatar &&
            commit.target.author.user.links.avatar.href) || null;
          bag.sha.lastAuthorLogin = commit.target.author.user.username;
          bag.sha.lastAuthorDisplayName =
            commit.target.author.user.display_name;
          bag.sha.lastAuthorAvatarUrl = bag.sha.committerAvatarUrl;
          /*jshint camelcase:true*/
        }
      }

      var sha = bag.sha;
      if (sha.compareUrl || !sha.commitSha || !sha.beforeCommitSha) {
        bag.sha.compareUrl = '';
        return next();
      }

      bag.sha.compareUrl = util.format(
        'https://bitbucket.org/%s/branches/compare/%s..%s#diff',
        bag.params.projectFullName,
        bag.sha.commitSha,
        bag.sha.beforeCommitSha);
      return next();
    }
  );
}

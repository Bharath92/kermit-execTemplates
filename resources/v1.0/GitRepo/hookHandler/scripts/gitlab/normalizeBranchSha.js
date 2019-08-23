'use strict';

var self = normalizeBranchSha;
module.exports = self;

var async = require('async');
var _ = require('underscore');
var url = require('url');
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
      providerDomain: url.parse(params.providerUrl).host,
      isPullRequest: false,
      baseCommitRef: '',
      skipDecryption: false
    }
  };

  bag.who = util.format('gitlab|%s|hookId:%s', self.name, bag.params.hookId);
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

  return next();
}

function _getCommitContent(bag, next) {
  var who = bag.who + '|' + _getCommitContent.name;
  console.log(who, 'Inside');

  bag.adapter.getCommits(bag.params.projectFullName, bag.params.branchName,
    function (err, commits) {
      if (err)
        return next(who + ' Error getting repo refs');

      /* jshint camelcase:false */
      bag.latestCommit = _.first(commits);
      bag.sha.commitSha = bag.latestCommit.id;
      bag.sha.commitMessage = bag.latestCommit.message;
      bag.sha.lastAuthorEmail = bag.latestCommit.author_email;
      bag.sha.lastAuthorDisplayName = bag.latestCommit.author_name;
      bag.sha.committerEmail = bag.latestCommit.author_email;
      bag.sha.committerDisplayName = bag.latestCommit.author_name;
      // Remove /api/v3 from the providerUrl, trailing slashes aren't allowed.
      var providerDomain =
        bag.params.providerUrl.split('/').slice(0, -2).join('/');
      bag.sha.commitUrl =
        util.format('%s/%s/commit/%s',
          providerDomain, bag.params.projectFullName, bag.sha.commitSha
        );
      /* jshint camelcase:true */

      return next();
    }
  );
}

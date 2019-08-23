'use strict';

var self = getBranchSha;
module.exports = self;

var async = require('async');
var url = require('url');
var util = require('util');

var GenShaHash = require('../GenShaHash.js');
var Adapter = require('./Adapter.js');

function getBranchSha(params, callback) {
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

  bag.who = util.format('bitbucketServer|%s|resourceId:%s',
    self.name, bag.params.resourceId);
  console.log(bag.who, 'Starting');

  async.series([
      _checkInputParams.bind(null, bag),
      _getCommitContent.bind(null, bag)
    ],
    function (err) {
      var error = false;
      if (err)
        console.log(bag.who, 'Completed with errors');
      else
        console.log(bag.who, 'Completed');
      return callback(error, new GenShaHash(bag.sha));
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

  bag.sha.branchName = bag.params.branchName;

  bag.adapter =
    new Adapter(bag.params.providerIntegrationValues, bag.params.providerUrl);

  return next();
}

function _getCommitContent(bag, next) {
  var who = bag.who + '|' + _getCommitContent.name;
  console.log(who, 'Inside');

  var slugs = bag.params.projectFullName.split('/');
  var projectKey = slugs[0];
  var repoName = slugs[1];

  bag.adapter.getCommits(projectKey, repoName, bag.params.branchName,
    function (err, commit) {
      if (err)
        return next('Error getting commit reference');

      /* jshint camelcase:false */
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
      /* jshint camelcase:true */

      return next();
    }
  );
}

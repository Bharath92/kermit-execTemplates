'use strict';

var self = getBranchSha;
module.exports = self;

var async = require('async');
var _ = require('underscore');
var url = require('url');
var util = require('util');

var GenShaHash = require('../GenShaHash.js');
var Adapter = require('./Adapter.js');

function getBranchSha(params, callback) {
  var bag = {
    params: params,
    sha: {
      branchName: null,
      providerDomain: url.parse(params.providerUrl).host,
      isPullRequest: false,
      baseCommitRef: '',
      headCommitRef: '',
      skipDecryption: false
    }
  };

  bag.who = util.format('gitlab|%s|resourceId:%s',
    self.name, bag.params.resourceId);
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

function _getCommit(bag, next) {
  var who = bag.who + '|' + _getCommit.name;
  console.log(who, 'Inside');

  bag.adapter.getCommits(bag.params.projectFullName, bag.params.branchName,
    function (err, commits) {
      if (err) {
        if (err.statusCode === 404)
          return next('Empty repository. Commit not found.');

        return next(util.format('Unable to get commit; getCommit returned ' +
          'an error %s with response %s', err.statusCode, err.data));
      }

      if (_.isEmpty(commits))
        return next(util.format(
          'No commits found for repository: %s and branch: %s',
          bag.params.projectFullName, bag.params.branchName));

      /* jshint camelcase:false */
      bag.latestCommit = _.first(commits);
      bag.sha.commitSha = bag.latestCommit.id;
      bag.sha.commitMessage = bag.latestCommit.message;
      bag.sha.lastAuthorEmail = bag.latestCommit.author_email;
      bag.sha.lastAuthorEmail = bag.latestCommit.author_name;
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

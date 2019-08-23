'use strict';

var self = getCommitDiffFiles;
module.exports = self;

var async = require('async');
var _ = require('underscore');
var util = require('util');

var GitHubAdapter = require('./Adapter.js');

function getCommitDiffFiles(params, callback) {
  var bag = {
    params: params,
    gitHubAdapter: null,
    fileList: []
  };

  bag.who = util.format('github|%s|projectFullName:%s|commitSha:%s',
    self.name, params.projectFullName, params.commitSha);
  console.log(bag.who, 'Starting');

  async.series([
      _checkInputParams.bind(null, bag),
      _getFilePaths.bind(null, bag)
    ],
    function (err) {
      console.log(bag.who, 'Completed');

      return callback(err, bag.fileList);
    }
  );
}

function _checkInputParams(bag, next) {
  var who = bag.who + '|' + _checkInputParams.name;
  console.log(who, 'Inside');

  var missing = [];

  if (!bag.params.projectFullName)
    missing.push('bag.params.projectFullName');

  if (!bag.params.commitSha)
    missing.push('bag.params.commitSha');

  if (!bag.params.beforeCommitSha)
    missing.push('bag.params.beforeCommitSha');

  if (!bag.params.providerIntegrationValues)
    missing.push('bag.providerIntegrationValues');

  if (missing.length > 0)
    return next(util.format('%s is missing: %s', who, missing.join(', ')));

  bag.gitHubAdapter = new GitHubAdapter(
    bag.params.providerIntegrationValues.token,
    bag.params.providerUrl);
  return next();
}

function _getFilePaths(bag, next) {
  var who = bag.who + '|' + _getFilePaths.name;
  console.log(who, 'Inside');

  var nameArray = bag.params.projectFullName.split('/');
  var owner = nameArray[0];
  var repo = nameArray[1];
  var commitSha = bag.params.commitSha;
  var beforeCommitSha = bag.params.beforeCommitSha;
  bag.gitHubAdapter.getCompareDiff(owner, repo, beforeCommitSha, commitSha,
    function (err, diff) {
      if (err)
        return next('Failed to get compare diff: ' + util.inspect(err));

      bag.fileList = _.pluck(diff.files, 'filename');
      console.log(who, util.format('File list length: %s',
        bag.fileList.length));
      return next();
    }
  );
}

'use strict';

var self = getCommitDiffFiles;
module.exports = self;

var async = require('async');
var _ = require('underscore');
var util = require('util');
var BitbucketAdapter = require('./Adapter.js');

function getCommitDiffFiles(params, callback) {
  var bag = {
    params: params,
    bitbucketAdapter: null,
    fileList: []
  };

  bag.who = util.format('bitbucket|%s|projectFullName:%s|commitSha:%s',
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
    missing.push('bag.params.providerIntegrationValues');

  if (missing.length > 0)
    return next(util.format('%s is missing: %s', who, bag.missing.join(', ')));

  bag.bitbucketAdapter = new BitbucketAdapter(
    bag.params.providerIntegrationValues.token,
    bag.params.providerUrl, bag.params.providerIntegrationValues.username);

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
  bag.bitbucketAdapter.getCompareDiff(owner, repo, beforeCommitSha, commitSha,
    function (err, diff) {
      if (err)
        return next('Failed to get compare diff: ' + util.inspect(err));

      var lineArray = diff.split('\n');
      _.each(lineArray,
        function (line) {
          // in text diff, relevant lines always look like:
          // --- a/file/path.js
          // +++ b/file/path.js
          // take these lines and strip up to the first '/' to get a pure path.
          if (line.startsWith('+++') || line.startsWith('---')) {
            var shortLine = line.substr(6);
            bag.fileList.push(shortLine);
          }
        }
      );
      console.log(who, util.format('File list length: %s',
        bag.fileList.length));
      return next();
    }
  );
}

'use strict';

var self = normalizeRepo;
module.exports = self;

var async = require('async');
var util = require('util');
var _ = require('underscore');

var BitbucketServerAdapter = require('./Adapter.js');

function normalizeRepo(providerIntegrationValues, repoFullName, providerUrl,
  callback) {
  var bag = {
    providerIntegrationValues: providerIntegrationValues,
    repoFullName: repoFullName,
    providerUrl: providerUrl,
    sourceDefaultBranch: ''
  };

  bag.who = util.format('bitbucketServer|%s:%s', self.name, repoFullName);
  console.log(bag.who, 'Starting');

  async.series([
      _checkInputParams.bind(null, bag),
      _createAdapter.bind(null, bag),
      _getBranchesList.bind(null, bag)
    ],
    function (err) {
      console.log(bag.who, 'Completed');

      return callback(err, bag.sourceDefaultBranch);
    }
  );
}

function _checkInputParams(bag, next) {
  var who = bag.who + '|' + _checkInputParams.name;
  console.log(who, 'Inside');

  var missing = [];

  if (!bag.providerIntegrationValues)
    missing.push('bag.providerIntegrationValues');

  if (!bag.repoFullName)
    missing.push('bag.repoFullName');

  if (!bag.providerUrl)
    missing.push('bag.providerUrl');

  if (missing.length > 0)
    return next(util.format('%s is missing: %s', who, bag.missing.join(', ')));

  return next();
}

function _createAdapter(bag, next) {
  var who = bag.who + '|' + _createAdapter.name;
  console.log(who, 'Inside');

  bag.adapter = new BitbucketServerAdapter(bag.providerIntegrationValues,
    bag.providerUrl);

  return next();
}

function _getBranchesList(bag, next) {
  var who = bag.who + '|' + _getBranchesList.name;
  console.log(who, 'Inside');

  var slugs = bag.repoFullName.split('/');

  var projectKey = slugs[0];
  var repoName = slugs[1];

  bag.adapter.getProjectBranches(projectKey, repoName,
    function (err, branches) {
      if (err)
        return next('Failed to list branches for ' + bag.repoFullName);

      var defaultBranch = _.findWhere(branches, { isDefault: true });
      if (defaultBranch)
        bag.sourceDefaultBranch = defaultBranch.displayId;
      return next();
    }
  );
}

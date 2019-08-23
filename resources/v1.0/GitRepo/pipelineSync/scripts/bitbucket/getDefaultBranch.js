'use strict';

var self = getDefaultBranch;
module.exports = self;

var async = require('async');
var util = require('util');

var BitbucketAdapter = require('./Adapter.js');

function getDefaultBranch(providerIntegrationValues, repoFullName, providerUrl,
  callback) {
  var bag = {
    providerIntegrationValues: providerIntegrationValues,
    repoFullName: repoFullName,
    providerUrl: providerUrl,
    sourceDefaultBranch: ''
  };

  bag.who = util.format('bitbucket|%s:%s', self.name, repoFullName);
  console.log('Starting', bag.who);

  async.series([
      _checkInputParams.bind(null, bag),
      _createAdapter.bind(null, bag),
      _getRepo.bind(null, bag)
    ],
    function (err) {
      console.log('Completed', bag.who);

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

  bag.adapter =
    new BitbucketAdapter(bag.providerIntegrationValues.token, bag.providerUrl,
      bag.providerIntegrationValues.username);

  return next();
}

function _getRepo(bag, next) {
  var who = bag.who + '|' + _getRepo.name;
  console.log(who, 'Inside');

  var repoSlug = bag.repoFullName.split('/');
  var repoOwner = repoSlug[0];
  var repoName = repoSlug[1];

  bag.adapter.getRepository(repoOwner, repoName,
    function (err, body) {
      if (err)
        return next(util.format('getRepository returned error %s' +
          ' with response %s for %s', err, util.inspect(body),
          bag.repoFullName)
        );

      if (body.mainbranch && body.mainbranch.name)
        bag.sourceDefaultBranch = body.mainbranch.name;

      return next();
    }
  );
}

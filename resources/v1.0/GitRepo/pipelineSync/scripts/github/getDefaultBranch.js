'use strict';

var self = getDefaultBranch;
module.exports = self;

var async = require('async');
var util = require('util');

var GitHubAdapter = require('./Adapter.js');

function getDefaultBranch(providerIntegrationValues, repoFullName, providerUrl,
  callback) {
  var bag = {
    token: providerIntegrationValues.token,
    repoFullName: repoFullName,
    providerUrl: providerUrl,
    sourceDefaultBranch: ''
  };

  bag.who = util.format('github|%s:%s', self.name, repoFullName);
  console.log(bag.who, 'Starting');

  async.series([
      _checkInputParams.bind(null, bag),
      _createAdapter.bind(null, bag),
      _getRepo.bind(null, bag)
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

  if (!bag.token)
    missing.push('bag.token');

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

  bag.adapter = new GitHubAdapter(bag.token, bag.providerUrl);

  return next();
}

function _getRepo(bag, next) {
  var who = bag.who + '|' + _getRepo.name;
  console.log(who, 'Inside');

  bag.adapter.getRepository(bag.repoFullName,
    function (err, body) {
      if (err || !body)
        return next(
          util.format('getRepository returned %s for %s',
            err, bag.repoFullName)
        );

      /*jshint camelcase:false*/
      if (body.default_branch)
        bag.sourceDefaultBranch = body.default_branch;
      /*jshint camelcase:true*/

      return next();
    }
  )
  ;
}

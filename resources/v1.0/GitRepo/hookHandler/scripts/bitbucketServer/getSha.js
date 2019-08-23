'use strict';

var self = getSha;
module.exports = self;

var async = require('async');
var util = require('util');

var runTypes = require('../runTypes.js');
var normalizeBranchSha = require('./normalizeBranchSha.js');
var normalizeCommitWebhook = require('./normalizeCommitWebhook.js');
var normalizePRWebhook = require('./normalizePRWebhook.js');
var normalizeTagWebhook = require('./normalizeTagWebhook.js');

function getSha(params, callback) {
  var bag = {
    params: params,
    sha: null
  };

  bag.who = util.format('bitbucketServer|%s|hookId:%s',
    self.name, bag.params.hookId);
  console.log(bag.who, 'Starting');

  async.series([
      _checkManualBranch.bind(null, bag),
      _processCommitWebhook.bind(null, bag),
      _processPRWebhook.bind(null, bag),
      _processTagWebhook.bind(null, bag)
    ],
    function (err) {
      if (err)
        console.log(bag.who, 'Completed with errors');
      else
        console.log(bag.who, 'Completed');

      return callback(err, bag.sha);
    }
  );
}

function _checkManualBranch(bag, next) {
  if (bag.params.runType !== runTypes.MANUAL_BRANCH) return next();

  var who = bag.who + '|' + _checkManualBranch.name;
  console.log(who, 'Inside');

  normalizeBranchSha(bag.params,
    function (err, sha) {
      if (err)
        return next(err);

      bag.sha = sha;
      return next();
    }
  );
}

function _processCommitWebhook(bag, next) {
  if (bag.params.runType !== runTypes.WEBHOOK_COMMIT) return next();

  var who = bag.who + '|' + _processCommitWebhook.name;
  console.log(who, 'Inside');

  normalizeCommitWebhook(bag.params,
    function (err, sha) {
      if (err)
        return next(err);

      bag.sha = sha;
      return next();
    }
  );
}

function _processPRWebhook(bag, next) {
  if (bag.params.runType !== runTypes.WEBHOOK_PR &&
    bag.params.runType !== runTypes.WEBHOOK_PR_CLOSE) return next();

  var who = bag.who + '|' + _processPRWebhook.name;
  console.log(who, 'Inside');

  normalizePRWebhook(bag.params,
    function (err, sha) {
      if (err)
        return next(err);

      bag.sha = sha;
      return next();
    }
  );
}

function _processTagWebhook(bag, next) {
  if (bag.params.runType !== runTypes.WEBHOOK_TAG) return next();

  var who = bag.who + '|' + _processTagWebhook.name;
  console.log(who, 'Inside');

  normalizeTagWebhook(bag.params,
    function (err, sha) {
      if (err)
        return next(err);

      bag.sha = sha;
      return next();
    }
  );
}

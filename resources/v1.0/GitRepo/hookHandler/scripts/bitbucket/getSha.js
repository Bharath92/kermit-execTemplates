'use strict';

var self = getSha;
module.exports = self;

var async = require('async');
var util = require('util');

var runTypes = require('../runTypes.js');
var normalizeBranchSha = require('./normalizeBranchSha.js');
var normalizePRWebhook = require('./normalizePRWebhook.js');
var normalizeCommitWebhook = require('./normalizeCommitWebhook.js');
var normalizeTagWebhook = require('./normalizeTagWebhook.js');

function getSha(params, callback) {
  var bag = {
    params: params,
    sha: null
  };

  bag.who = util.format('bitbucket|%s|hookId:%s',
    self.name, bag.params.hookId);
  console.log(bag.who, 'Starting');

  async.series([
      _checkInputParams.bind(null, bag),
      _processManualBranch.bind(null, bag),
      _processWebhookCommit.bind(null, bag),
      _processTagWebhook.bind(null, bag),
      _processPRWebhook.bind(null, bag)
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

function _checkInputParams(bag, next) {
  var who = bag.who + '|' + _checkInputParams.name;
  console.log(who, 'Inside');

  return next();
}

function _processManualBranch(bag, next) {
  if (bag.params.runType !== runTypes.MANUAL_BRANCH) return next();

  var who = bag.who + '|' + _processManualBranch.name;
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

function _processWebhookCommit(bag, next) {
  if (bag.params.runType !== runTypes.WEBHOOK_COMMIT) return next();

  var who = bag.who + '|' + _processWebhookCommit.name;
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

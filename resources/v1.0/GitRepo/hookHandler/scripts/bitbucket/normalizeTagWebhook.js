'use strict';

var self = normalizeTagWebhook;
module.exports = self;

var async = require('async');
var emailAddresses = require('email-addresses');
var util = require('util');

var GenShaHash = require('../GenShaHash.js');

function normalizeTagWebhook(params, callback) {
  var bag = {
    params: params,
    sha: {
      providerDomain: 'bitbucket.org',
      isPullRequest: false,
      baseCommitRef: '',
      headCommitRef: '',
      skipDecryption: false,
      isGitTag: true,
      gitTagName: null
    }
  };

  bag.who = util.format('bitbucket|%s|hookId:%s',
    self.name, bag.params.hookId);
  console.log(bag.who, 'Starting');

  async.series([
      _checkInputParams.bind(null, bag),
      _normalizePayloadData.bind(null, bag)
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

  if (!bag.params.webhookPayload)
    return next('Missing webhook payload');

  bag.payload = bag.params.webhookPayload;

  if (!bag.payload.push)
    return next('Missing property push in webhook payload');

  if (!bag.payload.push.changes)
    return next('Missing property changes in webhook payload');

  var changes = bag.payload.push.changes[0];
  if (changes && changes.new && changes.new.target)
    return next();

  //if we get here its an error
  return next(who + ' Could not find any new commits');
}

function _normalizePayloadData(bag, next) {
  var who = bag.who + '|' + _normalizePayloadData.name;
  console.log(who, 'Inside');

  var changes = bag.payload.push.changes[0];
  var lastCommit = changes.new.target;

  bag.sha.branchName = changes.new.name;
  bag.sha.gitTagName = changes.new.name;
  bag.sha.commitSha = lastCommit.hash;
  bag.sha.commitMessage = lastCommit.message;
  // lastCommit.author.raw field is in format
  // Joseph Walton <jwalton@atlassian.com>
  // Hence try to extract email address from the field
  var parsed = emailAddresses.parseAddressList(lastCommit.author.raw);
  if (parsed && parsed.length)
    bag.sha.lastAuthorEmail = parsed[0].address;
  else
    bag.sha.lastAuthorEmail = lastCommit.author.raw;

  bag.sha.lastAuthorLogin = ((lastCommit.author.user &&
    lastCommit.author.user.username) || bag.payload.actor.username);

  bag.sha.commitUrl = lastCommit.links.html.href;

  if (lastCommit.parents && lastCommit.parents.length)
    bag.sha.beforeCommitSha = lastCommit.parents[0].hash;

  bag.sha.committerLogin = ((lastCommit.author.user &&
    lastCommit.author.user.username) || bag.payload.actor.username);
  bag.sha.owner = bag.payload.repository.owner.username;
  bag.sha.triggeredByLogin = bag.payload.actor.username;

  if (!bag.sha.commitSha || !bag.sha.beforeCommitSha) return next();

  bag.sha.compareUrl = util.format(
    'https://bitbucket.org/%s/branches/compare/%s..%s#diff',
    bag.params.projectFullName, bag.sha.commitSha, bag.sha.beforeCommitSha);
  return next();
}

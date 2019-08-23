'use strict';

var self = normalizeTagWebhook;
module.exports = self;

var async = require('async');
var _ = require('underscore');
var util = require('util');

var GenShaHash = require('../GenShaHash.js');
var Adapter = require('./Adapter.js');

function normalizeTagWebhook(params, callback) {
  var bag = {
    params: params,
    adapter: new Adapter(params.providerIntegrationValues.token,
      params.providerUrl),
    sha: {
      providerDomain: 'github.com',
      isPullRequest: false,
      baseCommitRef: '',
      headCommitRef: '',
      headPROrgName: '',
      skipDecryption: false,
      isGitTag: true,
      gitTagName: null,
      branchName: null
    }
  };

  bag.who = util.format('github|%s|hookId:%s', self.name, bag.params.hookId);
  console.log(bag.who, 'Starting');

  async.series([
      _checkInputParams.bind(null, bag),
      _normalizePayload.bind(null, bag),
      _getTagRef.bind(null, bag),  // to identify annotated tag
      _getAnnotatedTag.bind(null, bag) // if annotated tag, get tag message
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

  if (!bag.params.webhookPayload.payload)
    return next('Missing payload property in webhook payload');

  try {
    bag.payload = JSON.parse(bag.params.webhookPayload.payload);
  } catch (e) {
    return next('Error parsing webhook payload');
  }

  var missing = [];

  if (!bag.payload.pusher)
    missing.push('pusher');

  if (!bag.payload.ref)
    missing.push('ref');

  /* jshint camelcase:false */
  if (!bag.payload.head_commit)
    missing.push('head_commit');
  /* jshint camelcase:true */

  if (missing.length > 0)
    return next(who + ' Missing params data: ' + missing.join(', '));

  return next();
}

function _normalizePayload(bag, next) {
  var who = bag.who + '|' + _normalizePayload.name;
  console.log(who, 'Inside');

  var tagRegex = /refs\/tags\/(.*)/;

  if (bag.payload.ref && _.isString(bag.payload.ref)) {
    var tagParsed = bag.payload.ref.match(tagRegex);
    if (tagParsed) {
      bag.sha.gitTagName = tagParsed[1];
      // This isn't "correct", because a tag is really not a branch, but the
      // rest of the build system relies on branchName heavily so we cannot
      // leave it undefined at the moment.
      bag.sha.branchName = tagParsed[1];

      // For tags, we should always use head_commit.id as the commitSha instead
      // of payload.after, because for annotated tags payload.after contains the
      // id of the tag itself, and not the commit it points to
      /* jshint camelcase:false */
      bag.sha.commitSha = bag.payload.head_commit.id;
      /* jshint camelcase:true */
    }
  }

  bag.sha.beforeCommitSha = bag.payload.before;
  bag.sha.triggeredByLogin = bag.payload.pusher.name;
  bag.sha.triggeredByEmail = bag.payload.pusher.email;
  bag.sha.triggeredByDisplayName = bag.payload.pusher.name;
  /* jshint camelcase:false */
  bag.sha.commitUrl = bag.payload.head_commit.url;
  bag.sha.commitMessage = bag.payload.head_commit.message;
  if (bag.payload.head_commit.committer) {
    bag.sha.committerEmail = bag.payload.head_commit.committer.email;
    bag.sha.committerDisplayName = bag.payload.head_commit.committer.name;
    bag.sha.committerLogin = bag.payload.head_commit.committer.username;
  }
  if (bag.payload.head_commit.author) {
    bag.sha.lastAuthorEmail = bag.payload.head_commit.author.email;
    bag.sha.lastAuthorDisplayName = bag.payload.head_commit.author.name;
    bag.sha.lastAuthorLogin = bag.payload.head_commit.author.username;
  }
  /* jshint camelcase:true */
  bag.sha.compareUrl = util.format('https://github.com/%s/%s/compare/%s...%s',
    bag.params.subscriptionOrgName, bag.params.projectName,
    bag.sha.beforeCommitSha, bag.sha.commitSha);
  return next();
}

function _getTagRef(bag, next) {
  var who = bag.who + '|' + _getTagRef.name;
  console.log(who, 'Inside');

  var tagName = bag.sha.gitTagName;
  bag.isAnnotatedTag = false;

  bag.adapter.getTagRef(bag.params.subscriptionOrgName,
    bag.params.projectName, tagName,
    function (err, tagRef) {
      if (err) {
        if (err === 409)
          return next(who + ' Empty repository');
        else
          return next(who + 'Error: Unable to get tag ' +
            'references. Please make sure the tag exists and has ' +
            'correct permissions.'
          );
      }

      // for annotated tags
      if (tagRef.object.type === 'tag') {
        bag.isAnnotatedTag = true;
        bag.tagSha = tagRef.object.sha;
      }
      return next();
    }
  );
}

function _getAnnotatedTag(bag, next) {
  if (!bag.isAnnotatedTag) return next();

  var who = bag.who + '|' + _getAnnotatedTag.name;
  console.log(who, 'Inside');

  bag.adapter.getAnnotatedTag(bag.params.subscriptionOrgName,
    bag.params.projectName, bag.tagSha,
    function (err, tag) {
      if (err) {
        if (err === 409)
          return next(who + ' Empty repository');
        else
          return next(who + 'Error: Unable to get tag ' +
            'object. Please make sure the tag exists and has ' +
            'correct permissions.'
          );
      }
      if (tag.object)
        bag.sha.gitTagMessage = tag.message;

      return next();
    }
  );
}

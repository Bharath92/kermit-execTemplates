'use strict';

var self = normalizeReleaseSha;
module.exports = self;

var async = require('async');
var util = require('util');
var removeMd = require('remove-markdown');

var GenShaHash = require('../GenShaHash.js');
var Adapter = require('./Adapter.js');

function normalizeReleaseSha(params, callback) {
  var bag = {
    params: params,
    webhookPayload: JSON.parse(params.webhookPayload.payload),
    adapter: new Adapter(params.providerIntegrationValues.token,
      params.providerUrl),
    sha: {
      branchName: params.branchName,
      providerDomain: 'github.com',
      isPullRequest: false,
      baseCommitRef: '',
      skipDecryption: false
    }
  };
  bag.who = util.format('github|%s|hookId:%s', self.name, bag.params.hookId);
  console.log(bag.who, 'Starting');

  async.series([
      _checkInputParams.bind(null, bag),
      _getTagRef.bind(null, bag),
      _getAnnotatedTag.bind(null, bag),
      _getCommitContent.bind(null, bag)
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
  /* jshint camelcase:false */
  if (!bag.webhookPayload.release.tag_name)
    return next(who + ' Missing params data: webhookPayload.tag_name');
  else
    bag.sha.branchName = bag.webhookPayload.release.tag_name;
  /* jshint camelcase:true */

  return next();
}

function _getTagRef(bag, next) {
  var who = bag.who + '|' + _getTagRef.name;
  console.log(who, 'Inside');
  /*jshint camelcase:false*/
  var tagName = bag.webhookPayload.release.tag_name;
  /*jshint camelcase:true*/
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
      //for annotated tags
      if (tagRef.object.type === 'tag') {
        bag.isAnnotatedTag = true;
        bag.tagSha = tagRef.object.sha;
      }
      //for lightweight tags
      else {
        bag.sha.commitSha = tagRef.object.sha;
        bag.sha.isRelease = true;
        bag.sha.isPrerelease = bag.webhookPayload.release.prerelease;
        /*jshint camelcase:false*/
        bag.sha.releasedAt = bag.webhookPayload.release.published_at;
        bag.sha.gitTagName = bag.webhookPayload.release.tag_name;
        /*jshint camelcase:true*/
        bag.sha.releaseName = bag.webhookPayload.release.name;

        try {
          bag.sha.releaseBody = removeMd(bag.webhookPayload.release.body);
        } catch (e) {
          console.log(who,
            util.format(
              'Failed to remove markdown from webhook payload body for sha: ' +
              bag.sha.commitSha
            ), e);
        }

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
    function(err, tag) {
      if (err) {
        if (err === 409)
          return next(who + ' Empty repository');
        else
          return next(who + 'Error: Unable to get tag ' +
            'object. Please make sure the tag exists and has ' +
            'correct permissions.'
          );
      }
      if (tag.object) {
        bag.sha.commitSha = tag.object.sha;
        bag.sha.isRelease = true;
        bag.sha.isPrerelease = bag.webhookPayload.release.prerelease;
        /*jshint camelcase:false*/
        bag.sha.releasedAt = bag.webhookPayload.release.published_at;
        bag.sha.gitTagName = bag.webhookPayload.release.tag_name;
        /*jshint camelcase:true*/
        bag.sha.releaseName = bag.webhookPayload.release.name;
        try {
          bag.sha.releaseBody = removeMd(bag.webhookPayload.release.body);
        } catch (e) {
          console.log(who,
            util.format(
              'Failed to remove markdown from webhook payload body for sha: ' +
              bag.sha.commitSha
            ), e);
        }

      }
      return next();
    }
  );
}

function _getCommitContent(bag, next) {
  if (!bag.sha.commitSha) return next();

  var who = bag.who + '|' + _getCommitContent.name;
  console.log(who, 'Inside');

  // set triggeredBy content
  bag.sha.triggeredByLogin = bag.webhookPayload.sender.login;
  /* jshint camelcase: false */
  bag.sha.triggeredByAvatarUrl = bag.webhookPayload.sender.avatar_url;
  /* jshint camelcase: true */
  bag.sha.triggeredByDisplayName = bag.webhookPayload.sender.login;

  bag.adapter.getCommitContent(bag.params.subscriptionOrgName,
    bag.params.projectName, bag.sha.commitSha,
    function (err, commitData) {
      if (err)
        return next(who + ' Error getting commit content');

      if (commitData.parents && commitData.parents.length)
        bag.sha.beforeCommitSha = commitData.parents[0] &&
          commitData.parents[0].sha;
      /*jshint camelcase:false*/
      bag.sha.commitUrl = commitData.html_url;
      if (!bag.sha.commitUrl)
        bag.sha.commitUrl = (commitData.commit && commitData.commit.html_url) ||
          commitData.html_url;
      /*jshint camelcase:true*/
      bag.sha.commitMessage = commitData.commit && commitData.commit.message;

      if (commitData.commit) {
        if (commitData.commit.committer) {
          bag.sha.committerEmail = commitData.commit.committer.email;
          bag.sha.committerDisplayName = commitData.commit.committer.name;
        }

        if (commitData.commit.author) {
          bag.sha.lastAuthorEmail = commitData.commit.author.email;
          bag.sha.lastAuthorDisplayName = commitData.commit.author.name;
        }
      }

      if (commitData.committer) {
        bag.sha.committerLogin = commitData.committer.login;
        /*jshint camelcase:false*/
        bag.sha.committerAvatarUrl = commitData.committer.avatar_url;
        /*jshint camelcase:true*/
      }

      if (commitData.author) {
        bag.sha.lastAuthorLogin = commitData.author.login;
        /*jshint camelcase:false*/
        bag.sha.lastAuthorAvatarUrl = commitData.author.avatar_url;
        /*jshint camelcase:true*/
      }

      //not sure why we need this chec. but var is to reduce length of line
      var sha = bag.sha;
      if (sha.compareUrl || !sha.commitSha || !sha.beforeCommitSha)
        return next();

      bag.sha.compareUrl =
        util.format('https://github.com/%s/%s/compare/%s...%s',
          bag.params.subscriptionOrgName, bag.params.projectName,
          bag.sha.beforeCommitSha, bag.sha.commitSha);
      return next();
    }
  );
}

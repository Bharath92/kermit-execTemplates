'use strict';

var self = GenShaHash;
module.exports = self;

function GenShaHash(params) {
  /* jshint maxcomplexity: 26 */
  params = params || {};

  this.providerDomain = params.providerDomain;
  this.branchName = params.branchName;
  this.isPullRequest = params.isPullRequest;
  this.isPullRequestClose = params.isPullRequestClose || false;
  this.pullRequestNumber = params.pullRequestNumber || null;
  this.pullRequestBaseBranch = params.pullRequestBaseBranch || null;
  this.commitSha = params.commitSha;
  this.beforeCommitSha = params.beforeCommitSha;
  this.commitUrl = params.commitUrl;
  this.commitMessage = params.commitMessage;
  this.baseCommitRef = params.baseCommitRef;
  this.headCommitRef = params.headCommitRef;
  this.headPROrgName = params.headPROrgName || '';
  this.compareUrl = params.compareUrl;
  this.branchHead = params.branchHead; // Only re-run builds.
  this.skipDecryption = params.skipDecryption;
  this.pullRequestSourceUrl = params.pullRequestSourceUrl;
  this.isGitTag = params.isGitTag || false;
  this.gitTagName = params.gitTagName || null;
  this.gitTagMessage = params.gitTagMessage || null;
  this.isRelease = params.isRelease || false;
  this.releaseName = params.releaseName || null;
  this.releaseBody = params.releaseBody || null;
  this.releasedAt = params.releasedAt || null;
  this.isPrerelease = params.isPrerelease || false;
  this.pullRequestRepoFullName = params.pullRequestRepoFullName || null;
  this.changeId = params.changeId || null;
  this.changeSha = params.changeSha || null;
  this.eventType = params.eventType || null;
  this.patchSetNumber = params.patchSetNumber || null;
  this.changeSubject = params.changeSubject || null;
  this.providerSshPort = params.providerSshPort || null;
  this.changeOwner = params.changeOwner || {};
  this.providerUrl = params.providerUrl || null;

  this.committer = params.committer || {
      email: params.committerEmail,
      login: params.committerLogin,
      displayName: params.committerDisplayName,
      avatarUrl: params.committerAvatarUrl
    };

  this.lastAuthor = params.lastAuthor || {
      email: params.lastAuthorEmail,
      login: params.lastAuthorLogin,
      displayName: params.lastAuthorDisplayName,
      avatarUrl: params.lastAuthorAvatarUrl
    };

  // Pull request builds only (in normalizers):
  this.triggeredBy = params.triggeredBy || {
      email: params.triggeredByEmail,
      login: params.triggeredByLogin,
      displayName: params.triggeredByDisplayName,
      avatarUrl: params.triggeredByAvatarUrl
    };
}

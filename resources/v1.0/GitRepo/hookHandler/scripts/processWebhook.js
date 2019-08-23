'use strict';

var self = processWebhook;
module.exports = self;

var async = require('async');
var fs = require('fs');
var util = require('util');
var _ = require('underscore');

var runTypes = require('./runTypes.js');
var ApiAdapter = require('./ApiAdapter.js');

var allowedMasterIntegrations = ['bitbucket', 'bitbucketServerBasic', 'github',
  'githubEnterprise', 'gitlab'];

var getCommitDiffFiles = {
  bitbucket: require('./bitbucket/getCommitDiffFiles.js'),
  bitbucketServerBasic: require('./bitbucketServer/getCommitDiffFiles.js'),
  github: require('./github/getCommitDiffFiles.js'),
  githubEnterprise: require('./github/getCommitDiffFiles.js'),
  gitlab: require('./gitlab/getCommitDiffFiles.js')
};

var shaNormalizers = {
  bitbucket: require('./bitbucket/getSha.js'),
  bitbucketServerBasic: require('./bitbucketServer/getSha.js'),
  github: require('./github/getSha.js'),
  githubEnterprise: require('./github/getSha.js'),
  gitlab: require('./gitlab/getSha.js')
};

var runTypeNormalizers = {
  bitbucket: require('./bitbucket/getWebhookRunType.js'),
  bitbucketServerBasic: require('./bitbucketServer/getWebhookRunType.js'),
  github: require('./github/getWebhookRunType.js'),
  githubEnterprise: require('./github/getWebhookRunType.js'),
  gitlab: require('./gitlab/getWebhookRunType.js')
};

function processWebhook() {
  var bag = {
    hookId: process.env.hook_id,
    apiAdapter: new ApiAdapter(process.env.api_token),
    reqHeaders: {},
    reqBody: {},
    resources: [],
    updatedResourceVersions: [],
    isValidWebhook: false
  };

  bag.who = util.format('hooks|%s|id:', self.name, bag.hookId);
  console.log(bag.who, 'Starting');

  async.series([
      _readHeaders.bind(null, bag),
      _readBody.bind(null, bag),
      _readResources.bind(null, bag),
      _getHook.bind(null, bag),
      _getHookIntegration.bind(null, bag),
      _getProvider.bind(null, bag),
      _getWebhookType.bind(null, bag),
      _getShaData.bind(null, bag),
      _getCommitDiffFiles.bind(null, bag),
      _findUpdatedResources.bind(null, bag),
      _triggerPipelineSync.bind(null, bag),
      _triggerResources.bind(null, bag)
    ],
    function (err) {
      console.log(bag.who, 'Completed');
      if (err) {
        console.log(err);
        process.exit(1);
      }

    }
  );
}

function _readHeaders(bag, next) {
  var who = bag.who + '|' + _readHeaders.name;
  console.log(who, 'Inside');

  var headersFilePath = process.env.hook_headers_path;

  fs.readFile(headersFilePath, 'utf8',
    function (err, data) {
      if (err) {
        console.log(who, 'Failed to read headers file with error: ' +
          util.inspect(err));
        return next(err);
      }

      try {
        console.log(who, 'Parsing headers file');
        bag.reqHeaders = JSON.parse(data);
      } catch (e) {
        console.log(who, 'Failed to parse headers file ' +
          'with error: ' + util.inspect(e));
        return next(e);
      }

      return next();
    }
  );
}

function _readBody(bag, next) {
  var who = bag.who + '|' + _readBody.name;
  console.log(who, 'Inside');

  var bodyFilePath = process.env.hook_body_path;

  fs.readFile(bodyFilePath, 'utf8',
    function (err, data) {
      if (err) {
        console.log(who, 'Failed to read body file ' +
          'with error: ' + util.inspect(err));
        return next(err);
      }

      try {
        console.log(who, 'Parsing body file');
        bag.reqBody = JSON.parse(data);
      } catch (e) {
        console.log(who, 'Failed to parse body file ' +
          'with error: ' + util.inspect(e));
        return next(e);
      }

      return next();
    }
  );
}

function _readResources(bag, next) {
  var who = bag.who + '|' + _readResources.name;
  console.log(who, 'Inside');

  var resourcesFilePath = process.env.resources_path;

  fs.readFile(resourcesFilePath, 'utf8',
    function (err, data) {
      if (err) {
        console.log(who, 'Failed to read resources file ' +
          'with error: ' + util.inspect(err));
        return next(err);
      }

      var resources;

      try {
        console.log(who, 'Parsing resources file');
        resources = JSON.parse(data);
      } catch (e) {
        console.log(who, 'Failed to parse resources file ' +
          'with error: ' + util.inspect(e));
        return next(e);
      }

      bag.resources = _.filter(resources,
        function (resource) {
          return !resource.isDeleted;
        }
      );

      return next();
    }
  );
}

function _getHook(bag, next) {
  if (_.isEmpty(bag.resources)) return next();
    if (_.isEmpty(bag.resources)) return next();
  var who = bag.who + '|' + _getHook.name;
  console.log(who, 'Inside');

  bag.apiAdapter.getHookById(bag.hookId,
    function (err, hook) {
      if (err) {
        var msg = util.format('getHookById failed for id: %s ' +
          'with error: %s', bag.hookId, err.message);
        console.log(msg);
        return next(msg);
      }

      bag.hook = hook;
      return next();
    }
  );
}

function _getHookIntegration(bag, next) {
  if (_.isEmpty(bag.resources)) return next();
    if (_.isEmpty(bag.resources)) return next();
  var who = bag.who + '|' + _getHookIntegration.name;
  console.log(who, 'Inside');

  bag.apiAdapter.getProjectIntegrationById(bag.hook.projectIntegrationId,
    function (err, integration) {
      if (err) {
        console.log(util.format('getProjectIntegrationById failed for id: %s ' +
          'with error: %s', bag.hook.projectIntegrationId, err.message));
        return next(err);
      }

      if (!_.contains(allowedMasterIntegrations,
        integration.masterIntegrationName)) {
        var msg = 'A webhook for an unsupported integration was ignored ' +
          'for hookId: ' + bag.hookId;
        console.log(msg);
        return next(msg);
      }

      bag.integration = integration;
      bag.providerIntegrationValues = {};

      _.each(bag.integration.formJSONValues,
        function (jsonValue) {
          if (jsonValue.label)
            bag.providerIntegrationValues[jsonValue.label] = jsonValue.value;
        }
      );

      return next();
    }
  );
}

function _getProvider(bag, next) {
  if (_.isEmpty(bag.resources)) return next();
  var who = bag.who + '|' + _getProvider.name;
  console.log(who, 'Inside');

  bag.apiAdapter.getProviderById(bag.integration.providerId,
    function (err, provider) {
      if (err) {
        var msg = 'getProviderById for id: ' + bag.integration.providerId +
          ' returned error: ' + err.message;
        console.log(msg);
        return next(msg);
      }

      bag.provider = provider;
      return next();
    }
  );
}

function _getWebhookType(bag, next) {
  if (_.isEmpty(bag.resources)) return next();
  var who = bag.who + '|' + _getWebhookType.name;
  console.log(who, 'Inside');

  var params = {
    hookId: bag.hookId,
    masterIntegrationName: bag.integration.masterIntegrationName,
    reqHeaders: bag.reqHeaders,
    reqBody: bag.reqBody
  };

  var strategy = runTypeNormalizers[bag.integration.masterIntegrationName];

  strategy(params,
    function (err, runType) {
      if (err) {
        var msg = 'Failed to determine run type for hookId: ' + bag.hookId;
        console.log(msg);
        return next(msg);
      }

      bag.runType = runType;
      if (runType === runTypes.INVALID) {
        console.log(who, 'Invalid runType for webhook');
        return next('Invalid build type for webhook');
      }

      return next();
    }
  );
}

function _getShaData(bag, next) {
  if (_.isEmpty(bag.resources)) return next();
  var who = bag.who + '|' + _getShaData.name;
  console.log(who, 'Inside');

  var params = {};

  var firstResource = _.first(bag.resources);
  var resourcePropertyBag = firstResource.systemPropertyBag;
  var repositorySshUrl = '';
  var isPrivateRepository = false;
  if (resourcePropertyBag) {
    repositorySshUrl = resourcePropertyBag.gitRepoRepositorySshUrl;
    isPrivateRepository = resourcePropertyBag.isPrivateRepository;
  }

  var sourceName = bag.hook.identifierValue;

  params.projectName = sourceName.split('/')[1];
  params.hookId = bag.hookId;
  params.providerUrl = bag.provider.url;
  params.providerIntegrationValues = bag.providerIntegrationValues;
  params.projectFullName = sourceName;
  params.projectSshURL = repositorySshUrl;
  params.webhookPayload = bag.reqBody;
  params.runType = bag.runType;
  params.subscriptionOrgName = sourceName.split('/')[0];
  params.isPrivateRepository = isPrivateRepository;

  var strategy = shaNormalizers[bag.integration.masterIntegrationName];

  strategy(params,
    function (err, sha) {
      if (err) {
        console.log(err);
        return next(err);
      }

      if (_.isEmpty(sha)) {
        console.log('Could not fetch SHA');
        return next('Could not fetch SHA');
      }

      bag.sha = sha;
      return next();
    }
  );
}

function _getCommitDiffFiles(bag, next) {
  if (_.isEmpty(bag.resources)) return next();
  if (bag.runType !== runTypes.WEBHOOK_COMMIT) return next();

  var who = bag.who + '|' + _getCommitDiffFiles.name;
  console.log(who, 'Inside');

  var params = {
    projectFullName: bag.hook.identifierValue,
    masterName: bag.integration.masterIntegrationName,
    providerName: bag.provider.name,
    providerUrl: bag.provider.url,
    providerIntegrationValues: bag.providerIntegrationValues,
    commitSha: bag.sha.commitSha,
    beforeCommitSha: bag.sha.beforeCommitSha
  };

  var strategy = getCommitDiffFiles[bag.integration.masterIntegrationName];

  strategy(params,
    function (err, fileList) {
      // error means we should allow the webhook and let pipelineSource run
      if (err) {
        console.log(err);
        return next();
      }

      bag.fileList = fileList;
      return next();
    }
  );
}

function _findUpdatedResources(bag, next) {
  if (_.isEmpty(bag.resources)) return next();
  var who = bag.who + '|' + _findUpdatedResources.name;
  console.log(who, 'Inside');

  async.eachLimit(bag.resources, 5,
    function (resource, done) {
      var seriesBag = {
        who: who,
        apiAdapter: bag.apiAdapter,
        resource: resource,
        runType: bag.runType,
        sha: bag.sha,
        fileList: bag.fileList,
        resourceVersion: null
      };

      async.series([
          _ignoreDisabledWebhooks.bind(null, seriesBag),
          _checkBranches.bind(null, seriesBag),
          _checkCommitDiffFiles.bind(null, seriesBag),
          _postResourceVersion.bind(null, seriesBag)
        ],
        function (err) {
          if (seriesBag.resourceVersion)
            bag.updatedResourceVersions.push(seriesBag.resourceVersion);
          return done(err);
        }
      );
    },
    function (err) {
      if (_.isEmpty(bag.updatedResourceVersions))
        console.log('No resources updated');
      else
        console.log('Updated resources: ' +
          _.pluck(bag.updatedResourceVersions, 'resourceId'));
      return next(err);
    }
  );
}

function _ignoreDisabledWebhooks(seriesBag, next) {
  var who = seriesBag.who + '|' + _ignoreDisabledWebhooks.name;
  console.log(who, 'Inside');

  var ymlConfigPropertyBag = seriesBag.resource.ymlConfigPropertyBag || {};

  if (seriesBag.runType === runTypes.WEBHOOK_COMMIT &&
    ymlConfigPropertyBag.buildOn &&
    ymlConfigPropertyBag.buildOn.commit === false) {
    console.log(who, util.format(
      'Ignoring webhook because commit builds are disabled for ' +
      'resource id %s', seriesBag.resource.id));

    seriesBag.skipResource = true;
    return next();
  }

  if (seriesBag.runType === runTypes.WEBHOOK_RELEASE &&
    (!ymlConfigPropertyBag.buildOn ||
    !ymlConfigPropertyBag.buildOn.releaseCreate)) {
    console.log(who, util.format(
      'Ignoring webhook because release builds are disabled for ' +
      'resource id %s', seriesBag.resource.id));

    seriesBag.skipResource = true;
    return next();
  }

  if (seriesBag.runType === runTypes.WEBHOOK_TAG &&
    (!ymlConfigPropertyBag.buildOn ||
    !ymlConfigPropertyBag.buildOn.tagCreate)) {
    console.log(who, util.format(
      'Ignoring webhook because tag builds are disabled for ' +
      'resource id: %s', seriesBag.resource.id)
    );

    seriesBag.skipResource = true;
    return next();
  }

  if (seriesBag.runType === runTypes.WEBHOOK_PR &&
    (!ymlConfigPropertyBag.buildOn ||
    !ymlConfigPropertyBag.buildOn.pullRequestCreate)) {
    console.log(who, util.format(
      'Ignoring webhook because PR builds are disabled for ' +
      'resource id: %s', seriesBag.resource.id)
    );

    seriesBag.skipResource = true;
    return next();
  }

  if (seriesBag.runType === runTypes.WEBHOOK_PR_CLOSE &&
    (!ymlConfigPropertyBag.buildOn ||
    !ymlConfigPropertyBag.buildOn.pullRequestClose)) {
    console.log(who, util.format(
      'Ignoring webhook because PR close builds are disabled for ' +
      'resource id: %s', seriesBag.resource.id)
    );

    seriesBag.skipResource = true;
    return next();
  }

  return next();
}

function _checkBranches(seriesBag, next) {
  if (seriesBag.skipResource) return next();

  var who = seriesBag.who + '|' + _checkBranches.name;
  console.log(who, 'Inside');

  var ymlConfigPropertyBag = seriesBag.resource.ymlConfigPropertyBag || {};
  var branchesOnly = ymlConfigPropertyBag.branches &&
    ymlConfigPropertyBag.branches.include;
  var branchesExcept = ymlConfigPropertyBag.branches &&
    ymlConfigPropertyBag.branches.exclude;

  var tagsOnly = ymlConfigPropertyBag.tags &&
    ymlConfigPropertyBag.tags.include;
  var tagsExcept = ymlConfigPropertyBag.tags &&
    ymlConfigPropertyBag.tags.exclude;

  if (seriesBag.runType === runTypes.WEBHOOK_COMMIT ||
    seriesBag.runType === runTypes.WEBHOOK_PR ||
    seriesBag.runType === runTypes.WEBHOOK_PR_CLOSE ||
    seriesBag.runType === runTypes.WEBHOOK_COMMENT) {

    if (branchesOnly) {
      if (!__isRegexMatching(who, branchesOnly, seriesBag.sha.branchName)) {
        console.log(who, util.format(
          'Ignoring webhook because webhook branch %s is not in ' +
          'branches.include for resource id: %s',
          seriesBag.sha.branchName, seriesBag.resource.id)
        );
        seriesBag.skipResource = true;
        return next();
      }
    }

    if (branchesExcept) {
      if (__isRegexMatching(who, branchesExcept, seriesBag.sha.branchName)) {
        console.log(who, util.format(
          'Ignoring webhook because branch %s is in branches.exclude for ' +
          'resource id: %s', seriesBag.sha.branchName,
          seriesBag.resource.id)
        );
        seriesBag.skipResource = true;
        return next();
      }
    }
  } else if (seriesBag.runType === runTypes.WEBHOOK_TAG ||
    seriesBag.runType === runTypes.WEBHOOK_RELEASE) {
    if (tagsOnly) {
      if (!__isRegexMatching(who, tagsOnly, seriesBag.sha.branchName)) {
        console.log(who, util.format(
          'Ignoring webhook because tag %s is not in tags.include for ' +
          'resource id: %s', seriesBag.sha.branchName,
          seriesBag.resource.id)
        );
        seriesBag.skipResource = true;
        return next();
      }
    }

    if (tagsExcept) {
      if (__isRegexMatching(who, tagsExcept, seriesBag.sha.branchName)) {
        console.log(who, util.format(
          'Ignoring webhook because tag %s is in tags.exclude for ' +
          'resource id: %s', seriesBag.sha.branchName,
          seriesBag.resource.id)
        );
        seriesBag.skipResource = true;
        return next();
      }
    }
  }

  return next();
}

function _checkCommitDiffFiles(seriesBag, next) {
  if (seriesBag.skipResource) return next();
  if (seriesBag.runType !== runTypes.WEBHOOK_COMMIT) return next();
  if (!(seriesBag.resource.ymlConfigPropertyBag &&
    seriesBag.resource.ymlConfigPropertyBag.files)) return next();

  var who = seriesBag.who + '|' + _checkCommitDiffFiles.name;
  console.log(who, 'Inside');

  var ymlConfigPropertyBag = seriesBag.resource.ymlConfigPropertyBag || {};
  var filesOnly = ymlConfigPropertyBag.files &&
    ymlConfigPropertyBag.files.include;
  var filesExcept = ymlConfigPropertyBag.files &&
    ymlConfigPropertyBag.files.exclude;

  var foundMatch = false;
  if (!_.isEmpty(seriesBag.fileList))
    foundMatch = _.some(seriesBag.fileList,
      function (file) {
        if (filesOnly)
          return __isRegexMatching(who, filesOnly, file);

        if (filesExcept)
          return !__isRegexMatching(who, filesExcept, file);

        return true;
      }
    );

  if (!foundMatch) {
    console.log(who, util.format(
      'Ignoring webhook because commit files do not match files.include or ' +
      'file.exclude for resource id: %s', seriesBag.resource.id)
    );
    seriesBag.skipResource = true;
  }

  return next();
}

function _postResourceVersion(seriesBag, next) {
  if (seriesBag.skipResource) return next();

  var who = seriesBag.who + '|' + _postResourceVersion.name;
  console.log(who, 'Inside');

  var newResourceVersion = {
    resourceId: seriesBag.resource.id,
    projectId: seriesBag.resource.projectId,
    versionTrigger: false,
    contentPropertyBag: {
      path: seriesBag.resource.staticPropertyBag &&
        seriesBag.resource.staticPropertyBag.path,
      commitSha: seriesBag.sha.commitSha,
      isPullRequest: seriesBag.sha.isPullRequest,
      isPullRequestClose: seriesBag.sha.isPullRequestClose,
      pullRequestNumber: seriesBag.sha.pullRequestNumber,
      branchName: seriesBag.sha.branchName,
      shaData: seriesBag.sha,
      pullRequestBaseBranch: seriesBag.sha.pullRequestBaseBranch,
      pullRequestSourceUrl: seriesBag.sha.pullRequestSourceUrl,
      beforeCommitSha: seriesBag.sha.beforeCommitSha,
      commitUrl: seriesBag.sha.commitUrl,
      commitMessage: seriesBag.sha.commitMessage,
      baseCommitRef: seriesBag.sha.baseCommitRef,
      compareUrl: seriesBag.sha.compareUrl,
      isGitTag: seriesBag.sha.isGitTag,
      gitTagName: seriesBag.sha.gitTagName,
      gitTagMessage: seriesBag.sha.gitTagMessage,
      isRelease: seriesBag.sha.isRelease,
      releaseName: seriesBag.sha.releaseName,
      releaseBody: seriesBag.sha.releaseBody,
      releasedAt: seriesBag.sha.releaedAt,
      isPrerelease: seriesBag.sha.isPrerelease,
      lastAuthorLogin: seriesBag.sha.lastAuthor &&
        seriesBag.sha.lastAuthor.login,
      lastAuthorEmail: seriesBag.sha.lastAuthor &&
        seriesBag.sha.lastAuthor.email,
      committerLogin: seriesBag.sha.committer && seriesBag.sha.committer.login
    }
  };

  seriesBag.apiAdapter.postResourceVersion(newResourceVersion,
    function (err, resourceVersion) {
      if (err) {
        console.log('Failed to postResourceVersion for resource id: ' +
          seriesBag.resource.id + ' returned error: ' + err.message);
        return next();
      }

      seriesBag.resourceVersion = resourceVersion;
      return next();
    }
  );
}

function _triggerPipelineSync(bag, next) {
  var who = bag.who + '|' + _triggerPipelineSync.name;
  console.log(who, 'Inside');

  var syncRepos = _.filter(bag.resources,
    function (resource) {
      return resource.isInternal &&
        _.findWhere(bag.updatedResourceVersions, {resourceId: resource.id});
    }
  );

  if (_.isEmpty(syncRepos))
    return next();

  bag.syncTriggered = true;

  var syncRepoIds = _.pluck(syncRepos, 'id');
  var triggerableResourceVersions = _.filter(bag.updatedResourceVersions,
    function (resourceVersion) {
      return !_.contains(syncRepoIds, resourceVersion.resourceId);
    }
  );

  // There should only be one pipeline source with a path, integration,
  // and branch.  Just in case, we'll trigger multiple.  They will all trigger
  // other resources when sync is complete though.
  async.eachSeries(syncRepos,
    function (syncRepo, done) {
      var message = {
        pipelineSourceId: syncRepo.pipelineSourceId,
        triggeredResourceVersionIds: _.pluck(triggerableResourceVersions, 'id')
      };

      bag.apiAdapter.postToVortex('core.pipelineSync', message,
        function (err) {
          if (err) {
            console.log('postToVortex for pipelineSourceId: ' +
              syncRepo.pipelineSourceId + ' returned error: ' + err.message);
            return done(err);
          }

          return done();
        }
      );
    },
    function (err) {
      return next(err);
    }
  );
}


function _triggerResources(bag, next) {
  if (bag.syncTriggered) return next();

  var who = bag.who + '|' + _triggerResources.name;
  console.log(who, 'Inside');

  async.eachSeries(bag.updatedResourceVersions,
    function (resourceVersion, done) {
      var message = {
        payload: {
          resourceVersionId: resourceVersion.id
        }
      };

      bag.apiAdapter.postToVortex('core.runTrigger', message,
        function (err) {
          if (err) {
            console.log('postToVortex for resourceVersion: ' +
              resourceVersion.id + ' returned error: ' + err.message);
            return done(err);
          }

          return done();
        }
      );
    },
    function (err) {
      return next(err);
    }
  );
}

// helper functions
function __isRegexMatching(who, pattern, value) {
  var regex;
  try {
    regex = new RegExp(pattern);
  } catch (e) {
    console.log(who,
      util.format(
        'pattern %s could not be converted to a valid regular expression',
        regex
      ), e);
    return;
  }

  return regex.test(value);
}

processWebhook();

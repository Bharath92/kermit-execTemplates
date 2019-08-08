'use strict';

var self = syncWebhook;
module.exports = self;

var async = require('async');
var passGen = require('password-generator');
var urlParse = require('url');
var util = require('util');
var _ = require('underscore');

var ApiAdapter = require('./ApiAdapter.js');
var CALL_OBJECT_LIMIT = 500;

var allowedMasterIntegrations = ['bitbucket', 'bitbucketServerBasic', 'github',
  'githubEnterprise', 'gitlab'];

var postWebhook = {
  bitbucket: require('./bitbucket/postWebhook.js'),
  bitbucketServerBasic: require('./bitbucketServer/postWebhook.js'),
  github: require('./github/postWebhook.js'),
  githubEnterprise: require('./github/postWebhook.js'),
  gitlab: require('./gitlab/postWebhook.js')
};

var deleteWebhook = {
  bitbucket: require('./bitbucket/deleteWebhook.js'),
  bitbucketServerBasic: require('./bitbucketServer/deleteWebhook.js'),
  github: require('./github/deleteWebhook.js'),
  githubEnterprise: require('./github/deleteWebhook.js'),
  gitlab: require('./gitlab/deleteWebhook.js')
};

var getDefaultBranch = {
  bitbucket: require('./bitbucket/getDefaultBranch.js'),
  bitbucketServerBasic: require('./bitbucketServer/getDefaultBranch.js'),
  github: require('./github/getDefaultBranch.js'),
  githubEnterprise: require('./github/getDefaultBranch.js'),
  gitlab: require('./gitlab/getDefaultBranch.js')
};

var shaNormalizers = {
  bitbucket: require('./bitbucket/getBranchSha.js'),
  bitbucketServerBasic: require('./bitbucketServer/getBranchSha.js'),
  github: require('./github/getBranchSha.js'),
  githubEnterprise: require('./github/getBranchSha.js'),
  gitlab: require('./gitlab/getBranchSha.js')
};

function syncWebhook() {
  var bag = {
    resourceId: process.env.resource_id,
    action: process.env.sync_action,
    previousIntegrationId: process.env.previous_integration_id,
    apiAdapter: new ApiAdapter(process.env.api_token),
    resource: null
  };

  bag.who = util.format('resources|%s|id:', self.name, bag.resourceId);
  console.log(bag.who, 'Starting');

  async.series([
      _getResource.bind(null, bag),
      _getHook.bind(null, bag),
      _getProjectIntegration.bind(null, bag),
      _getProvider.bind(null, bag),
      _getDefaultBranch.bind(null, bag),
      _getShaData.bind(null, bag),
      _postResourceVersion.bind(null, bag),
      _postHook.bind(null, bag),
      _createWebhook.bind(null, bag),
      _updateHook.bind(null, bag),
      _checkForResources.bind(null, bag),
      _deleteWebhook.bind(null, bag),
      _deleteHook.bind(null, bag),
      _getPreviousHook.bind(null, bag),
      _getPreviousProjectIntegration.bind(null, bag),
      _getPreviousProvider.bind(null, bag),
      _checkForPreviousResources.bind(null, bag),
      _deletePreviousWebhook.bind(null, bag),
      _deletePreviousHook.bind(null, bag)
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

function _getResource(bag, next) {
  var who = bag.who + '|' + _getResource.name;
  console.log(who, 'Inside');

  bag.apiAdapter.getResourceById(bag.resourceId,
    function (err, resource) {
      if (err) {
        var msg = util.format('getResourceById failed for id: %s ' +
          'with error: %s', bag.resourceId, err.message);
        console.log(msg);
        return next(msg);
      }

      bag.resource = resource;
      return next();
    }
  );
}

function _getHook(bag, next) {
  var who = bag.who + '|' + _getHook.name;
  console.log(who, 'Inside');

  var query = util.format('projectIds=%s&projectIntegrationIds=%s&' +
    'identifierNames=%s&identifierValues=%s&resourceTypeCodes=%s',
    bag.resource.projectId, bag.resource.projectIntegrationId,
    'path', bag.resource.staticPropertyBag.path, bag.resource.typeCode);

  bag.apiAdapter.getHooks(query,
    function (err, hooks) {
      if (err) {
        var msg = util.format('getHooks failed for query: %s ' +
          'with error: %s', query, err.message);
        console.log(msg);
        return next(msg);
      }

      bag.hook = _.first(hooks);
      return next();
    }
  );
}

function _getProjectIntegration(bag, next) {
  var who = bag.who + '|' + _getProjectIntegration.name;
  console.log(who, 'Inside');

  bag.apiAdapter.getProjectIntegrationById(bag.resource.projectIntegrationId,
    function (err, integration) {
      if (err) {
        console.log(util.format('getProjectIntegrationById failed for id: %s ' +
          'with error: %s', bag.resource.projectIntegrationId, err.message));
        return next(err);
      }

      if (!_.contains(allowedMasterIntegrations,
        integration.masterIntegrationName)) {
        var msg = 'A GitRepo with an unsupported integration was ignored ' +
          'for resourceId: ' + bag.resourceId;
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

function _getDefaultBranch(bag, next) {
  if (bag.action !== 'create') return next();
  var who = bag.who + '|' + _getDefaultBranch.name;
  console.log(who, 'Inside');

  var strategy = getDefaultBranch[bag.integration.masterIntegrationName];

  strategy(bag.providerIntegrationValues, bag.resource.staticPropertyBag.path,
    bag.provider.url,
    function (err, sourceDefaultBranch) {
      if (err) {
        var msg = util.format(
          'Failed to determine default branch for path: %s',
          bag.resource.staticPropertyBag.path);
        console.log(msg, err);
        return next(msg);
      }

      bag.sourceDefaultBranch = sourceDefaultBranch;
      return next();
    }
  );
}

function _getShaData(bag, next) {
  if (bag.action !== 'create') return next();
  var who = bag.who + '|' + _getShaData.name;
  console.log(who, 'Inside');

  var strategy = shaNormalizers[bag.integration.masterIntegrationName];

  var params = {
    resourceId: bag.resourceId,
    providerUrl: bag.provider.url,
    providerIntegrationValues: bag.providerIntegrationValues,
    projectFullName: bag.resource.staticPropertyBag.path,
    branchName: bag.sourceDefaultBranch
  };

  strategy(params,
    function (err, shaData) {
      if (err) {
        var msg = util.format(
          'Failed to get sha for resource: %s with error: %s',
          bag.resource.name, err
        );
        console.log(msg);
        return next(msg);
      }

      if (_.isEmpty(shaData))
        return next('Could not fetch SHA');

      bag.shaData = shaData;
      return next();
    }
  );
}

function _postResourceVersion(bag, next) {
  if (!bag.shaData) return next();
  var who = bag.who + '|' + _postResourceVersion.name;
  console.log(who, 'Inside');

  var newResourceVersion = {
    resourceId: bag.resource.id,
    projectId: bag.resource.projectId,
    versionTrigger: false,
    contentPropertyBag: {
      path: bag.resource.staticPropertyBag.path,
      isPullRequest: bag.shaData.isPullRequest,
      isPullRequestClose: bag.shaData.isPullRequestClose,
      pullRequestNumber: bag.shaData.pullRequestNumber,
      pullRequestSourceUrl: bag.shaData.pullRequestSourceUrl,
      branchName: bag.shaData.branchName,
      shaData: bag.shaData,
      commitSha: bag.shaData.commitSha,
      pullRequestBaseBranch: bag.shaData.pullRequestBaseBranch,
      beforeCommitSha: bag.shaData.beforeCommitSha,
      commitUrl: bag.shaData.commitUrl,
      commitMessage: bag.shaData.commitMessage,
      baseCommitRef: bag.shaData.baseCommitRef,
      compareUrl: bag.shaData.compareUrl,
      isGitTag: bag.shaData.isGitTag,
      gitTagName: bag.shaData.gitTagName,
      gitTagMessage: bag.shaData.gitTagMessage,
      isRelease: bag.shaData.isRelease,
      releaseName: bag.shaData.releaseName,
      releaseBody: bag.shaData.releaseBody,
      releasedAt: bag.shaData.releasedAt,
      isPrerelease: bag.shaData.isPrerelease,
      lastAuthorLogin: bag.shaData.lastAuthor && bag.shaData.lastAuthor.login,
      lastAuthorEmail: bag.shaData.lastAuthor && bag.shaData.lastAuthor.email,
      committerLogin: bag.shaData.committer && bag.shaData.committer.login
    }
  };

  bag.apiAdapter.postResourceVersion(newResourceVersion,
    function (err, version) {
      if (err) {
        var msg = util.format(
          'Failed to create initial version for resource: %s ' +
          'with error: %s', bag.resource.name,
          (version && version.message) || err
        );
        console.log(msg);
        return next(msg);
      }

      bag.version = version;
      return next();
    }
  );
}

function _postHook(bag, next) {
  if (bag.hook) return next();
  if (bag.action === 'delete') return next();
  var who = bag.who + '|' + _postHook.name;
  console.log(who, 'Inside');

  var newHook = {
    projectId: bag.resource.projectId,
    projectIntegrationId: bag.resource.projectIntegrationId,
    identifierName: 'path',
    identifierValue: bag.resource.staticPropertyBag.path,
    resourceTypeCode: bag.resource.typeCode,
    propertyBag: {
      username: bag.resource.staticPropertyBag.path.split('/')[1],
      password: passGen(16, false)
    }
  };

  bag.apiAdapter.postHook(newHook,
    function (err, hook) {
      if (err) {
        var msg = util.format(
          'Failed to create hook for resource: %s ' +
          'with error: %s', bag.resource.name,
          (hook && hook.message) || err
        );
        console.log(msg);
        return next(msg);
      }

      bag.hook = hook;
      return next();
    }
  );
}

function _createWebhook(bag, next) {
  if (bag.action === 'delete') return next();

  var who = bag.who + '|' + _createWebhook.name;
  console.log(who, 'Inside');

  //create webhook url
  var parsedUrl = urlParse.parse(process.env.api_url);
  var protocol = parsedUrl.protocol;
  var hostname = parsedUrl.hostname;
  var port = parsedUrl.port ? ':' + parsedUrl.port : '';
  var host = hostname + port;
  var webhookUrl = util.format(
    '%s//%s:%s@%s/hooks/%s/hook',
    protocol, bag.hook.propertyBag.username, bag.hook.propertyBag.password,
    host,
    bag.hook.id
  );

  var title = util.format('pipelines-%s', bag.hook.id);
  var repo = bag.resource.staticPropertyBag.path.split('/');

  var strategy = postWebhook[bag.integration.masterIntegrationName];

  strategy(
    bag.providerIntegrationValues, webhookUrl, title, repo[0], repo[1],
    bag.provider.url,
    function (err, webhook) {
      if (err) {
        var msg = util.format('Webhook creation failed for path: %s',
          bag.resource.staticPropertyBag.path);
        console.log(msg, err);
        return next(msg);
      }

      bag.webhookExternalId = webhook.id;
      return next();
    }
  );
}

function _updateHook(bag, next) {
  if (!bag.webhookExternalId) return next();
  if (bag.hook.propertyBag.externalId === bag.webhookExternalId) return next();
  var who = bag.who + '|' + _updateHook.name;
  console.log(who, 'Inside');

  var update = {
    propertyBag: _.extend(bag.hook.propertyBag,
      {webhookExternalId: bag.webhookExternalId})
  };

  bag.apiAdapter.putHookById(bag.hook.id, update,
    function (err, hook) {
      if (err) {
        var msg = util.format(
          'Failed to update hook: %s with error: %s',
          bag.hook.id, (hook && hook.message) || err
        );
        console.log(msg);
        return next(msg);
      }

      bag.hook = hook;
      return next();
    }
  );
}

function _checkForResources(bag, next) {
  if (bag.action !== 'delete') return next();

  var who = bag.who + '|' + _checkForResources.name;
  console.log(who, 'Inside');

  var query = util.format('projectIds=%s&projectIntegrationIds=%s&' +
    'typeCodes=%s&sortOrder=1&sortBy=createdAt',
    bag.hook.projectId, bag.hook.projectIntegrationId,
    bag.hook.resourceTypeCode);

  var fetchedAllResources = false;
  var foundResource = false;
  var skip = 0;

  async.whilst(
    function () {
      return !fetchedAllResources && !foundResource;
    },
    function (done) {
      var currentQuery = util.format('%s&limit=%s&skip=%s',
        query, CALL_OBJECT_LIMIT, skip);
      bag.apiAdapter.getResources(currentQuery,
        function (err, resources) {
          if (err) {
            var msg = util.format(
              'Failed to getResources for query: %s with err: %s', query, err);
            console.log(who, msg);
            return done(msg);
          }

          if (resources.length === CALL_OBJECT_LIMIT)
            skip = skip + CALL_OBJECT_LIMIT;
          else
            fetchedAllResources = true;

          foundResource = _.find(resources,
            function (resource) {
              if (resource.isDeleted)
                return false;
              if (_.has(resource.ymlConfigPropertyBag, bag.hook.identifierName))
                return resource.ymlConfigPropertyBag[bag.hook.identifierName].
                  toString() === bag.hook.identifierValue;
              if (_.has(resource.staticPropertyBag, bag.hook.identifierName))
                return resource.staticPropertyBag[bag.hook.identifierName].
                  toString() === bag.hook.identifierValue;
              if (_.has(resource.systemPropertyBag, bag.hook.identifierName))
                return resource.systemPropertyBag[bag.hook.identifierName].
                  toString() === bag.hook.identifierValue;
              if (_.has(resource, bag.hook.identifierName))
                return resource[bag.hook.identifierName].toString() ===
                  bag.hook.identifierValue;
              return false;
            }
          );

          return done();
        }
      );
    },
    function (err) {
      if (err)
        return next(err);

      if (!foundResource)
        bag.deleteHook = true;

      return next();
    }
  );
}

function _deleteWebhook(bag, next) {
  if (!bag.deleteHook) return next();
  if (!bag.hook || !bag.hook.propertyBag ||
    !bag.hook.propertyBag.webhookExternalId)
    return next();

  var who = bag.who + '|' + _deleteWebhook.name;
  console.log(who, 'Inside');

  var repo = bag.resource.staticPropertyBag.path.split('/');
  var webhookId = bag.hook.propertyBag.webhookExternalId;

  var strategy = deleteWebhook[bag.integration.masterIntegrationName];

  strategy(
    bag.providerIntegrationValues, webhookId, repo[0], repo[1],
    bag.provider.url,
    function (err) {
      if (err) {
        var msg = util.format('Webhook deletion failed ' +
          'for path: %s', bag.resource.staticPropertyBag.path);
        console.log(msg, err);
        return next(msg);
      }

      return next();
    }
  );
}

function _deleteHook(bag, next) {
  if (!bag.deleteHook) return next();
  if (!bag.hook) return next();

  var who = bag.who + '|' + _deleteHook.name;
  console.log(who, 'Inside');

  bag.apiAdapter.deleteHookById(bag.hook.id,
    function (err, response) {
      if (err && err !== 404) {
        var msg = util.format(
          'Failed to delete hook: %s with error: %s',
          bag.hook.id, (response && response.message) || err
        );
        console.log(msg);
        return next(msg);
      }

      return next();
    }
  );
}

function _getPreviousHook(bag, next) {
  if (!bag.previousIntegrationId) return next();

  var who = bag.who + '|' + _getPreviousHook.name;
  console.log(who, 'Inside');

  var query = util.format('projectIds=%s&projectIntegrationIds=%s&' +
    'identifierNames=%s&identifierValues=%s&resourceTypeCodes=%s',
    bag.resource.projectId, bag.previousIntegrationId,
    'path', bag.resource.staticPropertyBag.path, bag.resource.typeCode);

  bag.apiAdapter.getHooks(query,
    function (err, hooks) {
      if (err) {
        var msg = util.format('getHooks failed for query: %s ' +
          'with error: %s', query, err.message);
        console.log(msg);
        return next(msg);
      }

      bag.previousHook = _.first(hooks);
      return next();
    }
  );
}

function _getPreviousProjectIntegration(bag, next) {
  if (!bag.previousHook) return next();

  var who = bag.who + '|' + _getPreviousProjectIntegration.name;
  console.log(who, 'Inside');

  bag.apiAdapter.getProjectIntegrationById(bag.previousIntegrationId,
    function (err, integration) {
      if (err) {
        console.log(util.format('getProjectIntegrationById failed for id: %s ' +
          'with error: %s', bag.previousIntegrationId, err.message));
        return next(err);
      }

      if (!_.contains(allowedMasterIntegrations,
        integration.masterIntegrationName)) {
        var msg = 'Unsupported integration updated for resourceId: ' +
          bag.resourceId;
        console.log(msg);
        return next(msg);
      }

      bag.previousIntegration = integration;
      bag.previousProviderIntegrationValues = {};

      _.each(bag.previousIntegration.formJSONValues,
        function (jsonValue) {
          if (jsonValue.label)
            bag.previousProviderIntegrationValues[jsonValue.label] =
              jsonValue.value;
        }
      );

      return next();
    }
  );
}

function _getPreviousProvider(bag, next) {
  if (!bag.previousHook) return next();

  var who = bag.who + '|' + _getPreviousProvider.name;
  console.log(who, 'Inside');

  bag.apiAdapter.getProviderById(bag.previousIntegration.providerId,
    function (err, provider) {
      if (err) {
        var msg = 'getProviderById for id: ' +
          bag.previousIntegration.providerId +
          ' returned error: ' + err.message;
        console.log(msg);
        return next(msg);
      }

      bag.previousProvider = provider;
      return next();
    }
  );
}

function _checkForPreviousResources(bag, next) {
  if (!bag.previousHook) return next();

  var who = bag.who + '|' + _checkForPreviousResources.name;
  console.log(who, 'Inside');

  var query = util.format('projectIds=%s&projectIntegrationIds=%s&' +
    'typeCodes=%s&sortOrder=1&sortBy=createdAt',
    bag.previousHook.projectId, bag.previousHook.projectIntegrationId,
    bag.previousHook.resourceTypeCode);

  var fetchedAllResources = false;
  var foundResource = false;
  var skip = 0;

  async.whilst(
    function () {
      return !fetchedAllResources && !foundResource;
    },
    function (done) {
      var currentQuery = util.format('%s&limit=%s&skip=%s',
        query, CALL_OBJECT_LIMIT, skip);
      bag.apiAdapter.getResources(currentQuery,
        function (err, resources) {
          if (err) {
            var msg = util.format(
              'Failed to getResources for query: %s with err: %s', query, err);
            console.log(who, msg);
            return done(msg);
          }

          if (resources.length === CALL_OBJECT_LIMIT)
            skip = skip + CALL_OBJECT_LIMIT;
          else
            fetchedAllResources = true;

          foundResource = _.find(resources,
            function (resource) {
              var hook = bag.previousHook;
              if (resource.isDeleted)
                return false;
              if (_.has(resource.ymlConfigPropertyBag, hook.identifierName))
                return resource.ymlConfigPropertyBag[hook.identifierName].
                  toString() === hook.identifierValue;
              if (_.has(resource.staticPropertyBag, hook.identifierName))
                return resource.staticPropertyBag[hook.identifierName].
                  toString() === hook.identifierValue;
              if (_.has(resource.systemPropertyBag, hook.identifierName))
                return resource.systemPropertyBag[hook.identifierName].
                  toString() === hook.identifierValue;
              if (_.has(resource, hook.identifierName))
                return resource[hook.identifierName].toString() ===
                  hook.identifierValue;
              return false;
            }
          );

          return done();
        }
      );
    },
    function (err) {
      if (err)
        return next(err);

      if (!foundResource)
        bag.deletePreviousHook = true;

      return next();
    }
  );
}

function _deletePreviousWebhook(bag, next) {
  if (!bag.deletePreviousHook) return next();
  if (!bag.previousHook || !bag.previousHook.propertyBag ||
    !bag.previousHook.propertyBag.webhookExternalId)
    return next();

  var who = bag.who + '|' + _deletePreviousWebhook.name;
  console.log(who, 'Inside');

  var repo = bag.resource.staticPropertyBag.path.split('/');
  var webhookId = bag.previousHook.propertyBag.webhookExternalId;

  var strategy = deleteWebhook[bag.previousIntegration.masterIntegrationName];

  strategy(
    bag.previousProviderIntegrationValues, webhookId, repo[0], repo[1],
    bag.previousProvider.url,
    function (err) {
      if (err) {
        var msg = util.format('Webhook deletion failed ' +
          'for path: %s', bag.resource.staticPropertyBag.path);
        console.log(msg, err);
        return next(msg);
      }

      return next();
    }
  );
}

function _deletePreviousHook(bag, next) {
  if (!bag.deletePreviousHook) return next();
  if (!bag.previousHook) return next();

  var who = bag.who + '|' + _deletePreviousHook.name;
  console.log(who, 'Inside');

  bag.apiAdapter.deleteHookById(bag.previousHook.id,
    function (err, response) {
      if (err && err !== 404) {
        var msg = util.format(
          'Failed to delete hook: %s with error: %s',
          bag.previousHook.id, (response && response.message) || err
        );
        console.log(msg);
        return next(msg);
      }

      return next();
    }
  );
}

syncWebhook();

'use strict';

var self = syncWebhook;
module.exports = self;

var async = require('async');
var util = require('util');
var _ = require('underscore');

var ApiAdapter = require('./ApiAdapter.js');

function syncWebhook() {
  var bag = {
    resourceId: process.env.resource_id,
    action: process.env.sync_action,
    apiAdapter: new ApiAdapter(process.env.api_token),
    resource: null
  };

  bag.who = util.format('resources|%s|id:', self.name, bag.resourceId);
  console.log(bag.who, 'Starting');

  async.series([
      _getResource.bind(null, bag),
      _postResourceVersion.bind(null, bag)
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

function _postResourceVersion(bag, next) {
  if (bag.action !== 'create' && bag.action !== 'update') return next();

  var who = bag.who + '|' + _postResourceVersion.name;
  console.log(who, 'Inside');

  var contentPropertyBag = {};
  // Anything not in ymlConfigPropertyBag or staticPropertyBag
  _.each(bag.resource.yml.configuration,
    function (value, key) {
      if (_.has(bag.resource.ymlConfigPropertyBag, key))
        return;
      if (_.has(bag.resource.staticPropertyBag, key))
        return;
      if (bag.resource.ymlConfigPropertyBag &&
        bag.resource.ymlConfigPropertyBag.integrationAlias === key)
        return;
      contentPropertyBag[key] = value;
    }
  );

  var newResourceVersion = {
    resourceId: bag.resource.id,
    projectId: bag.resource.projectId,
    versionTrigger: false,
    contentPropertyBag: contentPropertyBag
  };

  bag.apiAdapter.postResourceVersion(newResourceVersion,
    function (err, version) {
      if (err) {
        var msg = util.format(
          'Failed to create version for resource: %s with error: %s',
          bag.resource.name, (version && version.message) || err
        );
        console.log(msg);
        return next(msg);
      }

      bag.version = version;
      return next();
    }
  );
}

syncWebhook();

'use strict';

var _ = require('underscore');

/**
 * Global enum for Build Triggers
 * The system can ONLY have builds triggered by
 * actions specified here.
 **/

exports.INVALID = 10;
exports.MANUAL_BRANCH = 20;
exports.MANUAL_COMMIT = 30;
exports.MANUAL_PR = 40;
exports.WEBHOOK_COMMIT = 50;
exports.WEBHOOK_PR = 60;
exports.RE_RUN = 70;
exports.WEBHOOK_RELEASE = 80;
exports.WEBHOOK_TAG = 90;
exports.WEBHOOK_PR_CLOSE = 100;
exports.WEBHOOK_COMMENT = 110;

exports.names = [
  'INVALID',
  'MANUAL_BRANCH',
  'MANUAL_COMMIT',
  'MANUAL_PR',
  'WEBHOOK_COMMIT',
  'WEBHOOK_PR',
  'RE_RUN',
  'WEBHOOK_RELEASE',
  'WEBHOOK_TAG',
  'WEBHOOK_PR_CLOSE',
  'WEBHOOK_COMMENT'
];

exports.manualBuildTypes = [
  exports.MANUAL_BRANCH,
  exports.MANUAL_COMMIT,
  exports.MANUAL_PR,
  exports.RE_RUN
];

exports.webhookBuildTypes = [
  exports.WEBHOOK_COMMIT,
  exports.WEBHOOK_PR,
  exports.WEBHOOK_RELEASE,
  exports.WEBHOOK_TAG,
  exports.WEBHOOK_PR_CLOSE,
  exports.WEBHOOK_COMMENT
];

exports.lookup = function (code) {
  var codes = exports;

  return _.find(codes.names,
    function (codeName) {
      return codes[codeName] === code;
    }
  );
};

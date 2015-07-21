var querystring = require('querystring');


module.exports = function weixinWrapper(oauth2) {
  "use strict";

  return {

    getOAuthAccessToken: function (code, params, callback) {
      return oauth2.getOAuthAccessToken(code, params, function(err, accessToken, refreshToken, params) {
        if (err) return callback(err);

        if (params.errcode) {
          var statusCode = 400;
          var error = 'invalid_request';
          switch (params.errcode) {
            case 40001:
            case 40013:
              error = 'invalid_client';
              break;
            case 42001:
            case 42002:
            case 42003:
            case 40029:
              error = 'invalid_grant';
              break;
            default:
              break;
          }

          err = {
            statusCode: statusCode,
            data: JSON.stringify({
              error: error,
              error_description: params.errmsg
            })
          };
        }

        callback(err, accessToken, refreshToken, params);
      });
    },

    getAuthorizeUrl: function (params) {
      return oauth2._baseSite + oauth2._authorizeUrl + '?' + querystring.stringify(params).split('&').sort().join('&') + '#wechat_redirect';
    },

    get: function (url, access_token, callback) {
      return oauth2.get(url, access_token, function(err, result) {
        if (err) return callback(err);

        if (result.errcode) {
          var statusCode = 400;
          var error = 'invalid_request';
          switch (result.errcode) {
            case 40001:
            case 40013:
              error = 'invalid_client';
              break;
            case 42001:
            case 42002:
            case 42003:
            case 40029:
              error = 'invalid_grant';
              break;
            default:
              break;
          }

          err = {
            statusCode: statusCode,
            data: JSON.stringify({
              error: error,
              error_description: result.errmsg
            })
          };
        }

        callback(err, result);
      });
    }
  };
};

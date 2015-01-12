/**
 * Module dependencies.
 */
var util = require('util')
  , qs = require('querystring')
  , url = require('url')
  , uid = require('uid2')
  , utils = require('passport-oauth2/lib/utils')
  , OAuth2Strategy = require('passport-oauth2')
  , Profile = require('./profile')
  , InternalOAuthError = require('passport-oauth2').InternalOAuthError
  , AuthorizationError = require('passport-oauth2').AuthorizationError
  ;


/**
 * `Strategy` constructor.
 *
 * The weixin authentication strategy authenticates requests by delegating to
 * weixin using the OAuth 2.0 protocol.
 *
 * Applications must supply a `verify` callback which accepts an `accessToken`,
 * `refreshToken` and service-specific `profile`, and then calls the `done`
 * callback supplying a `user`, which should be set to `false` if the
 * credentials are not valid.  If an exception occurred, `err` should be set.
 *
 * Options:
 *   - `clientID`      your weixin application's Client ID
 *   - `clientSecret`  your weixin application's Client Secret
 *   - `callbackURL`   URL to which weixin will redirect the user after granting authorization
 *   - `scope`         valid scopes include:
 *                     'snsapi_base', 'snsapi_login', 'snsapi_userinfo'.
 *                     (see http://developer.github.com/v3/oauth/#scopes for more info)
 *
 * Examples:
 *
 *     passport.use(new WeixinStrategy({
 *         clientID: '123-456-789',
 *         clientSecret: 'its-a-secret'
 *         callbackURL: 'https://www.example.net/auth/weixin/callback'
 *       },
 *       function(accessToken, refreshToken, profile, done) {
 *         User.findOrCreate(..., function (err, user) {
 *           done(err, user);
 *         });
 *       }
 *     ));
 *
 * @param {Object} options
 * @param {Function} verify
 * @api public
 */
function Strategy(options, verify) {
  options = options || {};
  options.scope = options.scope || 'snsapi_base';
  var authorizationPath = options.scope === 'snsapi_login' ? '/qrconnect' : '/oauth2/authorize';
  options.authorizationURL = options.authorizationURL || 'https://open.weixin.qq.com/connect' + authorizationPath;
  options.tokenURL = options.tokenURL || 'https://api.weixin.qq.com/sns/oauth2/access_token';
  options.scopeSeparator = options.scopeSeparator || ',';

  OAuth2Strategy.call(this, options, verify);

  this.name = 'weixin';
  this._appid = options.clientID;
  this._secret = options.clientSecret;
  this._lang = options.lang || 'zh_CN';
  this._userProfileURL = options.userProfileURL || 'https://api.weixin.qq.com/sns/userinfo';
}

/**
 * Inherit from `OAuth2Strategy`.
 */
util.inherits(Strategy, OAuth2Strategy);

/**
 * Authenticate request by delegating to a service provider using OAuth 2.0.
 *
 * @param {Object}  req
 * @param {Object=} options
 * @api protected
 */
Strategy.prototype.authenticate = function(req, options) {
  options = options || {};
  var self = this;

  if (req.query && req.query.error) {
    if (req.query.error == 'access_denied') {
      return this.fail({ message: req.query.error_description });
    } else {
      return this.error(new AuthorizationError(req.query.error_description, req.query.error, req.query.error_uri));
    }
  }

  var callbackURL = options.callbackURL || this._callbackURL;
  if (callbackURL) {
    var parsed = url.parse(callbackURL);
    if (!parsed.protocol) {
      // The callback URL is relative, resolve a fully qualified URL from the
      // URL of the originating request.
      callbackURL = url.resolve(utils.originalURL(req, { proxy: this._trustProxy }), callbackURL);
    }
  }

  if (req.query && req.query.code) {
    var code = req.query.code;

    if (this._state) {
      if (!req.session) { return this.error(new Error('OAuth2Strategy requires session support when using state. Did you forget app.use(express.session(...))?')); }

      var key = this._key;
      if (!req.session[key]) {
        return this.fail({ message: 'Unable to verify authorization request state.' }, 403);
      }
      var state = req.session[key].state;
      if (!state) {
        return this.fail({ message: 'Unable to verify authorization request state.' }, 403);
      }

      delete req.session[key].state;
      if (Object.keys(req.session[key]).length === 0) {
        delete req.session[key];
      }

      if (state !== req.query.state) {
        return this.fail({ message: 'Invalid authorization request state.' }, 403);
      }
    }

    var params = this.tokenParams(options);
    params.grant_type = 'authorization_code';
    params.redirect_uri = callbackURL;

    this._oauth2.getOAuthAccessToken(code, params,
      function(err, accessToken, refreshToken, params) {
        if (err) { return self.error(self._createOAuthError('Failed to obtain access token', err)); }

        self._loadUserProfile(accessToken, params, function(err, profile) { // pass params that includes openid
          if (err) { return self.error(err); }

          function verified(err, user, info) {
            if (err) { return self.error(err); }
            if (!user) { return self.fail(info); }
            self.success(user, info);
          }

          try {
            if (self._passReqToCallback) {
              var arity = self._verify.length;
              if (arity == 6) {
                self._verify(req, accessToken, refreshToken, params, profile, verified);
              } else { // arity == 5
                self._verify(req, accessToken, refreshToken, profile, verified);
              }
            } else {
              var arity = self._verify.length;
              if (arity == 5) {
                self._verify(accessToken, refreshToken, params, profile, verified);
              } else { // arity == 4
                self._verify(accessToken, refreshToken, profile, verified);
              }
            }
          } catch (ex) {
            return self.error(ex);
          }
        });
      }
    );
  } else {
    var params = this.authorizationParams(options);
    params.response_type = 'code';
    params.redirect_uri = callbackURL;
    var scope = options.scope || this._scope;
    if (scope) {
      if (Array.isArray(scope)) { scope = scope.join(this._scopeSeparator); }
      params.scope = scope;
    }
    var state = options.state;
    if (state) {
      params.state = state;
    } else if (this._state) {
      if (!req.session) { return this.error(new Error('OAuth2Strategy requires session support when using state. Did you forget app.use(express.session(...))?')); }

      var key = this._key;
      state = uid(24);
      if (!req.session[key]) { req.session[key] = {}; }
      req.session[key].state = state;
      params.state = state;
    }

    var location = this._oauth2.getAuthorizeUrl(params);
    this.redirect(location + '#wechat_redirect'); // add fragment that weixin api required
  }
};

/**
 * Return extra parameters to be included in the authorization request.
 *
 * Some OAuth 2.0 providers allow additional, non-standard parameters to be
 * included when requesting authorization.  Since these parameters are not
 * standardized by the OAuth 2.0 specification, OAuth 2.0-based authentication
 * strategies can override this function in order to populate these parameters
 * as required by the provider.
 *
 * @param {Object} options
 * @return {Object}
 * @api protected
 */
Strategy.prototype.authorizationParams = function(options) {
  return { appid: this._appid };
};

/**
 * Return extra parameters to be included in the token request.
 *
 * Some OAuth 2.0 providers allow additional, non-standard parameters to be
 * included when requesting an access token.  Since these parameters are not
 * standardized by the OAuth 2.0 specification, OAuth 2.0-based authentication
 * strategies can override this function in order to populate these parameters
 * as required by the provider.
 *
 * @return {Object}
 * @api protected
 */
Strategy.prototype.tokenParams = function(options) {
  options.appid = this._appid;
  options.secret = this._secret;
  return options;
};

/**
 * Retrieve user profile from service provider.
 *
 * OAuth 2.0-based authentication strategies can override this function in
 * order to load the user's profile from the service provider.  This assists
 * applications (and users of those applications) in the initial registration
 * process by automatically submitting required information.
 *
 * @param {String} accessToken
 * @param {object} params
 * @param {string} params.openid
 * @param {Function} done
 * @api protected
 */
Strategy.prototype.userProfile = function(accessToken, params, done) {
  "use strict";
  if (this._scope === 'snsapi_base') {
    return done(null, { provider: 'weixin', id: params.openid });
  }

  var query = {
    openid: params.openid,
    lang  : this._lang
  };

  var userProfileURL = this._userProfileURL + qs.stringify(query);
  this._oauth2.get(userProfileURL, accessToken, function(err, result) {
    if (err) { return done(new InternalOAuthError('Failed to fetch user profile', err)); }

    var json;
    try {
      json = JSON.parse(result);
    } catch (ex) {
      return done(new Error('Failed to parse user profile'));
    }

    var profile = Profile.parse(json);
    profile.provider = 'weixin';
    profile._raw = result;
    profile._json = json;

    done(null, profile);
  });
};

/**
 * Load user profile, contingent upon options.
 *
 * @param {string} accessToken
 * @param {object} params
 * @param {string} params.openid
 * @param {function} done
 * @api private
 */
Strategy.prototype._loadUserProfile = function(accessToken, params, done) {
  var self = this;

  function loadIt() {
    return self.userProfile(accessToken, params, done);
  }
  function skipIt() {
    return done(null);
  }

  if (typeof this._skipUserProfile == 'function' && this._skipUserProfile.length > 1) {
    // async
    this._skipUserProfile(accessToken, params, function(err, skip) {
      if (err) { return done(err); }
      if (!skip) { return loadIt(); }
      return skipIt();
    });
  } else {
    var skip = (typeof this._skipUserProfile == 'function') ? this._skipUserProfile() : this._skipUserProfile;
    if (!skip) { return loadIt(); }
    return skipIt();
  }
};

/**
 * Expose `Strategy`.
 */
module.exports = Strategy;

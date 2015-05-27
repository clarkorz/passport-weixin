var SEX = ['male', 'female'];

/**
 * Parse profile.
 *
 * @param {Object|String} json
 * @return {Object}
 * @api private
 */
exports.parse = function(json) {
  if ('string' == typeof json) {
    json = JSON.parse(json);
  }

  var profile = {};
  profile.id = String(json.unionid || json.openid);
  profile.displayName = json.nickname;
  profile.gender = SEX[json.sex - 1];

  profile.photos = [
    {
      value: json.headimgurl
    }
  ];

  profile.addresses = [
    {
      country: json.country,
      region: json.province,
      locality: json.city
    }
  ];

  return profile;
};

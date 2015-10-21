var SEX = ['undisclosed', 'male', 'female'];

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
  profile.id = json.unionid || json.openid;
  profile.openid = json.openid;
  profile.unionid = json.unionid;
  profile.nickname = json.nickname;
  profile.gender = SEX[json.sex] || SEX[0];
  profile.displayName = json.nickname;

  profile.photos = [
    {
      type: 'avatar',
      primary: true,
      value: json.headimgurl
    }
  ];

  profile.addresses = [
    {
      type: 'home',
      primary: true,
      country: json.country,
      region: json.province,
      locality: json.city
    }
  ];

  return profile;
};

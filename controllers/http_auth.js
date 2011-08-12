var AUTH = module.exports = {};

AUTH.getSharedSecretForUser = function (user,  callback) {
  var secret;
  if (user === 'foo') secret = 'bar';
  callback(null, secret);
}

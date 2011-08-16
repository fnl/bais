var url = require('url');

exports.authenticate = function (req, res, next) {
  var query = url.parse(req.url, true).query,
      auth_type = query && query.login || 'digest',
      user, username;
  
  if ( query && query.logout && req.isAuthenticated() ) {
    username = req.getAuthDetails().user.username;
    req.logout();
  
  } else if (req.isAuthenticated()) {
    user = req.getAuthDetails().user;
    req.username = username = user.username;
  
  } else if ( query && query.login ) {
    req.authenticate([auth_type], function (error, authenticated) {
      if (error) {
        console.log(error);
        throw error; // TODO: some login error page?
      } else {
        if (authenticated === undefined) {
          console.log('authentication pending')
        } else {
          user = req.getAuthDetails().user;
          if (user && user.username) {
            req.username = username = user.username;
          } else {
            username = undefined;
          }
        }
      }
    }); // end req.authenticate
  
  } else {
    req.username = username = undefined;
  }
  console.log('%s: %s', username, req.url);
  next();
}


exports.getSharedSecretForUser = function (user,  callback) {
  console.log('authentication.getSharedSecretForUser');
  var secret;
  // TODO: write some real API...
  if (user === 'florian.leitner@gmail.com') secret = 'password';
  if (user === 'fleitner.cnio@gmail.com') secret = 'password';
  callback(null, secret);
}

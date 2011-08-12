var cradle = require('cradle'),
    couchdb = new (cradle.Connection)(),
    HOME = module.exports = {};

HOME.get = function(req, res) {
  user = req.getAuthDetails().user
  res.render('index', { title: "Home", username: user ? user.username : 'anonymous' });
};
  
HOME.test = function(req, res) {
  couchdb.info(function (err, data) {
    if (err === null) {
      console.log(data);
      res.render('index', {
        title: JSON.stringify(data)
      });
    } else {
      console.log(JSON.stringify(err));
      throw err;
    }
  });
};

var Home = module.exports.Home = function (couchdb) {
  if (!(this instanceof Home)) {
    return new Home(couchdb); // catch calls without 'new'
  }
  this.couchdb = couchdb;
};

Home.prototype.get = function (req, res) {
  res.render('index', {
    title: "Home",
    username: req.username || 'unknown surfer', 
  });
};
  
Home.prototype.test = function (req, res) {
  this.couchdb.get('', function (error, json) {
    if (error === null) {
      res.render('index', {
        title: JSON.stringify(json),
        username: req.username || 'unknown surfer'
      });
    } else {
      console.log('%s: %s', error.name, error.message);
      res.render('error', { title: error.name, message: error.message });
    }
  });
};

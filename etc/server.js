var express = require('express'),
    auth = require('connect-auth'),
    authentication = require(__dirname + '/authentication'),
    couchdb = require(__dirname + '/couchdb');

exports.createServer = function (port, hostname, couchdb_url) {
  /* ---------------- */
  /* 1. Configuration */
  /* ---------------- */
  
  var app = express.createServer(),
      db_conn = couchdb.Connection(couchdb_url),
      ROUTES;
  
  // 1.2. development
  app.configure('development', function() {
    app.use(express.errorHandler({
      dumpExceptions: true,
      showStack: true
    }));
  });

  // 1.3. production
  app.configure('production', function() {
    app.use(express.logger());
    app.use(express.errorHandler());
  });

  // 1.1. global
  app.configure(function(){
    app.use(auth([auth.Digest({
      getSharedSecretForUser: authentication.getSharedSecretForUser,
      realm: 'bais.bioinfo.cnio.es',
    })]));
    app.set('couchdb', db_conn);
    app.use(authentication.authenticate);
    app.set('views', __dirname + '/../views');
    app.set('view engine', 'jade');
    app.use(express.bodyParser());
    app.use(express.methodOverride());
    app.enable('case sensitive routes');
    //app.enable('strict routing'); // TODO: y/n?
    app.enable('jsonp callback'); // TODO: y/n?
    app.use(app.router);
    app.use(express.static(__dirname + '/../public'));
    
    if (hostname) {
      app.listen(port, hostname);
    } else {
      app.listen(port);
    }
  });

  /* --------- */
  /* 2. Routes */
  /* --------- */

  ROUTES = {
    home: require('../controllers/home').Home(db_conn),
  };

  // 2.1. auth
  app.post('/login', function(req, res) {
    // TODO: redirect to ?next=...
    console.log('logged in');
    res.writeHead(303, { 'Location': '/' });
    res.end('');
  });
  app.get('/logout', function(req, res) {
    req.logout(function (error) {
      if (error === undefined) {
        console.log('logged out');
        res.writeHead(303, { 'Location': '/' });
        res.end('');
      } else {
        console.log(error);
        throw error;
      }
    })
  });

  // 2.2. home
  app.get('/', ROUTES.home.get.bind(ROUTES.home));
  app.get('/test', ROUTES.home.test.bind(ROUTES.home));
  
  return app;
};
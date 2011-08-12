/**
 * A BioNLP Annotation Interoperability Server (BAIS).
 */

var cradle = require('cradle'),
    express = require('express'),
    auth = require('connect-auth'),
    url = require('url'),
    http_auth = require('./controllers/http_auth'),
    app = module.exports = express.createServer(),
    ROUTES = {};


/* 0. Auth Middleware */

function authenticate(req, res, next) {
  var query = url.parse(req.url, true).query,
      auth_type = query.login || 'digest';
  if ( query.logout ) {
    req.logout();
    console.log('logged out');
    next();
  } else if ( query.login ) {
    req.authenticate([auth_type], function (error, authenticated) {
      if (error) {
        console.log(error);
        throw error; // TODO: some login error page?
      } else {
        if (authenticated === undefined) {
          // pass - more interaction coming...
        } else {
          console.log('logged in');
          next();
        }
      }
    }); // end req.authenticate
  } else {
    console.log('isAuthenticated=' +  req.isAuthenticated());
    next();
  }
}

/* ---------------- */
/* 1. Configuration */
/* ---------------- */

// 1.1. global
app.configure(function(){
  app.use(auth([auth.Digest({
    getSharedSecretForUser: http_auth.getSharedSecretForUser,
    realm: 'bais.bioinfo.cnio.es',
  })]));
  app.use(authenticate);
  app.set('views', __dirname + '/views');
  app.set('view engine', 'jade');
  app.use(express.bodyParser());
  app.use(express.methodOverride());
  app.enable('case sensitive routes');
  //app.enable('strict routing'); // TODO: y/n?
  app.enable('jsonp callback'); // TODO: y/n?
  app.use(app.router);
  app.use(express.static(__dirname + '/public'));
});

// 1.2. development
app.configure('development', function() {
  cradle.setup({
    host: '127.0.0.1',
    port: 5984,
    raw: false,
    cache: true,
  });
  app.use(express.errorHandler({
    dumpExceptions: true,
    showStack: true
  }));
  app.listen(8080);
});

// 1.3. production
app.configure('production', function() {
  cradle.setup({
    host: 'ackbar.cnio.es',
    port: 5984,
    raw: false,
    cache: true,
  });
  app.use(express.logger());
  app.use(express.errorHandler());
  app.listen(80);
});

/* --------- */
/* 2. Routes */
/* --------- */

ROUTES.home = require('./controllers/home');

// 2.0. auth
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

// 2.1. home
app.get('/', ROUTES.home.get);
app.get('/test', ROUTES.home.test);

/* --------- */
/* 3. Report */
/* --------- */

console.log("Express server listening on port %d in %s mode", app.address().port, app.settings.env);

require.paths.push('../../');
require.paths.push(__dirname);

var db = require('lib/couchdb'),
    url = require('url'),
    testCase = require('nodeunit').testCase,
    DEFAULT_URL_STRING = 'http://localhost:5984',
    DEFAULT_URL = url.parse(DEFAULT_URL_STRING),
    DEFAULT_OPTIONS = {
      host: 'localhost',
      port: 5984,
      method: 'GET',
      path: '/',
      headers: {'Content-Type': 'application/json;charset=utf-8'},
      query: {}
    },
    DEFAULT_PROTOCOL = 'http:',
    DEFAULT_AUTH_URL = '';

function update(object, another) {
  if (typeof another === 'undefined') {
    another = object;
    object = {};
  }
  for (var p in another) {
    if (another.hasOwnProperty(p)) {
      object[p] = another[p];
    }
  }
  
  return object;
}

function assertClientProperties(conn, should) {
  this.ok(conn instanceof db.CouchClient, conn + ' not a CouchClient');
  this.equal(conn.protocol, should.protocol);
  this.equal(conn.options.host, should.options.host);
  this.equal(conn.options.port, should.options.port);
  this.equal(conn.options.method, should.options.method);
  this.equal(conn.options.path, should.options.path);
  this.deepEqual(conn.options.headers, should.options.headers);
  this.deepEqual(conn.options.query, should.options.query);
  this.equal(conn._auth_url, should._auth_url);
}

function expectedClient() {
  var opts = update(DEFAULT_OPTIONS);
  opts.headers = update(DEFAULT_OPTIONS.headers);
  opts.query = update(DEFAULT_OPTIONS.query);
  
  return {
    protocol: DEFAULT_PROTOCOL,
    _auth_url: DEFAULT_AUTH_URL,
    options: opts,
  };
}

// CREATE
exports.create = {
  
  'a default CouchClient [http://localhost:5984]':
  function (test) {
    var conn = new db.CouchClient();
    assertClientProperties.call(test, conn, expectedClient());
    test.done();
  },
  
  'a CouchClient without using keyword "new"':
  function (test) {
    var conn = db.CouchClient();
    assertClientProperties.call(test, conn, expectedClient());
    test.done();
  },
  
  'calls setUrl() with the first argument':
  function (test) {
    var conn, setUrl = db.CouchClient.prototype.setUrl;
    db.CouchClient.prototype.setUrl = function () {
      test.deepEqual(Array.prototype.slice.call(arguments), ['url']);
    };
    conn = db.CouchClient('url', 'dummy')
    test.expect(1);
    test.done();
    db.CouchClient.prototype.setUrl = setUrl;
  },
};

exports.setUrl = testCase({
  setUp: function (cb) {
    this.c = new db.CouchClient();
    this.c.setCredentials = function () { return this };
    this.e = expectedClient();
    cb();
  },
  
  '("") -> default client':
  function (test) {
    assertClientProperties.call(test, this.c.setUrl(''),  this.e);
    test.done();
  },
  
  'parses any other port to its Number':
  function (test) {
    this.e.options.port = 123;
    assertClientProperties.call(
      test, this.c.setUrl('http://localhost:123/'),  this.e
    );
    test.done();
  },
  
  '("https:") -> a CouchClient using SSL':
  function (test) {
    this.e.protocol = 'https:';
    assertClientProperties.call(test, this.c.setUrl('https:'), this.e);
    test.done();
  },
  
  '("http://localhost") -> to port 80':
  function (test) {
    this.e.options.port = 80;
    assertClientProperties.call(
      test, this.c.setUrl('http://localhost'), this.e
    );
    test.done();
  },
  
  '("http://hostname:5984")':
  function (test) {
    this.e.options.host = 'hostname';
    assertClientProperties.call(
      test, this.c.setUrl('http://hostname:5984'), this.e
    );
    test.done();
  },
  
  '("http://localhost:5984/pathname")':
  function (test) {
    this.e.options.path = '/pathname';
    assertClientProperties.call(
      test, this.c.setUrl('http://localhost:5984/pathname'), this.e
    );
    test.done();
  },
  
  '("http://localhost:5984?param=value")':
  function (test) {
    this.e.options.query.param = 'value';
    assertClientProperties.call(
      test, this.c.setUrl('http://localhost:5984?param=value'), this.e
    );
    test.done();
  },
  
  'calls setCredentials() with parsed authentication details':
  function (test) {
    this.c.setCredentials = function (cred) {
      test.equal(cred, 'cred');
    };
    this.c.setUrl('http://cred@localhost');
    test.expect(1);
    test.done();
  },
});

// SET CREDENTIALS
exports.setCredentials = {
  
  'via new CouchClient("http://user:pass@localhost:5984")':
  function (test) {
    var conn = new db.CouchClient('http://user:pass@localhost:5984'),
        expected = expectedClient();
    expected.options.headers['Authentication'] =
      'Basic ' + 'user:pass'.toString('base64');
    expected._auth_url = 'user:pass@';
    assertClientProperties.call(test, conn, expected);
    test.done();
  },
  
  'on a CouchClient with bad credentials throws a TypeError':
  function (test) {
    test.throws(function () {new db.CouchClient('http://bad@host')},
                TypeError);
    test.done();
  },
  
  '() clears credentials':
  function (test) {
    var conn = new db.CouchClient('http://user:pass@localhost:5984');
    assertClientProperties.call(test, conn.setCredentials(),
                                expectedClient());
    test.done();
  },
  
  '("user:pass") sets credentials':
  function (test) {
    var conn = new db.CouchClient(),
        expected = expectedClient();
    expected.options.headers['Authentication'] =
      'Basic ' + 'user:pass'.toString('base64');
    expected._auth_url = 'user:pass@';
    assertClientProperties.call(test, conn.setCredentials('user:pass'),
                                expected);
    test.done();
  },
  
  '("user", "pass") sets credentials':
  function (test) {
    var conn = new db.CouchClient(),
        expected = expectedClient();
    expected.options.headers['Authentication'] =
      'Basic ' + 'user:pass'.toString('base64');
    expected._auth_url = 'user:pass@';
    assertClientProperties.call(test, conn.setCredentials('user' ,'pass'),
                                expected);
    test.done();
  },
  
  '("user") throws a TypeError':
  function (test) {
    var conn = new db.CouchClient();
    test.throws(function () {conn.setCredentials('user')}, TypeError);
    test.done();
  },
  
  '(1, 2) throws a TypeError':
  function (test) {
    var conn = new db.CouchClient();
    test.throws(function () {conn.setCredentials(1, 2)}, TypeError);
    test.done();
  },
  
  '({}) throws a TypeError':
  function (test) {
    var conn = new db.CouchClient();
    test.throws(function () {conn.setCredentials({})}, TypeError);
    test.done();
  },
};

// HELPERS
exports.helpers = testCase({
  setUp: function (cb) {
    this.conn = new db.CouchClient();
    cb();
  },
  
  'CouchClient.getUrl()':
  function (test) {
    this.conn.getPath = function () {
      test.ok(true);
      return 'path'
    }
    this.conn.getQuery = function () {
      test.ok(true);
      return 'query'
    }
    this.conn._auth_url = 'AUTH';
    test.equal(this.conn.getUrl(), 'http://AUTHlocalhost:5984pathquery');
    test.expect(3);
    test.done();
  },
  
  'CouchClient.getPath()':
  function (test) {
    var path = this.conn.getPath();
    test.equal(path, '/');
    this.conn.options.path = 'BASE';
    path = this.conn.getPath('PATH');
    test.equal(path, 'BASE/PATH');
    test.done();
  },
  
  'CouchClient.getQuery()':
  function (test) {
    var query = this.conn.getQuery();
    test.equal(query, '');
    this.conn.options.query.PARAM = 'ORIGINAL';
    query = this.conn.getQuery({ PARAM: 'VALUE' });
    test.equal(query, '?PARAM=VALUE');
    test.done();
  },
  
  'CouchClient.toString()':
  function (test) {
    this.conn.getUrl = function () {
      return '=URL=';
    }
    test.equal(this.conn.toString(), '[object CouchClient =URL=]');
    test.done();
  },
});


exports.resource = testCase({
  setUp: function (cb) {
    this.conn = new db.CouchClient();
    this.conn.getPath = function () {
      return '/path/';
    }
    this.conn.getQuery = function () {
      return '?param=value';
    }
    this.props = expectedClient();
    this.props.options.path = '/path/';
    this.props.options.query.param = 'value';
    cb();
  },
  
  '() returns a copy of that CouchClient':
  function (test) {
    assertClientProperties.call(test, this.conn.resource(), this.props);
    test.done();
  },
  
  '("resource")':
  function (test) {
    var conn = this.conn.resource('resource');
    this.props.options.path += 'resource';
    assertClientProperties.call(test, conn, this.props);
    test.done();
  },
  
  '("spaces and /s inside")':
  function (test) {
    var conn = this.conn.resource('spaces and /s inside');
    this.props.options.path += 'spaces%20and%20%2Fs%20inside';
    assertClientProperties.call(test, conn, this.props);
    test.done();
  },
  
  '("a", "b", "c")':
  function (test) {
    var conn = this.conn.resource('a', 'b', 'c');
    this.props.options.path += 'a/b/c';
    assertClientProperties.call(test, conn, this.props);
    test.done();
  },
  
  '(["a", "b", "c"])':
  function (test) {
    var conn = this.conn.resource(['a', 'b', 'c']);
    this.props.options.path += 'a/b/c';
    assertClientProperties.call(test, conn, this.props);
    test.done();
  },
  
  'joins paths correctly even if the base path has no trailing slash':
  function (test) {
    var conn;
    this.conn.getPath = function () { return '/base'; }
    conn = this.conn.resource('resource');
    this.props.options.path = '/base/resource';
    assertClientProperties.call(test, conn, this.props);
    test.done();
  },
  
  'CouchClient.resource(1) throws TypeError':
  function (test) {
    test.throws((function () { this.conn.resource(1) }).bind(this),
                TypeError);
    test.done();
  }
});

function assertApiMethod(test, method, data) {
  test.equals(method(test, 'data'), data);
  test.expect(2);
  test.done();
}

exports.restapi = testCase({
  setUp: function (cb) {
    var that = this;
    this.conn = new db.CouchClient();
    this.conn._doRequest = function (method, test, data) {
      test.equal(method, that.method);
      return data;
    };
    cb();
  },
  
  'CouchClient.copy()':
  function (test) {
    this.method = 'COPY';
    assertApiMethod(test, this.conn.copy.bind(this.conn));
  },
  
  'CouchClient.delete()':
  function (test) {
    this.method = 'DELETE';
    assertApiMethod(test, this.conn.delete.bind(this.conn));
  },
  
  'CouchClient.get()':
  function (test) {
    this.method = 'GET';
    assertApiMethod(test, this.conn.get.bind(this.conn));
  },
  
  'CouchClient.head()':
  function (test) {
    this.method = 'HEAD';
    assertApiMethod(test, this.conn.head.bind(this.conn));
  },
  
  'CouchClient.post()':
  function (test) {
    this.method = 'POST';
    assertApiMethod(test, this.conn.post.bind(this.conn), 'data');
  },
  
  'CouchClient.put()':
  function (test) {
    this.method = 'PUT';
    assertApiMethod(test, this.conn.put.bind(this.conn), 'data');
  },
});

// API WRAPPER
exports._doRequest = {
  
  '(..., true) -> raw':
  function (test) {
    var conn = new db.CouchClient();
    conn.request = function (opts, data, cb) {
      test.deepEqual(opts, { path: 'path', method: 'METHOD' });
      test.equal(data, 'data');
      test.equal(cb, 'cb');
    }
    conn._doRequest('METHOD', 'path', 'data', 'cb', true);
    test.expect(3);
    test.done();
  },
  
  '(..., false) -> JSON':
  function (test) {
    var conn = new db.CouchClient();
    conn.requestJson = function (opts, data, cb) {
      test.deepEqual(opts, { path: 'path', method: 'METHOD' });
      test.equal(data, 'data');
      test.equal(cb, 'cb');
    }
    conn._doRequest('METHOD', 'path', 'data', 'cb', false);
    test.expect(3);
    test.done();
  },
}

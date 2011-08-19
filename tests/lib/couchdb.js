require.paths.push('../../');
require.paths.push(__dirname);

var db = require('lib/couchdb'),
    events = require('events'),
    http = require('http'),
    https = require('https'),
    url = require('url'),
    testCase = require('nodeunit').testCase,
    DEFAULT_URL_STRING = 'http://localhost:5984',
    DEFAULT_URL = url.parse(DEFAULT_URL_STRING),
    DEFAULT_OPTIONS = {
      host: 'localhost',
      port: 5984,
      method: 'GET',
      path: '/',
      headers: {},
      query: {}
    },
    DEFAULT_PROTOCOL = 'http:',
    DEFAULT_CONTENT_TYPE = 'application/json;charset=utf-8',
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
  this.equal(conn.default_content_type, should.default_content_type);
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
    default_content_type: DEFAULT_CONTENT_TYPE,
  };
}

// CREATE
exports.create = {
  
  '() -> a default CouchClient [http://localhost:5984]':
  function (test) {
    var conn = new db.CouchClient();
    assertClientProperties.call(test, conn, expectedClient());
    test.done();
  },
  
  'works without using the keyword "new"':
  function (test) {
    var conn = db.CouchClient();
    assertClientProperties.call(test, conn, expectedClient());
    test.done();
  },
  
  'constructor calls setUrl() with its first argument (only)':
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
  
  'with default headers':
  function (test) {
    var expected = expectedClient(),
        conn = db.CouchClient({
      'Content-Type': 'sentinel',
      'other': 'header'
    });
    expected.options.headers = { 'other': 'header' };
    expected.default_content_type = 'sentinel';
    assertClientProperties.call(test, conn, expected);
    test.done();
  },
};

exports.setUrl = testCase({
  setUp: function (cb) {
    this.c = new db.CouchClient();
    this.c.setCredentials = function () { return this };
    this.e = expectedClient();
    cb();
  },
  
  '() -> default client':
  function (test) {
    assertClientProperties.call(test, this.c.setUrl(),  this.e);
    test.done();
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
  
  '("http://localhost:1234")':
  function (test) {
    this.e.options.port = 1234;
    assertClientProperties.call(
      test, this.c.setUrl('http://localhost:1234'), this.e
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
  
  'using new CouchClient() with bad credentials throws a TypeError':
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
  
  '("resource") -> adds a single resource component to the path':
  function (test) {
    var conn = this.conn.resource('resource');
    this.props.options.path += 'resource';
    assertClientProperties.call(test, conn, this.props);
    test.done();
  },
  
  'escapes spaces and slashes in resource component names':
  function (test) {
    var conn = this.conn.resource('spaces and /s inside');
    this.props.options.path += 'spaces%20and%20%2Fs%20inside';
    assertClientProperties.call(test, conn, this.props);
    test.done();
  },
  
  '("a", "b", "c") -> a/b/c':
  function (test) {
    var conn = this.conn.resource('a', 'b', 'c');
    this.props.options.path += 'a/b/c';
    assertClientProperties.call(test, conn, this.props);
    test.done();
  },
  
  '(["a", "b", "c"]) -> a/b/c, too':
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
  test.equals(method(test, 'callback', data), data === true ? null : data);
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
  
  'CouchClient.post() - raw, no data':
  function (test) {
    this.method = 'POST';
    assertApiMethod(test, this.conn.post.bind(this.conn), true);
  },
  
  'CouchClient.put()':
  function (test) {
    this.method = 'PUT';
    assertApiMethod(test, this.conn.put.bind(this.conn), 'data');
  },
  
  'CouchClient.put() - raw, no data':
  function (test) {
    this.method = 'PUT';
    assertApiMethod(test, this.conn.put.bind(this.conn), true);
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

// DEFINE ERROR
exports.defineError = testCase({
  setUp: function (cb) {
    this.testError = function (test, code, name) {
      test.deepEqual(db.__test.defineError(code),
                     { code: code, name: name });
    };
    cb();
  },
  
  '(code) -> named HttpError with code':
  function (test) {
    errors = {
      'BadRequest': 400,
      'Unauthorized': 401,
      'Forbidden': 403,
      'NotFound': 404,
      'NotAcceptable': 406,
      'Conflict': 409,
      'PreconditionFailed': 412,
      'BadContentType': 415,
      'RangeNotSatisfiable': 416,
      'ExpectationFailed': 417,
      'ServerError': 500,
    }
    for (name in errors) {
      this.testError(test, errors[name], name);
    }
    test.expect(errors.length);
    test.done();
  },
  
  '(unknown code number) -> general HttpError with code':
  function (test) {
    var known = [400, 401, 403, 404, 406, 409, 412, 415, 416, 417, 500];
    
    for (var code = 1000; code--;) {
      if (known.indexOf(code) === -1) {
        this.testError(test, code, 'HttpError');
      }
    }
    test.expect(1000 - known.length);
    test.done();
  },
  
  '(anything not a number) -> general HttpError with code=NaN':
  function (test) {
    var err = db.__test.defineError('not a number');
    test.equal(typeof err.code, 'number');
    test.equal(err.code.toString(), 'NaN');
    test.done();
  },
});

// MAKE ERROR
exports.makeError = testCase({
  setUp: function (cb) {
    this.error = {
      name: 'HttpError',
      code: 1,
      message: undefined
    };
    cb();
  },
  
  '() -> undefined HttpError':
  function (test) {
    var err = db.__test.makeError();
    test.equal(err.name, this.error.name);
    test.equal(err.code.toString(), 'NaN');
    test.equal(typeof err.message, typeof this.error.message);
    test.done();
  },
  
  '(code) -> HttpError without message':
  function (test) {
    test.deepEqual(db.__test.makeError(1), this.error);
    test.done();
  },
  
  '(code, string) -> HttpError with plain message':
  function (test) {
    this.error.message = 'message';
    test.deepEqual(db.__test.makeError(1, 'message'), this.error);
    test.done();
  },
  
  '(code, CouchErrorJSON) -> HttpError with "error: reason" message':
  function (test) {
    var couch_error = '{"error":"NAME","reason":"MESSAGE"}';
    this.error.message = 'NAME: MESSAGE';
    test.deepEqual(db.__test.makeError(1, couch_error), this.error);
    test.done();
  },
  
  '(code, AnyJSON) -> HttpError with serialized JSON in message':
  function (test) {
    var json = '{reason: "MESSAGE"}';
    this.error.message = json;
    test.deepEqual(db.__test.makeError(1, json), this.error);
    test.done();
  },
  
  '(code, IllegalJSON) -> HttpError with serialized illegal JSON in message':
  function (test) {
    var couch_error = '{error -> "NAME",reason -> "MESSAGE"}';
    this.error.message = couch_error;
    test.deepEqual(db.__test.makeError(1, couch_error), this.error);
    test.done();
  },
});

// MERGE
exports.merge = {
  
  'two objects, updating the latter with new values from the former':
  function (test) {
    var src = { extra: 1, exists: 2 },
        dest = { other: 3, exists: 4 },
        result = { extra: 1, other: 3, exists: 4 };
    test.deepEqual(db.__test.merge(src, dest), result);
    test.done();
  }
}

// PATCH REQUEST
exports.patchRequest = testCase({
  setUp: function (cb) {
    var test_data = this.data = '{"data":true}',
        f = function (data, test) {
      test.equal(data, test_data);
    };
    req = { write: f, end: f};
    this.patched = db.__test.patchRequest(req);
    cb();
  },
  
  'patches request.write':
  function (test) {
    this.patched.write(this.data, test);
    test.expect(1);
    test.done();
  },
  
  'patches request.end':
  function (test) {
    this.patched.end(this.data, test);
    test.expect(1);
    test.done();
  },
  
  'request.write stringifies JSON objects':
  function (test) {
    this.patched.write(JSON.parse(this.data), test);
    test.expect(1);
    test.done();
  },
  
  'request.end stringifies JSON objects':
  function (test) {
    this.patched.end(JSON.parse(this.data), test);
    test.expect(1);
    test.done();
  },
});

// PREPARE DATA
exports.prepareData = {
  
  'string':
  function (test) {
    var headers = {},
        data = db.__test.prepareData('data', headers);
    test.equal(data, 'data');
    test.deepEqual(headers, {'Content-Length': 4});
    test.done();
  },
  
  'Array':
  function (test) {
    var headers = {},
        data = db.__test.prepareData([1, 2, 3, 4], headers);
    test.deepEqual(data, [1, 2, 3, 4]);
    test.deepEqual(headers, {'Content-Length': 4});
    test.done();
  },
  
  'Buffer':
  function (test) {
    var headers = {},
        data = db.__test.prepareData(new Buffer(4), headers);
    test.ok(data instanceof Buffer);
    test.deepEqual(headers, {'Content-Length': 4});
    test.done();
  },
  
  'JSON':
  function (test) {
    var headers = {},
        data = db.__test.prepareData(null, headers);
    test.equal(data, 'null');
    test.deepEqual(headers, {'Content-Length': 4});
    test.done();
  },
  
  'does not override Content-Length':
  function (test) {
    var headers = {'Content-Length': 'sentinel'},
        data = db.__test.prepareData('data', headers);
    test.equal(data, 'data');
    test.deepEqual(headers, {'Content-Length': 'sentinel'});
    test.done();
  },
}

// REQUEST JSON
exports.requestJson = testCase({
  setUp: function (cb) {
    var res = this.response = new (events.EventEmitter);
    res.setEncoding = function() {};
    res.statusCode = 200;
    this.conn = new db.CouchClient();
    this.conn.request = function (options, data, callback) {
      callback(res);
      return Array.prototype.slice.call(arguments);
    };
    cb();
  },
  
  'calls request() with right arguments':
  function (test) {
    args = this.conn.requestJson('options', 'data', function () {});
    test.equal(args[0], 'options');
    test.equal(args[1], 'data');
    test.equal(typeof args[2], 'function');
    test.done();
  },
  
  'emits the body, chunk, close, data, and end events':
  function (test) {
    var callback = function (res) {
      test.ok(res instanceof events.EventEmitter);
      res.on('body', function (data) { test.ok(false); });
      res.on('chunk', function (data) { test.equal(data, 'sentinel'); });
      res.on('close', function (err) { test.equal(err, 'an error'); });
      res.on('data', function (data) { test.equal(data, 'sentinel'); });
      res.on('end', function () { test.ok(true); });
    }
    this.conn.requestJson('options', 'data', callback);
    this.response.emit('data', '"sentinel"');
    this.response.emit('close', 'an error');
    this.response.emit('end');
    test.expect(5);
    test.done();
  },
  
  'sets response encoding to UTF-8':
  function (test) {
    this.response.setEncoding = function(encoding) {
      test.equal(encoding, 'utf8');
    };
    this.conn.requestJson('options', 'data', function () {});
    test.expect(1);
    test.done();
  },
  
  'emits HTTP status errors':
  function (test) {
    var couch_error = { error: "NAME", reason: "REASON" },
        error = {
          code: 1000,
          name: 'HttpError',
          message: 'NAME: REASON'
        },
        callback = function (res) {
      res.on('body', function (data) { test.ok(false); });
      res.on('chunk', function (data) { test.deepEqual(data, couch_error); });
      res.on('end', function (data) { test.ok(false); });
      res.on('close', function (err) { test.deepEqual(err, error); });
    }
    this.response.statusCode = 1000;
    this.conn.requestJson('options', 'data', callback);
    this.response.emit('data', JSON.stringify(couch_error));
    this.response.emit('end');
    test.expect(2);
    test.done();
  },
  
  'emits then body and a syntax error if it cannot deserialize the data':
  function (test) {
    var callback = function (res) {
      res.on('body', function (data) { test.equal(data, '{ broken }'); });
      res.on('chunk', function (data) { test.ok(false); });
      res.on('close', function (err) {
        test.equal(err.name, "SyntaxError");
        test.equal(err.message, "Unexpected token ILLEGAL");
      });
      res.on('data', function (data) { test.ok(false); });
      res.on('end', function (data) { test.ok(false); });
    }
    this.conn.requestJson('options', 'data', callback);
    this.response.emit('data', '{ broken }');
    this.response.emit('end');
    test.expect(3);
    test.done();
  },
});

// REQUEST
exports.request = testCase({
  setUp: function (cb) {
    var request = this.request = {
      write: function () {},
      end: function () {},
      mocked: true,
    };
    http.request = https.request = function () {
      return request;
    };
    this.conn = new db.CouchClient();
    cb();
  },
  
  'returns a http.ClientRequest':
  function (test) {
    var req = this.conn.request('object', 'data', 'callback');
    test.ok(req.mocked);
    this.conn.protocol = 'https:';
    req = this.conn.request('object', 'data', 'callback');
    test.ok(req.mocked);
    test.done();
  },
  
  'returns a http.ClientRequest even if the protocol is malformed':
  function (test) {
    this.conn.protocol = 'anything';
    var req = this.conn.request('object', 'data', 'callback');
    test.ok(req.mocked);
    test.done();
  },
  
  'sets the options from default':
  function (test) {
    var request = this.request;
    http.request = function (options) {
      test.deepEqual(options, {
        method: 'GET',
        host: 'localhost',
        port: '5984',
        path: '/PATH',
        headers: {},
      })
      return request;
    }
    this.conn.request('PATH');
    test.expect(1);
    test.done();
  },
  
  'calls getPath and getQuery and adds the results to the path':
  function (test) {
    var request = this.request;
    http.request = function (options) {
      test.equal(options.path, 'PATH?QUERY');
      return request;
    }
    this.conn.getPath = function () { return 'PATH' };
    this.conn.getQuery = function () { return '?QUERY' };
    this.conn.request('object', 'data', 'callback');
    test.expect(1);
    test.done();
  },
  
  'merges default and optional headers':
  function (test) {
    var request = this.request;
    http.request = function (options) {
      test.deepEqual(options.headers, { merged: true });
      return request;
    }
    this.conn.options.headers.merged = false;
    this.conn.request({ headers: { merged: true }}, 'data', 'callback');
    test.expect(1);
    test.done();
  },
  
  'adds the default Content-Type and -Length for POST and PUT (only)':
  function (test) {
    var methods = ['PUT', 'POST', 'GET', 'HEAD', 'DELETE', 'COPY'],
        request = this.request;
    http.request = function (options) {
      if (options.method === 'POST' || options.method === 'PUT') {
        test.deepEqual(options.headers, {
          'Content-Type': DEFAULT_CONTENT_TYPE,
          'Content-Length': 4,
        });
      } else {
        test.ok(true);
      }
      return request;
    }
    for (var i = methods.length; i--;) {
      this.conn.request({ method: methods[i] }, 'data', 'callback');
    }
    test.expect(methods.length);
    test.done();
  },
  
  'adds the PUT/POST Content-Length for JSON objects after serializing them':
  function (test) {
    var methods = ['PUT', 'POST'],
        request = this.request;
    request.write = function (data) {
      test.equal(data, '{"a":1}');
    }
    http.request = function (options) {
      test.deepEqual(options.headers, {
        'Content-Type': DEFAULT_CONTENT_TYPE,
        'Content-Length': 7,
      });
      return request;
    }
    for (var i = methods.length; i--;) {
      this.conn.request({ method: methods[i] }, {a:1}, 'callback');
    }
    test.expect(methods.length * 2);
    test.done();
  },
  
  'adds the Content-Length when PUT/POSTing Buffers or Arrays':
  function (test) {
    var request = this.request;
    request.write = function (data) {
      test.equal(data.length, 1);
    }
    http.request = function (options) {
      test.deepEqual(options.headers, {
        'Content-Type': DEFAULT_CONTENT_TYPE,
        'Content-Length': 1,
      });
      return request;
    }
    this.conn.request({ method: 'PUT' }, [1], 'callback');
    this.conn.request({ method: 'POST' }, new Buffer(1), 'callback');
    test.expect(4);
    test.done();
  },
  
  'but add Content-Type and -Length on PUT/POST only if not defined':
  function (test) {
    var request = this.request,
        headers = {
          'Content-Type': 'sentinel',
          'Content-Length': 'length',
        };
    http.request = function (options) {
      test.deepEqual(options.headers, headers);
      return request;
    }
    this.conn.request({ headers: headers }, 'data', 'callback');
    test.expect(1);
    test.done();
  },
  
  'calls prepareData() for POST and PUT requests with data':
  function (test) {
    var methods = ['PUT', 'POST', 'GET', 'HEAD', 'DELETE', 'COPY'];
    this.request.write = function (data) {
      test.equal(data, '{"a":1}');
    }
    for (var i = methods.length; i--;) {
      this.conn.request({ method: methods[i] }, {a:1}, 'callback');
    }
    test.expect(2);
    test.done();
  },
  
  // 'ensures the callback is always a function':
  // function (test) {
  //   var request = this.request;
  //   http.request = function (options, cb) {
  //     test.equal(typeof cb, 'function');
  //     return request;
  //   }
  //   this.conn.request('object', 'data', 'callback');
  //   test.expect(1);
  //   test.done();
  // },  
  
  'writes data to the ClientRequest if a POST or PUT':
  function (test) {
    var methods = ['PUT', 'POST', 'GET', 'HEAD', 'DELETE', 'COPY'],
        request = this.request;
    request.write = function (data) {
      test.equal(data, 'data');
    }
    http.request = function (options, cb) {
      test.ok(true);
      return request;
    }
    for (var i = methods.length; i--;) {
      this.conn.request({ method: methods[i] }, 'data', 'callback');
    }
    test.expect(methods.length + 2);
    test.done();
  },
  
  'patches ClientRequest write() and end() to accept/serialize objects':
  function (test) {
    this.request.end = this.request.write = function (data) {
      test.equal(data, '{"a":1}');
    }
    this.request.end = function (data) {
      test.equal(data, '{"a":1}');
    }
    var req = this.conn.request('object', 'data', 'callback');
    req.write({a:1})
    req.end({a:1})
    test.expect(2);
    test.done();
  }
  
});

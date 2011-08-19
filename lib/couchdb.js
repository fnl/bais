var events = require('events'),
    http = require('http'),
    https = require('https'),
    querystring = require('querystring'),
    url = require('url');

/**
 * Create a new client for a CouchDB.
 *
 * In a nutshel, CouchClient works just as Node's HTTP client works:
 *
 * request = client.request(options, function (response) { ... });
 *
 * However, there are several things going on to make handling requests
 * easier: To not have to specifiy the HTTP method verb, the common CouchDB
 * request methods are provided directly: GET, POST, PUT, DELETE, HEAD, and
 * COPY are provided as methods of their own. This means, the method does not
 * have to be added to the request options each time a request other than GET
 * (the default method) is made. All request methods allow you to just
 * use a string - the request path - instead of a options Object. The post
 * and put methods accept the data to send as a third parameter; Data must
 * be a string, Buffer, Array, or any JSON Object. The Content-Length header
 * is calculated and set and the default Content-Type header is added, too.
 * Adding the boolean value "true" as last flag to any request method
 * ensures that your callback gets a raw http.ClientResponse instead of the
 * wrapped response that emits JSON Objects. That JSON response emitter works
 * just like its http counterpart, emiting 'data', 'end' and 'close' (plus
 * some more events for chunk streaming and debugging deserialization
 * problems). The returned request emitter returned is "enhanced", too: you
 * can directly send JSON objects to its write and end methods (ie., all data
 * (NB: except Arrays and strings!) sent to them is serialized to JSON).
 *
 * All requests to this database are handled gracefully. In other words, the
 * callback sent to the API methods (copy, delete, get, head, post, and put)
 * will always report network or server (CouchDB) errors. And the
 * request handle emits its regular errors, such as when the database is
 * offline -- instead of throwing socket errors, as some CouchDB APIs
 * seem to do. All the error objects are guaranteed to have the default
 * name and message properties (and not, all of a sudden, the error and reason
 * properties returned by CouchDB). In addition, HTTP-based errors have a
 * code property refering to the response status code, that always is a
 * number (incl. "NaN").
 *
 * @constructor
 * @property {String} protocol schema; 'https:' or ['http:']
 * @property {String} options The default options to use for requests.
 * @property {String} default_content_type ['application/json;charset=utf-8']
 * @param {String} url_string ['http://localhost:5984/']
 */
var CouchClient = exports.CouchClient = function (url_string) {
  if (!(this instanceof CouchClient)) {
    return new CouchClient(url_string); // catch calls without 'new'
  }
  this.default_content_type = 'application/json;charset=utf-8';
  return this.setUrl(url_string);
};

/**
 * Change the client's URL, overriding all options and the protocol.
 * @function
 * @param {String} url_string
 * @type CouchClient
 */
CouchClient.prototype.setUrl = function (url_string) {
  var parsed = url.parse(url_string || ''),
      options = {};
  
  this.protocol = parsed.protocol || 'http:';
  options.host = parsed.hostname || 'localhost';
  if (parsed.port) {
    options.port = Number(parsed.port);
  } else if (parsed.host) {
    options.port = 80;
  } else {
    options.port = 5984;
  }
  options.method = 'GET';
  options.path = parsed.pathname || '/';
  options.headers = {};
  options.query = parsed.query ? querystring.parse(parsed.query) : {};
  this.options = options;
  return this.setCredentials(parsed.auth);
}

/**
 * Set the authentication credentials.
 * Clears the credentials if no parameters are used.
 * @function
 * @param {String} username 'username' or 'username:password'
 * @param {String} password; optional
 * @type CouchClient
 * @throws {TypeError} If no password is present or params not strings.
 */
CouchClient.prototype.setCredentials = function (username, password) {
  var auth;
  
  if (typeof username === 'string') {
    if (!password && username.indexOf(':') !== -1) {
      auth = username;
    } else if (typeof password === 'string') {
      auth = username + ':' + password;
    } else {
      throw new TypeError('no password');
    }
    this.options.headers['Authentication'] =
      'Basic ' + auth.toString('base64');
    this._auth_url = auth + '@';
  } else if (username) {
    throw new TypeError('username not a string');
  } else {
    this._auth_url = '';
    
    if (this.options.headers['Authentication'])
      delete(this.options.headers['Authentication']);
  }
  return this;
};

/**
 * Return the full URL for this client, including authentication details and
 * query parameters.
 * @function
 */
CouchClient.prototype.getUrl = function () {
  return this.protocol + '//' + this._auth_url + this.options.host + ':' +
         this.options.port + this.getPath() + this.getQuery();
}

/**
 * Return a request path, optionally extended by an opt_path string.
 * @function
 */
CouchClient.prototype.getPath = function (opt_path) {
  var path = this.options.path;
  
  if (opt_path) {
    if (opt_path.charAt(0) != '/' && path.charAt(path.length - 1) != '/')
      path += '/';
    path += opt_path;
  }
  
  return path;
}

/**
 * Return the query string (including the '?'), optionally replacing/adding
 * optional query object parameters.
 * @function
 */
CouchClient.prototype.getQuery = function (query_opts) {
  var query = this.options.query;
  
  if (typeof query_opts === 'object') query = merge(query, query_opts);
  query = querystring.stringify(query);
  if (query) query = '?' + query;
  
  return query;
}

/**
 * Simple string representation: "[object CouchClient <URL>]".
 * @function
 */
CouchClient.prototype.toString = function () {
  return '[object CouchClient ' + this.getUrl() + ']';
}

/**
 * Create a new CouchClient for a resource path, URL-encoding each component.
 * 
 * Examples:
 *   new_c = client.resource('database', 'doc_id_with_/_inside');
 *   new_c = client.resource(['database', '_view']);
 *   new_c = client.resource('_info');
 *   copy = client.resource();
 * 
 * @function
 * @param {String || Array} path...
 * @throws {TypeError} If not all components are strings.
 * @type CouchClient
 */
CouchClient.prototype.resource = function () {
  var args = Array.prototype.slice.call(arguments),
      p = this.getPath(),
      url;
  
  if (args.length === 1 && args[0] instanceof Array) args = args[0];
  
  for (var i = args.length; i--;) {
    if (typeof args[i] !== 'string')
      throw TypeError('component not a string');
    args[i] = encodeURIComponent(args[i]);
  }
  
  // if the base bath has not trailing slash, add an empty string to the
  // list of resources to join (args), which then will add a leading slash
  // to the appended resource path
  if (p.charAt(p.length - 1) !== '/') args.unshift('');
  
  // build the URL, merging the new resource components into it
  url = this.protocol + '//' + this._auth_url + this.options.host + ':' +
        this.options.port + p + args.join('/') + this.getQuery();
  
  return new CouchClient(url)
}

/**
 * Make a COPY request.
 * @function
 * @param {String || Object} options or path
 * @param {Function} callback -> events.EventEmitter; optional
 * @param {boolean} raw response; optional
 * @type http.ClientRequest
 */
CouchClient.prototype.copy = function (options, callback, raw) {
  return this._doRequest('COPY', options, null, callback, raw);
};

/**
 * Make a DELETE request.
 * @function
 * @param {String || Object} options or path
 * @param {Function} callback -> events.EventEmitter; optional
 * @param {boolean} raw response; optional
 * @type http.ClientRequest
 */
CouchClient.prototype.delete = function (options, callback, raw) {
  return this._doRequest('DELETE', options, null, callback, raw);
};

/**
 * Make a GET request.
 * @function
 * @param {String || Object} options or path
 * @param {Function} callback -> events.EventEmitter; optional
 * @param {boolean} raw response; optional
 * @type http.ClientRequest
 */
CouchClient.prototype.get = function (options, callback, raw) {
  return this._doRequest('GET', options, null, callback, raw);
};

/**
 * Make a HEAD request.
 * @function
 * @param {String || Object} options or path
 * @param {Function} callback -> events.EventEmitter; optional
 * @param {boolean} raw response; optional
 * @type http.ClientRequest
 */
CouchClient.prototype.head = function (options, callback, raw) {
  return this._doRequest('HEAD', options, null, callback, raw);
};

/**
 * Make a POST request.
 * @function
 * @param {String || Object} options or path
 * @param {Function} callback -> events.EventEmitter; optional
 * @param {String || Array || Object} data; usually JSON; optional
 * @param {boolean} raw response; optional
 * @type http.ClientRequest
 */
CouchClient.prototype.post = function (options, callback, data, raw) {
  if (typeof data === 'boolean') {
    raw = data;
    data = null;
  }
  return this._doRequest('POST', options, data, callback, raw);
};

/**
 * Make a PUT request.
 * @function
 * @param {String || Object} options or path
 * @param {Function} callback -> events.EventEmitter; optional
 * @param {String || Array || Object} data; usually JSON; optional
 * @param {boolean} raw response; optional
 * @type http.ClientRequest
 */
CouchClient.prototype.put = function (options, callback, data, raw) {
  if (typeof data === 'boolean') {
    raw = data;
    data = null;
  }
  return this._doRequest('PUT', options, data, callback, raw);
};

CouchClient.prototype._doRequest = function (method, opts, data, cb, raw) {
  if (typeof opts === 'string') opts = { path: opts };
  opts.method = method;
  
  if (raw === true) {
    return this.request(opts, data, cb);
  } else {
    return this.requestJson(opts, data, cb);
  }
};

/**
 * Make a request to the database, emitting JSON objects.
 * 
 * The callback will receive an EventEmitter with the following events in
 * addition or changed relative to the http.ClientResponse events:
 *   - 'data', function (err) {}
 *     The entire response, deserialized, but only once.
 *   - 'chunk', function (json) {}
 *     Each time a chunk of received data can be deserialized (rows, etc.).
 *   - 'body', function (body) {}
 *     The body, as string, once, and only if the body is invalid JSON.
 *
 * @function
 * @param {String || Object} options or path
 * @param {String || Array || Object} data; optional, usually some JSON
 * @param {Function} callback -> events.EventEmitter; optional
 * @type http.ClientRequest
 */
CouchClient.prototype.requestJson = function (options, data, callback) {
  return this.request(options, data, function (response) {
    var body = [],
        emitter = new (events.EventEmitter),
        error;
    
    response.setEncoding('utf8');
    callback(emitter);
    
    response.on('data', function (chunk) {
      chunk && body.push(chunk);
      // TODO: make this really work
      try {
        emitter.emit('chunk', JSON.parse(chunk));
      } catch (e) {} // just don't emit
    });
    
    response.on('end', function () {
      body = body.join('');
      
      if (response.statusCode < 400) {
        try {
          emitter.emit('data', JSON.parse(body));
          emitter.emit('end');
        } catch (err) {
          emitter.emit('body', body);
          emitter.emit('close', err);
        }
      } else {
        error = makeError(response.statusCode, body);
        emitter.emit('close', error);
      }
    });
    
    response.on('close', function (err) {
      emitter.emit('close', err);
    });
  });
};

/**
 * Make a request to the database.
 *
 * NB: options can have an additional "query" property object with
 * query parameters that will be appended to the path and the returned
 * request can also write() JSON Objects, not just Strings and Buffers. 
 *
 * @param {String || Object} options or path
 * @param {String || Array || Object} data; optional, usually some JSON
 * @param {Function} callback -> http.ClientResponse; optional
 * @type http.ClientRequest
 */
CouchClient.prototype.request = function (options, data, callback) {
  var handle = (this.protocol === 'https:') ? https : http,
      request;
  
  if (typeof options === 'string') {
    options = {path: options};
  } else if (typeof options !== 'object') {
    options = {};
  }
  
  // options
  options.host = options.host || this.options.host;
  options.port = options.port || this.options.port;
  options.method = options.method || this.options.method;
  options.path = this.getPath(options.path);
  options.path += this.getQuery(options.query);
  options.headers = merge(this.options.headers, options.headers || {});
  
  if (options.method === 'POST' || options.method === 'PUT') {
    // add the Content-Type header in any case - data might be streamed later
    if (typeof options.headers['Content-Type'] === 'undefined')
      options.headers['Content-Type'] = this.default_content_type;
    
    // PUT/POST data (add Content-Length and serialize JSON objects)
    if (data) data = prepareData(data, options.headers);
  }
  
  // callback (must be a function) // TODO: really?
  // if (typeof callback !== 'function')
  //   callback = function () {};
  
  // TODO // wrap callback with response caching for GET requests
  // if (typeof options.method === 'undefined' || options.method === 'GET')
  //   callback = responseCacher(callback);
  
  // make request
  request = handle.request(options, callback);
  
  // PUT/POST data (write it)
  if (data && (options.method === 'POST' || options.method === 'PUT'))
    request.write(data);
  
  return patchRequest(request);
};

// REQUEST FUNCTIONS
exports.__test = {};

function defineError(statusCode) {
  var error = { code: Number(statusCode) };
  
  switch (statusCode) {
    case 400: error.name = 'BadRequest'; break;
    case 401: error.name = 'Unauthorized'; break; // login/auth required
    case 403: error.name = 'Forbidden'; break;
    case 404: error.name = 'NotFound'; break;
    case 406: error.name = 'NotAcceptable'; break; // bad content-type???
    case 409: error.name = 'Conflict'; break; // document revision conflict
    case 412: error.name = 'PreconditionFailed'; break; // ETag invalid or
                                                        // headers mismatch
    case 415: error.name = 'BadContentType'; break; // umm, check 406, too...
    case 416: error.name = 'RangeNotSatisfiable'; break; // request header
                                                         // range can't be 
                                                         // serverd
    case 417: error.name = 'ExpectationFailed'; break; // bulk upload failed
    case 500: error.name = 'ServerError'; break; // usually, invalid JSON
    default:  error.name = 'HttpError';
  }
  
  return error;
}
exports.__test.defineError = defineError;

function makeError(code, body) {
  var error = defineError(code),
      json;
  
  try {
    json = JSON.parse(body);
  } catch (err) {
    error.message = body;
  }
  
  if (json && json.error) {
    error.message = json.error.replace('_', ' ') + ': ' + (
      json.reason ? json.reason.replace('_', ' ') : 'no reason'
    );
  } else if (!error.message) {
    error.message = body;
  }
  
  return error;
}
exports.__test.makeError = makeError;

function merge(obj, into) {
  for (var opt in obj) if (obj.hasOwnProperty(opt)) {
    if (typeof into[opt] === 'undefined') {
      into[opt] = obj[opt];
    }
  }
  
  return into;
}
exports.__test.merge = merge;

function patchRequest(req) {
  var super_write = req.write.bind(req),
      super_end = req.end.bind(req);
  
  req.write = function (data, encoding) {
    if (isJSONObject(data)) data = JSON.stringify(data);
    return super_write(data, encoding || 'utf8');
  }
  
  req.end = function (data, encoding) {
    if (isJSONObject(data)) data = JSON.stringify(data);
    return super_end(data, encoding || 'utf8');
  }
  
  return req;
}
exports.__test.patchRequest = patchRequest;

function isJSONObject(data) {
  return (typeof data === 'object') && !(
    Array.isArray(data) || Buffer.isBuffer(data)
  );
}

function prepareData(data, headers) {
  var len = 0;
  
  if (typeof data === 'string') {
    len = Buffer.byteLength(data);
  } else if (Array.isArray(data) || Buffer.isBuffer(data)) {
    len = data.length;
  } else {
    data = JSON.stringify(data);
    len = Buffer.byteLength(data);
  }
  
  if (typeof headers['Content-Length'] === 'undefined')
    headers['Content-Length'] = '' + len;
  
  return data;
}
exports.__test.prepareData = prepareData;

// TODO
// function responseCacher(callback) {
//   return function (response) {
//     if (response.statusCode < 400) {
//       // TODO: caching GET responses with good state,
//       // and then check for 304s
//     }
//     callback(response);
//   };
// }


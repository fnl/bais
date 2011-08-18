var events = require('events'),
    http = require('http'),
    https = require('https'),
    querystring = require('querystring'),
    url = require('url');

/**
 * Create a new client for a CouchDB.
 *
 * All requests to this database are handled gracefully, even if there is no
 * database. In other words, the callback sent to the API methods (copy,
 * delete, get, head, post, and put) will always report an error, even if the
 * database goes offline temporarily -- instead of killing the node, as some
 * CouchDB APIs seem to do. All the errors are guaranteed to have the default
 * name and message properties. In addition, HTTP-based errors have a
 * statusCode property.
 *
 * By default, all requests return JSON Objects and the responses are fully
 * parsed before calling back. However, all requests can be made "raw", using
 * true as the last argument to the API call. In that case, only HTTP
 * errors are reported, but the returned data is a http.ClientResponse.
 * This is useful to transfer non-JSON data and to avoid that chunked
 * transfers from the database block until finished. Also, when sending
 * attachments, remember to set the Content-Type header, unless the default
 * content type is applicable ('application/json' for object data and
 * 'text/plain' for string data). The request body (data) can be sent
 * chunked, too - if the data has the 'on' property (data.on), it is assumed
 * to be a Node.js Emitter with 'data' events, terminated by an 'end' event.
 * Don't forget to fetch attachments as "raw" requests, unless they are JSON
 * objects.
 *
 * @constructor
 * @property {String} protocol The schema; if not 'https:', ['http:'] is used.
 * @property {String} auth The Authentication header (Base64 encoded) [null].
 * @property {String} host The domain name ['localhost'].
 * @property {String} port The port number [5984].
 * @property {String} path The base path ['/'].
 * @param {String} couchdb The full CouchDB URL ['http://localhost:5984/'].
 */
var CouchClient = exports.CouchClient = function (couchdb) {
  if (!(this instanceof CouchClient)) {
    return new CouchClient(couchdb); // catch calls without 'new'
  }
  return this.setUrl(couchdb || '');
};

/**
 * Change the client's URL, overriding all options and the protocol.
 * @function
 * @param {String} url_string
 * @type CouchClient
 */
CouchClient.prototype.setUrl = function (url_string) {
  var parsed = url.parse(url_string),
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
  options.headers = {'Content-Type': 'application/json;charset=utf-8'};
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
 * @param {Object} options
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
 * @param {Object} options
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
 * @param {Object} options
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
 * @param {Object} options
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
 * @param {Object} options
 * @param {Function} callback -> events.EventEmitter; optional
 * @param {String || Object} data; usually JSON; optional
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
 * @param {Object} options
 * @param {Function} callback -> events.EventEmitter; optional
 * @param {String || Object} data; usually JSON; optional
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
 * The callback will receive an EventEmitter with the following events:
 *   - 'data', function (json) {}
 *     Each time a chunk of just received data can be deserialized.
 *   - 'end', function (json) {}
 *     The entire deserialized object, once (if no 'error' happens).
 *   - 'error', function (err) {}
 *     An Error if anything goes wrong, once.
 *
 * @function
 * @param {Object} options
 * @param {String || Object} data; optional, usually some JSON
 * @param {Function} callback -> events.EventEmitter; optional
 * @type http.ClientRequest
 */
CouchClient.prototype.requestJson = function (options, data, callback) {
  return this.request(options, data, function (response) {
    var body = [],
        emitter = events.EventEmitter();
        error;
    
    response.setEncoding('utf8');
    callback(emitter);
    
    response.on('data', function (chunk) {
      // TODO: is this worth it???
      chunk && body.push(chunk);
      try {
        emitter.emit('data', JSON.parse(chunk));
      } catch (e) {
        // then just don't emit
      }
    });
    
    response.on('end', function () {
      body = body.join('');
      
      if (response.statusCode < 400) {
        try {
          emitter.emit('end', JSON.parse(body));
        } catch (err) {
          emitter.emit('error', err);
        }
      } else {
        error = makeError(response.statusCode, body);
        emitter.emit('error', error);
      }
    });
    
    response.on('close', function (err) {
      emitter.emit('error', err);
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
 * @param {Object} options
 * @param {String || Object} data; optional, usually some JSON
 * @param {Function} callback -> http.ClientResponse
 * @type http.ClientRequest
 */
CouchClient.prototype.request = function (options, data, callback) {
  var handle = (this.protocol === 'https:') ? https : http,
      request;
  
  if (typeof options !== 'object') options = {};
  
  // options
  options.host = options.host || this.options.host;
  options.port = options.port || this.options.port;
  options.method = options.method || this.options.method;
  options.path = this.getPath(options.path);
  options.path += this.getQuery(options.query);
  options.headers = merge(this.options.headers, options.headers || {});
  
  // request data
  if (data)
    data = prepareData(data, options.headers);
  
  // callback
  if (typeof callback !== 'function')
    callback = function () {};
  
  // // wrap callback with response caching for GET requests
  // if (typeof options.method === 'undefined' || options.method === 'GET')
  //   callback = responseCacher(callback);
  
  // make request
  request = handle.request(options, callback);
  
  // data
  if (data)
    request.write(data);
  
  return patchWrite(request);
};

// REQUEST FUNCTIONS

function defineError(statusCode) {
  var error = { code: statusCode };
  
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

function makeError(code, body) {
  var error = defineError(code),
      json;
  
  try {
    json = JSON.parse(body);
  } catch (err) {
    error.message = body;
  }
  
  if (json && json.error) {
    error.message = json.error.replace('_', ' ') + ': ' +
                    json.reason ? json.reason.replace('_', ' ') : 'no reason';
  } else if (!error.message) {
    error.message = body;
  }
  
  return error;
}

function merge(obj, into) {
  for (var opt in obj) if (obj.hasOwnProperty(opt)) {
    if (typeof into[opt] === 'undefined') {
      into[opt] = obj[opt];
    }
  }
  
  return into;
}

function patchWrite(req) {
  var super = req.write.bind(req);
  
  req.write = function (data, encoding) {
    if (typeof data === 'object') {
      try {
        data = JSON.stringify(data);
      } catch (e) {
        req.emit('error', e);
        return -1;
      }
    }
    return super(data, encoding || 'utf-8');
  }
  
  return req;
}

function prepareData(data, headers) {
  if (typeof data === 'string') {
    if (typeof headers['Content-Length'] === 'undefined')
      headers['Content-Length'] = Buffer.byteLength(data);
  } else if (typeof data === 'object') {
    data = JSON.stringify(data);
    
    if (typeof headers['Content-Length'] === 'undefined')
      headers['Content-Length'] = Buffer.byteLength(data);
  } else {
    throw new TypeError(
      'cannot handle ' + typeof(data) + ' data'
    );
  }
  return data;
}

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


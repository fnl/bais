var querystring = require('querystring'),
    url = require('url'),
    http = require('http'),
    https = require('https');

/**
 * Create a new connection to a CouchDB.
 *
 * All requests to this database are handled gracefully, even if there is no
 * database. In other words, the callback sent to the request methods (copy,
 * del, get, head, post, and put) will always report an error, even if the
 * database goes offline temporarily instead of killing the node. All the
 * errors are guaranteed to have the default name and message properties. In
 * addition, HTTP-based errors have a statusCode property.
 *
 * By default, all requests return JSON Objects and the responses are fully
 * parsed before calling back. However, all requests can be made raw, using
 * true as the last argument to the method call. In that case, only HTTP
 * errors are reported, but the returned data is the "raw" response received
 * by the node. This is useful to transfer non-JSON data and if chunked
 * transfers from the database should not block until finished. Also, when
 * sending DB attachments, in addition to using raw=true, remember to set
 * the Content-Type header, unless the default content type is applicable
 * ('application/json;charset=utf-8'). The request body (data) can be sent
 * chunked, too - if the data has a 'on' property (data.on), it is assumed to
 * be a Node.js Emitter with 'data' events, terminated by an 'end' event.
 *
 * @class
 * @property {String} protocol The schema; if not 'https:', ['http:'] is used.
 * @property {String} auth The Authentication header (Base64 encoded) [null].
 * @property {String} host The domain name ['localhost'].
 * @property {String} port The port number [5984].
 * @property {String} path The base path ['/'].
 * @param {String} couchdb The full CouchDB URL ['http://localhost:5984/'].
 */
var Connection = exports.Connection = function (couchdb) {
  var couchdb_url;
  
  if (!(this instanceof Connection)) {
    return new Connection(couchdb); // catch calls without 'new'
  }
  
  couchdb_url = url.parse(couchdb);
  
  this.protocol = couchdb_url.protocol || 'http:';
  this.auth = couchdb_url.auth ?
    'Basic ' + couchdb_url.auth.toString('base64') : null;
  this._auth = couchdb_url.auth ? couchdb_url.auth + '@' : '';
  this.host = couchdb_url.hostname || 'localhost';
  this.port = couchdb_url.port || '5984';
  this.path = couchdb_url.pathname;
  
  if (this.path.charAt(0) !== '/') {
    this.path = '/' + this.path;
  }
  
  console.log(
    'Couch URL: %s//%s:%s%s (Basic auth: %s)',
    couchdb_url.protocol === 'https:' ? 'https:' : 'http:',
    this.host, this.port, this.path, this.auth ? 'yes' : 'no'
  );
};

/**
 * Return a string representation of this class.
 * @function
 */
Connection.prototype.toString = function () {
  return '[Connection ' + this.protocol + '//' + this.host + ':' +
         this.port + this.path + (this.auth?' +':' -') + 'auth]';
}

/**
 * Return the full URL for this connection, including authentication details.
 * @function
 */
Connection.prototype.url = function () {
  return this.protocol + '//' + this._auth + this.host + ':' +
         this.port + this.path;
}

/**
 * Create a new Connection resource for a path, URL-encoding each component.
 * 
 * Examples:
 *   new_conn = conn.resource('database', 'doc_id_with_/_inside');
 *   new_conn = conn.resource(['database', '_view']);
 *   new_conn = conn.resource('_info');
 * @function
 * @param {Array} path A list of one or more path components, each as string.
 * @throws {Error} If not all path components are strings.
 */
Connection.prototype.resource = function () {
  var name, args = Array.prototype.slice.call(arguments);
  
  if (args.length === 1) {
    if (Array.isArray(args[0])) {
      args = args[0]
    }
  }
  
  for (var i = args.length; i--;) {
    if (typeof(args[i]) !== 'string') {
      throw Error('path argument not a string');
    }
    args[i] = encodeURIComponent(args[i])
  }
  return new Connection(this.url() + args.join('/'))
}

/**
 * Make a COPY request.
 * @function
 * @param {String} path The request path.
 * @param {Object} options Request query parameters; optional.
 * @param {Object} headers Request headers; optional, requires options to be
 *                         set (at least as an empty Object).
 * @param {Function} callback Callback that accepts (error, data) arguments;
 *                            optional (ie., the outcome will be ignored).
 * @param {boolean} raw If true, the callback data will be the raw response
 *                      object, otherwise a JSON Object; optional, defaults
 *                      to false.
 * @throws {Error} If too many arguments are used.
 */
Connection.prototype.copy = function () {
  var args = Array.prototype.slice.call(arguments);
  this._doRequest.apply(this, ['COPY'].concat(args));
};

/**
 * Make a DELETE request.
 * @function
 * @param {String} path The request path.
 * @param {Object} options Request query parameters; optional.
 * @param {Object} headers Request headers; optional, requires options to be
 *                         set (at least as an empty Object).
 * @param {Function} callback Callback that accepts (error, data) arguments;
 *                            optional (ie., the outcome will be ignored).
 * @param {boolean} raw If true, the callback data will be the raw response
 *                      object, otherwise a JSON Object; optional, defaults
 *                      to false.
 * @throws {Error} If too many arguments are used.
 */
Connection.prototype.del = function () {
  var args = Array.prototype.slice.call(arguments);
  this._doRequest.apply(this, ['DELETE'].concat(args));
};

/**
 * Make a GET request.
 * @function
 * @param {String} path The request path.
 * @param {Object} options Request query parameters; optional.
 * @param {Object} headers Request headers; optional, requires options to be
 *                         set (at least as an empty Object).
 * @param {Function} callback Callback that accepts (error, data) arguments;
 *                            optional (ie., the outcome will be ignored).
 * @param {boolean} raw If true, the callback data will be the raw response
 *                      object, otherwise a JSON Object; optional, defaults
 *                      to false.
 * @throws {Error} If too many arguments are used.
 */
Connection.prototype.get = function () {
  var args = Array.prototype.slice.call(arguments);
  this._doRequest.apply(this, ['GET'].concat(args));
};

/**
 * Make a HEAD request.
 * @function
 * @param {String} path The request path.
 * @param {Object} options Request query parameters; optional.
 * @param {Object} headers Request headers; optional, requires options to be
 *                         set (at least as an empty Object).
 * @param {Function} callback Callback that accepts (error, data) arguments
 *                            where data is always the raw response;
 *                            optional (ie., the outcome will be ignored).
 * @throws {Error} If too many arguments are used.
 */
Connection.prototype.head = function () {
  var args = Array.prototype.slice.call(arguments);
  this._doRequest.apply(this, ['HEAD'].concat(args));
};

/**
 * Make a POST request.
 * @function
 * @param {String} path The request path.
 * @param {Object} options Request query parameters; optional.
 * @param {String} data Request body - can be a data Emmiter instead of a
 *                      string; optional, requires options to be set.
 * @param {Object} headers Request headers; optional, requires data to be set.
 * @param {Function} callback Callback that accepts (error, data) arguments;
 *                            optional (ie., the outcome will be ignored).
 * @param {boolean} raw If true, the callback data will be the raw response
 *                      object, otherwise a JSON Object; optional, defaults
 *                      to false.
 * @throws {Error} If too many arguments are used.
 */
Connection.prototype.post = function () {
  var args = Array.prototype.slice.call(arguments);
  this._doRequest.apply(this, ['POST'].concat(args));
};

/**
 * Make a PUT request.
 * @function
 * @param {String} path The request path.
 * @param {Object} options Request query parameters; optional.
 * @param {String} data Request body - can be a data Emmiter instead of a
 *                      string; optional, requires options to be set.
 * @param {Object} headers Request headers; optional, requires data to be set.
 * @param {Function} callback Callback that accepts (error, data) arguments;
 *                            optional (ie., the outcome will be ignored).
 * @param {boolean} raw If true, the callback data will be the raw response
 *                      object, otherwise a JSON Object; optional, defaults
 *                      to false.
 * @throws {Error} If too many arguments are used.
 */
Connection.prototype.put = function () {
  var args = Array.prototype.slice.call(arguments);
  this._doRequest.apply(this, ['PUT'].concat(args));
};

Connection.prototype._doRequest = function (method, selector) {
   /* OPTARGS: [[options, data, headers,] callback,] raw */
  var options, data, headers, callback, raw,
      args = Array.prototype.slice.call(arguments, 2);
  
  if (selector.charAt(0) === '/' &&
      this.path.charAt(this.path.length - 1) === '/') {
    selector = selector.slice(1); // remove double slashes
  }
  
  raw = args.pop();
  callback = args.pop();
  
  if (typeof(raw) === 'boolean') {
    // last argument is raw
    if (typeof(callback) !== 'function') {
      // but second last argument is not the callback
      if (callback !== undefined) {
        // other argument, put it back
        args.push(callback);
      }
      callback = function () {};
    }
    // otherwise, second last argument is callback - do nothing
  } else if (typeof(raw) === 'function') {
    // no raw argument, but last argument is callback
    if (callback !== undefined) {
      // other arguments, put them back
      args.push(callback);
    }
    callback = raw;
    raw = false;
  } else {
    // no raw or callback arguments
    if (callback !== undefined) {
      // other argument, put it back
      args.push(callback);
    }
    if (raw !== undefined) {
      // other argument, put it back
      args.push(raw);
    }
    raw = false;
    callback = function () {};
  }
  
  if (!raw && method === 'HEAD') {
    raw = true; // HEAD requests always return raw data
  }
  
  options = args.unshift() || null; // first optarg: request options
  if (method === 'POST' || method === 'PUT') { 
    data = args.unshift() || null; // second optarg: data - only POST and PUT
  } else {
    data = null;
  }
  headers = args.unshift() || {}; // last optarg: headers
  
  if (args.length) {
    throw Error('too many arguments');
  }
  
  if (raw === true) {
    this._requestRaw(method, selector, options, data, headers, callback);
  } else {
    this._requestJson(method, selector, options, data, headers, callback);
  }
};

Connection.prototype._requestJson = function (
  method, selector, options, data, headers, callback
) {
  this._requestRaw(method, selector, options, data, headers,
                   function (error, response) {
    var body = [],
        json;
    
    if (response && response.on) {
      response.on('data', function (chunk) {
        chunk && body.push(chunk);
      });
    
      response.on('end', function () {
        try {
          json = JSON.parse(body.join(''));
        } catch (e) {
          error = e;
          json = body;
        }
      
        if (json.error) {
          if (error === null) {
            error = { name: 'CouchDBError' }
          }
          error.message = json.error.replace('_', ' ') + ': ' + json.reason;
        }
      
        callback(error, json);
      });
    } else {
      callback(error);
    }
  });
};

Connection.prototype._requestRaw = function (
  method, selector, options, data, headers, callback
) {
  var handle = (this.protocol === 'https:') ? https : http,
      request;
  
  // headers
  if (this.auth && !headers['Authorization']) {
    headers['Authorization'] = this.auth;
  }
  if (data) {
    if (!headers['Content-Type']) {
      headers['Content-Type'] = 'application/json;charset=utf-8'
    }
    
    if (data.on) {
      headers['Transfer-Encoding'] = 'chunked';
    } else {
      data = JSON.stringify(data, function (k, val) {
        if (typeof(val) === 'function') {
          return val.toString();
        } else {
          return val;
        }
      });
      headers['Content-Length'] = Buffer.byteLength(data);
    }
  }
  
  // query options/parameters
  if (options) {
    for (var k in options) {
      if (typeof(options[k]) === 'boolean') {
        options[k] = String(options[k]);
      }
    }
    options = querystring.stringify(options);
    
    if (options) {
      selector += '?' + options;
    }
  }
  
  console.log(
    'Couch %s: %s//%s:%s%s%s', method, this.protocol, this.host, this.port,
    this.path, selector
  );
  
  // request
  request = handle.request({
    host: this.host,
    port: this.port,
    path: this.path + selector,
    method: method,
    headers: headers,
  },
  // response
  function (response) {
    var error = null;
    
    if (response.statusCode >= 400) {
      error = defineError(response.statusCode);
    } else if (method === 'GET' || method === 'HEAD') {
      console.log('TODO: this request could have been cached');
    }
    
    callback(error, response);
  });
  
  // error
  request.on('error', function (error) {
    callback(error);
  });
  
  // data
  if (data) {
    if (data.on) {
      data.on('data', function (chunk) { request.write(chunk) });
      data.on('end', function () { request.end() });
    } else {
      request.write(data, 'utf8');
      request.end();
    }
  } else {
    request.end();
  }
};

function defineError(statusCode) {
  error = { message: 'see response body for details',
            statusCode: statusCode };
  
  switch (statusCode) {
    case 500:
      error.name = 'ServerError';
      break;
    case 404:
      error.name = 'NotFound';
      break;
    case 412: // ETag no longer valid
      error.name = 'PreconditionFailed';
      break;
    case 409: // document revision conflict
      error.name = 'Conflict';
      break;
    case 401: // login/auth required
      error.name = 'Unauthorized';
      break;
    default:
      error.name = 'HttpError';
  }
  
  return error;
}


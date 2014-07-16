var mysql = require('mysql'),
    util = require('util'),
    Q = require('q');

exports = module.exports = function MysqlAgent(options, extra, hashKey) {
    this._hashKey = hashKey;
    var conf = this._conf = util._extend({}, this._conf);

    for (var keys = Object.keys(conf), n = keys.length; n--;) {
        var key = keys[n];
        if (extra.hasOwnProperty(key)) {
            conf[key] = extra[key];
        }
    }


    var conns = [], allowedAgents = conf.maxAgents, pending = [], keepAliveTimer = null;
    this._context = {
        getConnection: function (cb) {
            if (conns.length) {
                if (conns.length === 1) {
                    clearTimeout(keepAliveTimer);
                    keepAliveTimer = null;
                }
                return cb(null, conns.pop());
            }
            pending.push(cb);
            if (allowedAgents) {
                allowedAgents--;
                connect(conf.maxRetries);
            }
        }, releaseConnection: release
    };

    // 申请新的连接
    function connect(retries) {
        var conn = mysql.createConnection(options);
        conn.connect(function (err) {
//            console.log('connecting', options, err, retries);
            if (err) {
                if (typeof err.code !== 'number' && retries > 0) {
                    setTimeout(connect, conf.retryTimeout, retries - 1);
                } else { // report error to all pending responses
                    pending.forEach(function (cb) {
                        cb(err);
                    });
                    pending.length = 0;
                }
            } else {
                conn.expires = Date.now() + conf.keepAliveMaxLife;
                release(conn);
            }
        });
    }

    function release(conn) {
        var t = Date.now();
        if (t > conn.expires) { // connection expired
            end(conn);
        }
        if (pending.length) {
            pending.pop()(null, conn);
        } else {
            conns.push(conn);
            if (conns.length === 1) {
                keepAliveTimer = setTimeout(keepAliveTimeout, conf.keepAliveTimeout);
            } else {
                conn.keepAliveExpires = t + conf.keepAliveTimeout;
            }
        }
    }

    function end(conn) {
        allowedAgents++;
        conn.end(nop);
    }

    function keepAliveTimeout() {
        var conn = conns.shift();
        end(conn);
        keepAliveTimer = conns.length ? setTimeout(keepAliveTimeout, conns[0].keepAliveExpires - Date.now()) : null;
    }

    function nop() {
    }
};

exports.prototype = {
    _conf: {
        maxAgents: 30,
        keepAliveTimeout: 5000,
        keepAliveMaxLife: 30000,
        retryTimeout: 400,
        maxRetries: 3
    },
    _context: null,
    constructor: exports,
    query: function (sql, val, cb) {
        if (typeof val === 'function') {
            cb = val;
            val = null;
        }

        var ctx = this._context;

        var oldErr = new Error();

        return promiseCallback(Q.Promise(function (resolve, reject) {
            ctx.getConnection(function (err, conn) {
                if (err) {
                    return reject(makeError(err, oldErr));
                }
                conn.query(sql, val, function (err, ret) {
                    if (err) {
                        reject(makeError(err, oldErr));
                    } else {
                        resolve(ret);
                    }
                });
            });
        }), cb);
    },
    prepareStatement: function (sql, options) {
        options = Object(options);
        options.__proto__ = {useCache: true, cacheTime: 0, serializer: Function.call.bind(Array.prototype.join)};

        if (options.useCache) {
            return {
                query: pendingStatement(this, sql, options.serializer, options.cacheTime)
            };
        } else {
            return {
                query: statement(this, sql)
            };
        }
    }
};

function statement(agent, sql) {
    return function (val, cb) {
        if (typeof val === 'function') {
            cb = val;
            val = null;
        }
        return promiseCallback(agent.query(sql, val), cb);
    }
}

function pendingStatement(agent, sql, serialize, delay) {
    var pending = {};
    return delay ? function (val, cb, noCache) {
        if (typeof val === 'function') { // cb, [noCache]
            noCache = cb;
            cb = val;
            val = null;
        } else if (typeof val !== 'object') { // noCache
            noCache = val;
            val = cb = null;
        } else if (typeof cb !== 'function') { // val, [noCache]
            noCache = cb;
            cb = null;
        }

        var key = val ? serialize(val) : '';

        var ret = pending[key];
        if (ret) {
            if (!ret.expires) { // request not completed yet
                return ret;
            } else if (!noCache) { // use cache
                if (ret.expires < Date.now()) { // expired
                    cleanup();
                } else {
                    return ret;
                }
            }
        }
        // not requested or request not completed or cache expired or nocache

        ret = pending[key] = agent.query(sql, val);
        ret.expires = 0;
        ret.finally(function () {
            ret.expires = Date.now() + delay;
        });
        return promiseCallback(ret, cb);
    } : function (val, cb) {
        if (typeof val === 'function') {
            cb = val;
            val = null;
        }
        var key = val ? serialize(val) : '';

        var ret = pending[key];
        if (ret) {
            return ret;
        }
        // not requested or request not completed or cache expired or nocache

        ret = pending[key] = agent.query(sql, val);
        ret.finally(function () {
            pending[key] = null;
        });
        return promiseCallback(ret, cb);
    };

    function cleanup() {
        var newPending = {}, t = Date.now();
        Object.keys(pending).forEach(function (key) {
            var p = pending[key];
            if (!p.expires || p.expires > t) {
                newPending[key] = p;
            }
        });
        pending = newPending;
    }
}

function promiseCallback(promise, cb) {
    if (cb) {
        promise = promise.then(function (ret) {
            cb(null, ret)
        }, cb);
    }
    return promise;
}

function makeError(err, oldErr) {
    err = new Error(err.message);
    oldErr = oldErr.stack;
    var newStack = err.stack, idx = newStack.indexOf('\n'), idx2 = newStack.indexOf('\n', idx + 1);
    err.stack = newStack.substr(0, idx) + newStack.substr(idx2) +
        '\n========' + oldErr.substr(oldErr.indexOf('\n'));
    return err;
}
var Q = require('q');

exports = module.exports = MysqlQueryContext;

function MysqlQueryContext() {
}

MysqlQueryContext.prototype = {
    query: function (sql, val, cb) {
        if (typeof val === 'function') {
            cb = val;
            val = null;
        }

        var ctx = this._context;

        var oldErr = new Error();

        return promiseCallback(Q.Promise(function (resolve, reject) {
            var nonSlave = !/^select/i.test(sql) || /for update;?$/.test(sql);
            ctx.getConnection(function (err, conn) {
                if (err) {
                    return reject(makeError(err, oldErr));
                }
                conn.query(sql, val, function (err, ret) {
                    ctx.releaseConnection(conn);
                    if (err) {
                        reject(makeError(err, oldErr));
                    } else {
                        resolve(ret);
                    }
                });
            }, nonSlave);
        }), cb);
    },
    find: function (tableName, condition, options, cb) {
        if (typeof condition === 'function') {// tableName, cb
            cb = condition;
            condition = options = null;
        } else if (typeof options === 'function') { // tableName, condition, cb
            cb = options;
            options = null;
        }
        return this.query(buildQuery(tableName, condition, options), null, cb);
    },
    findOne: function (tableName, condition, options, cb) {
        if (typeof condition === 'function') {// tableName, cb
            cb = condition;
            condition = options = null;
        } else if (typeof options === 'function') { // tableName, condition, cb
            cb = options;
            options = null;
        }
        if (!options) {
            options = {limit: 1};
        } else {
            options.limit = 1;
            options.progress = false;
        }
        return promiseCallback(this.query(buildQuery(tableName, condition, options), null).then(function (rows) {
            if (!rows.length) throw new Error('NOT_FOUND');
            return rows[0];
        }), cb);
    },
    _buildQuery: buildQuery
};


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

function buildQuery(tableName, condition, options) {
    var fields = options && options.fields;
    if (!fields) {
        fields = '*';
    } else if (typeof fields === 'object') {
        fields = '`' + fields.join('`,`') + '`';
    }
    var str = (options && options.distinct ? 'SELECT DISTINCT ' : 'SELECT ') +
        fields + ' FROM `' + tableName + '`';

    condition = buildCondition(condition);
    if (condition) {
        str += ' WHERE ' + condition;
    }

    if (options) {
        if (options.groupBy)
            str += ' GROUP BY `' + options.groupBy + '`';

        if (options.orderBy) {
            str += ' ORDER BY `' + options.orderBy + '`';
            if (options.desc) {
                str += ' DESC';
            }
        }
        if (options.limit)
            str += ' LIMIT ' + (options.limit | 0);
    }
    return str;

}

var ops = {
    '$gt': '>',
    '$lt': '<',
    '$gte': '>=',
    '$lte': '<=',
    '$ne': '!=',
    '$like': ' LIKE ',
    '$nlike': ' NOT LIKE ',
    '$regex': ' REGEXP ',
    '$nregex': ' NOT REGEXP '
};

function buildCondition(condition) {
    if (!condition || typeof condition !== 'object') return condition;
    var keys = Object.keys(condition);
    if (!keys.length) return;
    return join(keys.map(function (key) {
        var rule = condition[key];
        if (key === '$or') {
            // assert(rule instanceof Array)
            return join(rule.map(buildCondition), 'OR');
        }
        var ret = '`' + key + '`';
        if (rule === null) {
            ret += ' IS NULL';
        } else if (typeof rule === 'object') {
            ret = join(Object.keys(rule).map(function (op) {
                var tmp = ops[op];
                if (tmp) {
                    return ret + tmp + addslashes(rule[op]);
                }
                if (op === '$in' || op === '$nin') {
                    var val = rule[op];
                    if (!val || typeof  val !== 'object') {
                        return '0';
                    } else if (typeof val === 'object') {
                        return ret + (op === '$in' ? ' IN (' : ' NOT IN (') +
                            (val instanceof Array ? rule[op].map(addslashes).join(',') : buildQuery(val.tableName, val.condition, val)) + ')';
                    }
                } else {
                    return '1';
                }
                switch (op) {
                    case 'in':
                        return ret + ' IN (' + rule[op].map(addslashes).join(',') + ')';
                    case 'nin':
                        return ret + ' NOT IN (' + rule[op].map(addslashes).join(',') + ')';
                    default:
                        return '1';
                }
            }), 'AND');
        } else {
            ret += '=' + addslashes(rule);
        }
        return ret;
    }), 'AND');

    function join(arr, joint) {
        return arr.length === 0 ? '1' : arr.length === 1 ? arr[0] : '(' + arr.join(') ' + joint + ' (') + ')';
    }

    function addslashes(val) {
        return typeof val === 'number' ? val : '\'' + String(val).replace(/'/g, '\\\'') + '\'';
    }
}
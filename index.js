var DEFAULT_HOST = '127.0.0.1', DEFAULT_PORT = 3306;

var agents = {}, MysqlAgent = require('./src/MysqlAgent');
exports.db = function (options) {
    var hashKey;
    if (typeof options === 'string') {
        options = parseUrl(options);
    }
    hashKey = (options.socketPath ||
        (options.host || DEFAULT_HOST) + ':' + ( options.port || DEFAULT_PORT) )
        + '+' + options.user + ':' + options.password + '+' + options.database;
    var arr = options.clusters;
    if (arr && !arr.length) {
        arr = null;
        delete options.clusters;
    }
    if (arr) {
        if (typeof arr === 'string') {
            arr = options.clusters = arr.split('|');
        }
        arr.forEach(function (item, i, arr) {
            if (typeof item === 'string') {
                arr[i] = parseUrl('mysql://' + item);
            }
        });
    }
    return agents[hashKey] || (agents[hashKey] = new MysqlAgent(options, hashKey));
};
var URL = require('url');
function parseUrl(str) {
    var url = URL.parse(str, true), ret = url.query || {}, tmp;
    if (tmp = url.hostname) {
        ret.host = tmp;
    }
    if (tmp = url.port) {
        ret.port = tmp;
    }
    if (tmp = url.auth) {
        var idx = tmp.indexOf(':');
        if (idx + 1) {
            ret.user = tmp.substr(0, idx);
            ret.password = tmp.substr(idx + 1);
        } else {
            ret.user = tmp;
        }
    }
    if (tmp = url.pathname&& url.pathname.substr(1)) {
        ret.database = tmp;
    }
    return ret;
}
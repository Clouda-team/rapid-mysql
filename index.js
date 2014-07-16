var DEFAULT_HOST = '127.0.0.1', DEFAULT_PORT = 3306;

var agents = {}, MysqlAgent = require('./src/MysqlAgent');
exports.getAgent = function (options) {
    var hashKey, extra;
    if (typeof options === 'string') {
        var url = require('url').parse(options, true);
        hashKey = (url.hostname || DEFAULT_HOST) + ':' + (url.port || DEFAULT_PORT)
            + '+' + url.auth + '+' + url.pathname.substr(1);
        extra = url.query;
    } else {
        hashKey = (options.socketPath ||
            (options.host || DEFAULT_HOST) + ':' + ( options.port || DEFAULT_PORT) )
            + '+' + options.user + ':' + options.password + '+' + options.database;
        extra = options;
    }
    return agents[hashKey] || (agents[hashKey] = new MysqlAgent(options, extra, hashKey));
};
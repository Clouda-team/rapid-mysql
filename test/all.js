var assert = require('assert');
var db, mysql = require('../');

describe('main', function () {

    it('get agent', function (next) {
        db = mysql.getAgent('mysql://root:root@localhost:3306/test');
        db.query('select 1+1 as result', function (err, rows) {
            assert.ifError(err);
            assert(rows[0].result == 2);
            next();
        }).done();
    });

    it('promise error', function (next) {
        db.query('select dont.exist from dont').then(function (result) {
            throw 'should not been resolved';
        }, function (err) {
            assert(Boolean(err));
            next();
        }).done();
    });
});


describe('statement', function () {
    it('using cache', function (next) {
        var stmt = db.prepareStatement('SELECT ?+? as result');
        var obj = stmt.query([1, 2]);
        var obj2 = stmt.query(["1", "2"]);
        assert.strictEqual(obj, obj2);
        obj.then(function () {
            process.nextTick(function () {
                var obj3 = stmt.query([1, 2]);
                assert.notStrictEqual(obj, obj3);
                next();
            });
        }).done();
    });

    it('using cache and cacheTime', function (next) {
        var stmt = db.prepareStatement('SELECT ?+? as result', {cacheTime: 3000});
        var obj = stmt.query([1, 2]);
        obj.then(function () {
            setTimeout(function () {
                var obj3 = stmt.query([1, 2]);
                assert.strictEqual(obj, obj3);
                next();
            }, 100);
        }).done();
    });

    it('with noCache', function (next) {
        var stmt = db.prepareStatement('SELECT 1 as result', {cacheTime: 3000});
        var obj = stmt.query();
        var obj2 = stmt.query(true);
        assert.strictEqual(obj, obj2);
        obj.then(function () {
            process.nextTick(function () {
                var obj3 = stmt.query(true);
                assert.notStrictEqual(obj, obj3);
                next();
            });
        }).done();
    });
});
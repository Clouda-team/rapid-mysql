var assert = require('assert');
var db, mysql = require('../');

describe('main', function () {

    it('get agent', function (next) {
        db = mysql.instance({
            user: 'root',
            password: 'root',
            resource: 'test'
        });
        db.query('select 1+1 as result', function (err, rows) {
            assert.ifError(err);
            assert(rows[0].result == 2);
            next();
        }).done();
    });

    this.timeout(3000);
    it('promise error', function (next) {
        mysql.instance({
            port: 3307,
            user: 'root',
            password: 'root',
            resource: 'test',
            retryTimeout: 10,
            connectTimeout: 500
        }).query('select 1').then(function (result) {
            throw 'should not been resolved';
        }, function (err) {
            assert(err);
            next();
        }).done();
    });

    it('promise error', function (next) {
        db.query('select dont.exist from dont').then(function (result) {
            throw 'should not been resolved';
        }, function (err) {
            assert(err);
            next();
        }).done();
    });

    it('using clusters', function (next) {
        var db = mysql.instance({
            host: 'newhost',
            user: 'root',
            password: 'root',
            clusters: [
                {host: '127.0.0.1'},
                {host: 'localhost', slave: true}
            ]
        });
        var ctx = db._context;
        ctx.getConnection(function (err, conn) {
            assert.ifError(err);
            assert.strictEqual(conn.config.host, '127.0.0.1');
            conn.id = 'conn';
            ctx.getConnection(function (err, conn2) {// new connection
                assert.ifError(err);
                conn2.id = 'conn2';
                assert.equal(conn2.config.host, 'localhost');
                ctx.releaseConnection(conn2);
                ctx.getConnection(function (err, conn3) { // should be conn2
                    assert.ifError(err);
                    assert.strictEqual(conn3, conn2);
                    ctx.releaseConnection(conn);
                    ctx.releaseConnection(conn2);

                    ctx.getConnection(function (err, conn4) { // should be conn
                        assert.ifError(err);
                        assert.strictEqual(conn4, conn);
                        next();
                    }, true);
                });
            });
        });
    });
    it('cluster retries', function (next) {
        var db = mysql.instance({
            hostname: 'somehost',
            port: 3307,
            user: 'root',
            password: 'root',
            clusters: [ '127.0.0.10', '127.0.0.11', {host: '127.0.0.1', port: 3306}],
            maxRetries: 11,
            retryTimeout: 1000,
            connectTimeout: 100
        });
        db.query('SELECT 1+1 result').then(function (result) {
            assert.strictEqual(result[0].result, 2);
            next();
        }).done();
    });
});


describe('statement', function () {
    it('no cache', function (next) {
        db.prepare('SELECT ?+? as result', {useCache: false})([1, 2]).then(function (ret) {
            assert(ret[0].result === 3);
            return db.prepare('SELECT 5 as result', {useCache: false})(function (err, ret) {
                assert.ifError(err);
                assert(ret[0].result === 5);
                next();
            });
        }).done();
    });
    it('using cache', function (next) {
        var stmt = db.prepare('SELECT ?+? as result');
        var obj = stmt([1, 2]);
        var obj2 = stmt(["1", "2"]);
        assert.strictEqual(obj, obj2);
        obj.then(function () {
            process.nextTick(function () {
                var obj3 = stmt([1, 2]);
                assert.notStrictEqual(obj, obj3);
                next();
            });
        }).done();
    });

    it('using cache and cacheTime', function (next) {
        var stmt = db.prepare('SELECT ?+? as result', {cacheTime: 3000});
        var obj = stmt([1, 2]);
        obj.then(function () {
            setTimeout(function () {
                var obj3 = stmt([1, 2]);
                assert.strictEqual(obj, obj3);
                next();
            }, 100);
        }).done();
    });

    it('with noCache', function (next) {
        var stmt = db.prepare('SELECT 1 as result', {cacheTime: 3000});
        var obj = stmt();
        var obj2 = stmt(true);
        assert.strictEqual(obj, obj2);
        obj.then(function () {
            process.nextTick(function () {
                var obj3 = stmt(true);
                assert.notStrictEqual(obj, obj3);
                next();
            });
        }).done();
    });
});


describe('transaction', function () {
    it('begin', function (next) {
        db.begin().then(function (trans) {
            return trans.query('CREATE table if not exists test(id int unsigned primary key auto_increment,name varchar(32),gid int unsigned)').then(function () {
                return trans.commit();
            });
        }).then(function () {
            next();
        }).done();
    });

    it('rollback', function (next) {
        db.begin().then(function (trans) {
            return trans.query('INSERT into test(id) values(12345)').then(function () {
                return trans.query('SELECT id from test where id=12345');
            }).then(function (ret) {
                assert.strictEqual(ret[0].id, 12345);
                return trans.rollback();
            });
        }).then(function () {
            db.query('SELECT count(id) count from test where id=12345').then(function (ret) {
                assert.strictEqual(ret[0].count, 0);
                next();
            });
        }).done();
    });

});

describe('query builder', function () {
    it('options', function (next) {
        assert.strictEqual('SELECT * FROM `test`', db._buildQuery('test'));
        assert.strictEqual('SELECT id,name FROM `test`', db._buildQuery('test', null, {fields: 'id,name'}));
        assert.strictEqual('SELECT DISTINCT * FROM `test`', db._buildQuery('test', null, {distinct: true}));
        assert.strictEqual('SELECT * FROM `test` ORDER BY `id`', db._buildQuery('test', null, {orderBy: 'id'}));
        assert.strictEqual('SELECT * FROM `test` ORDER BY `id`,`fid`', db._buildQuery('test', null, {orderBy: ['id', 'fid']}));
        assert.strictEqual('SELECT * FROM `test` GROUP BY `gid` ORDER BY `id` DESC LIMIT 10', db._buildQuery('test', null, {orderBy: 'id', desc: true, groupBy: 'gid', limit: 10}));
        assert.strictEqual("SELECT * FROM `test` WHERE `id`=123", db._buildQuery('test', {id: 123}, null));
        assert.strictEqual('SELECT count(id) FROM `test` WHERE `time`=UNIX_TIMESTAMP() ORDER BY rand()', db._buildQuery('test', {
            time: Object('UNIX_TIMESTAMP()')
        }, {fields: [Object('count(id)')], orderBy: Object('rand()')}));
        next();
    });

    it('$or', function (next) {
        assert.strictEqual("SELECT * FROM `test` WHERE (`id`=1) OR (`id`=2)", db._buildQuery('test', {$or: [
            {id: 1},
            {id: 2}
        ]}));
        next();
    });

    it('and', function (next) {
        assert.strictEqual("SELECT * FROM `test` WHERE (`gid`=100) AND ((`id`=1) OR (`id`=2))", db._buildQuery('test', {gid: 100, $or: [
            {id: 1},
            {id: 2}
        ]}));
        next();
    });


    it('operators', function (next) {
        assert.strictEqual("SELECT * FROM `test` WHERE (`id`>1) AND (`id`<2) AND (`id`>=3) AND (`id`<=4) AND (`id`!=5)" +
                " AND (`id` LIKE 'abc%') AND (`id` NOT LIKE 'def%') AND (`id` REGEXP '^abc') AND (`id` NOT REGEXP '^def')" +
                " AND (`id` IN (123,456)) AND (`id` NOT IN (789,345))",
            db._buildQuery('test', {id: {$gt: 1, $lt: 2, $gte: 3, $lte: 4, $ne: 5,
                $like: 'abc%',
                $nlike: 'def%',
                $regex: '^abc',
                $nregex: '^def',
                $in: [123, 456],
                $nin: [789, 345]
            }}));
        next();
    });


    it('sub query', function (next) {
        assert.strictEqual("SELECT * FROM `test` WHERE `id` IN (SELECT `id` FROM `test2`)",
            db._buildQuery('test', {id: {$in: {
                tableName: 'test2',
                fields: ['id']
            }}}));
        next();
    });
});

describe('find', function () {
    it('find', function (next) {
        db.query('INSERT ignore into test set id=321').then(function () {
            return db.find('test', {id: 321});
        }).then(function (rows) {
            assert.deepEqual(rows, [
                {id: 321, name: null, gid: null}
            ]);
            next();
        }).done();
    });

    it('findOne', function (next) {
        db.findOne('test', {id: 321}).then(function (obj) {
            assert.deepEqual(obj, {id: 321, name: null, gid: null});
            return db.findOne('test', {id: 99999});
        }).then(function (obj) {
            assert.ifError(obj);
            throw 'should not be resolved';
        }, function (err) {
            assert.strictEqual(err.message, 'NOT_FOUND');
            next();
        }).done();
    });

    it('progress', function (next) {
        var result = [];
        db.query('INSERT ignore into test set id=322').then(function () {
            return db.find('test', {id: {$in: [321, 322]}}, {progress: true});
        }).then(function () {
            assert.deepEqual(result, [
                {id: 321, name: null, gid: null},
                {id: 322, name: null, gid: null}
            ]);
            next();
        }, function (err) {
            assert.ifError(err);
        }, function (row) {
            result.push(row);
        }).done();
    });
});

describe('insert', function () {
    it('insert', function (next) {
        db.query('DELETE from test').then(function () {
            return db.insert('test', {id: 789})
        }).then(function () {
            return db.findOne('test', {id: 789});
        }).then(function (ret) {
            assert.deepEqual(ret, {id: 789, name: null, gid: null});
            next();
        }).done();
    });

    it('set ingore', function (next) {
        db.insert('test', {id: 789}, {ignore: true}).then(function (ret) {
            assert.strictEqual(ret.affectedRows, 0);
            next();
        }).done()
    });

    it('set update', function (next) {
        db.insert('test', {id: 789}, {onDuplicate: 'id=id'}).then(function (ret) {
            assert.strictEqual(ret.affectedRows, 1);
            next();
        }).done();
    });

    it('set fields', function (next) {
        db.query('DELETE from test').then(function () {
            return db.insert('test', [678], {fields: ['id']});
        }).then(function (ret) {
            assert.strictEqual(ret.affectedRows, 1);
            return db.insert('test', [
                [679],
                [680]
            ], {fields: ['id']});
        }).then(function (ret) {
            assert.strictEqual(ret.affectedRows, 2);
            return db.insert('test', {id: 677, fid: 0}, {fields: ['id']});
        }).then(function (ret) {
            assert.strictEqual(ret.affectedRows, 1);
            next();
        }).done();
    });

    it('without fields', function (next) {
        db.insert('test', [681, 'Jack', 1000]).then(function (ret) {
            assert.strictEqual(ret.affectedRows, 1);
            return db.insert('test', [
                [682, 'Tom', 1000],
                [683, 'Jerryf', Object('rand()*1000')]
            ]);
        }).then(function (ret) {
            assert.strictEqual(ret.affectedRows, 2);
            return db.insert('test', [
                {id: 684},
                {id: 685}
            ]);
        }).then(function (ret) {
            assert.strictEqual(ret.affectedRows, 2);
            return db.insert('test', [null, null, null]);
        }).then(function (ret) {
            assert.strictEqual(ret.affectedRows, 1);
            return db.insert('test', null, {fields: ['id']});
        }).then(function (ret) {
            assert.strictEqual(ret.affectedRows, 1);
            return db.insert('test', 'Tom', {fields: ['name']});
        }).then(function (ret) {
            assert.strictEqual(ret.affectedRows, 1);
            next();
        }).done();
    });

    it('subquery', function (next) {
        db.insert('test', "select 686,'Tom',1000", {
            subQuery: true
        }).then(function (ret) {
            assert.strictEqual(ret.insertId, 686);
            return db.insert('test', {
                tableName: 'test',
                where: {id: 677},
                fields: [Object('id-1'), 'name']
            }, {
                fields: ['id', 'name'],
                subQuery: true
            });
        }).then(function (ret) {
            assert.strictEqual(ret.insertId, 676);
            next();
        }).done();

    });

});


describe('update', function () {
    it('basic', function (next) {
        db.update('test', {name: 'Kyrios'}, {
            where: {id: 678}
        }).then(function (ret) {
            assert.strictEqual(ret.affectedRows, 1);
            return db.update('test', {name: 'Kyrios', gid: Object('gid+1')}, {
                where: {id: 678}
            });
        }).then(function (ret) {
            assert.strictEqual(ret.affectedRows, 1);
            return db.update('test', { gid: Object('gid+1')});
        }).then(function (ret) {
            assert(ret.affectedRows);
            next();
        }).done();
    });

    it('with fields', function (next) {
        db.update('test', 'Kyrios', {
            fields: ['name'],
            where: {id: 678}
        }).then(function (ret) {
            assert.strictEqual(ret.affectedRows, 1);
            return db.update('test', ['Kyrios', 1000], {
                fields: ['name', 'gid'], where: {id: 678}
            });
        }).then(function (ret) {
            assert.strictEqual(ret.affectedRows, 1);
            return db.update('test', ['Kyrios', Object('gid+1')], {
                fields: ['name', 'gid'], where: {id: 678}
            });
        }).then(function (ret) {
            assert.strictEqual(ret.affectedRows, 1);
            next();
        }).done();
    });

});

describe('get', function () {
    it('get by id', function (next) {
        db.get('test.678').then(function (ret) {
            assert.deepEqual(ret, {
                id: 678, name: 'Kyrios', gid: 1001
            });
            next();
        }).done();
    });

    it('get with default table name', function (next) {
        mysql.instance({user: 'root', password: 'root', resource: 'test.test'}).get(678).then(function (ret) {
            assert.deepEqual(ret, {
                id: 678, name: 'Kyrios', gid: 1001
            });
            next();
        }).done();
    });
    it('get with custom key', function (next) {
        mysql.instance({user: 'root', password: 'root', resource: 'test.test', key: 'gid'}).get(1001).then(function (ret) {
            assert.deepEqual(ret, {
                id: 678, name: 'Kyrios', gid: 1001
            });
            next();
        }).done();
    });

    it('get non-exis', function (next) {
        db.get('test.notFound').then(function (ret) {
            assert.strictEqual(ret, undefined);
            next();
        }).done();
    });
});


describe('set', function () {
    it('set by id', function (next) {
        db.set('test.678', {gid: 1002}).then(function () {
            return db.get('test.678').then(function (ret) {
                assert.strictEqual(ret.gid, 1002);
                next();
            });
        }).done();
    });
});

describe('delete', function () {
    it('delete by id', function (next) {
        db.delete('test.678', {gid: 1002}).then(function () {
            return db.get('test.678').then(function (ret) {
                assert.strictEqual(ret, undefined);
                next();
            });
        }).done();
    });
})
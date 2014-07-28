RAPID-MYSQL
===

[![NPM version](https://badge.fury.io/js/rapid-mysql.svg)](http://badge.fury.io/js/rapid-mysql)

---


> simple to use the mysql database

What is this?
---

用于rapid框架的mysql插件，对mysql库的重新封装，针对公有集群化云数据库优化了连接管理、接口复用、读写分离等。

Install
---

```sh
$ npm install rapid-mysql
```

Usage
---

```js
var db = require('rapid-mysql').db('mysql://user:password@host_or_ip:port/dbname');
db.query('SELECT * from tbl where id=?', [id], function(err, rows){...});
db.query('SELECT * from tbl').then(function(rows){...}, function(err){...});
```

Community
---

Visit [clouda+](http://cloudaplus.duapp.com/) official site for more info.

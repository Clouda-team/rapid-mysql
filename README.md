RAPID-MYSQL
===

---


> simple to use the mysql database

What is this?
---

用于rapid框架的mysql插件，对mysql库的重新封装，针对公有集群化云数据库优化了连接管理、接口复用、读写分离等。

Usage
---

```js
var db = require('rapid-mysql').getAgent('mysql://user:password@host_or_ip:port/dbname');
db.query('SELECT * from tbl where id=?', [id], function(err, rows){...});
db.query('SELECT * from tbl').then(function(rows){...}, function(err){...});
```

API
---

###Static function getAgent(url:string | options:object)

创建新的连接上下文/获取已有连接上下文。url与options格式参照 [felixge/node-mysql](https://github.com/felixge/node-mysql#establishing-connections)

我们根据hostname:port+user:password+dbname来查找已创建的MysqlAgent对象

其它选项：

  * maxAgents: 最大同时连接数（默认：30）
  * keepAliveTimeout: 连接复用的超时等待时间（单位：ms，默认：5000ms）。连接被释放后，超过该时间没有请求时则连接断开
  * keepAliveMaxLife: 连接复用的最长生命周期（单位：ms，默认：30000ms）。连接被建立后，超过该时间后不再被复用
  * retryTimeout: 连接失败的重试间隔（默认: 400ms）
  * maxRetries: 连接失败最大重试次数（默认：3）

示例代码：

```js
var db = require('rapid-mysql').getAgent('mysql://root:root@localhost/test?maxRetries=1');
```

返回：MysqlAgent对象

###function MysqlAgent::query(query:string, optional data:array, optional cb:function)

从agent中获取连接并执行查询，返回一个Promise对象。

关于Promise的使用请参考[kriskowal/q](https://github.com/kriskowal/q)

示例代码：

```js
db.query('SELECT 1+1 as result').then(function(results){...});
```

返回：Promise对象

###function MysqlAgent::prepareStatement(query:string, optional options:object)

创建一个查询语句。查询语句可以被稍后执行，并允许对请求进行合并、缓存

可选参数有：

  * useCache: 使用查询cache。相同的查询参数的查询将被合并为一次请求。（默认：true）
  * cacheTime: cache有效期。从查询完成开始计算，查询结果在有效期内将一直有效，不再发送新的请求（默认：0）
  * keyHasher: 将value进行hash的函数。默认：Array.join

注意！使用update类语句时请务必禁用cache

示例代码：

```js
var stmt = db.prepareStatement('SELECT * from user where id=?');
```

返回：MysqlStatement对象

###function MysqlStatement::query(optional data:array, optional cb:function, optional noCache:boolean)

执行Statement。如果statement启用了cache，且之前有命中的请求未到期或未完成，且noCache不为true，则返回之前缓存的结果

示例代码：

```js
stmt.query([userid]).then(function(results){...});
```

返回：Promise对象

###function MysqlAgent::addSlave(url:string | options:object)

增加从机
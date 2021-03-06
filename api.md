
API
---

-------------

static methods
---

###function instance(url:string | options:object)

创建新的连接上下文。url与options格式参照
 [felixge/node-mysql](https://github.com/felixge/node-mysql#establishing-connections)

其它选项：

  * maxConnects: 最大同时连接数（默认：30）
  * keepAliveTimeout: 连接复用的超时等待时间（单位：ms，默认：5s）。连接被释放后，超过该时间没有被使用时则连接断开
  * keepAliveMaxLife: 连接复用的最长生命周期（单位：ms，默认：30s）。连接被建立后，超过该时间后不再被复用
  * retryTimeout: 连接失败的重试间隔（默认: 400ms）
  * maxRetries: 连接失败最大重试次数（默认：3）
  * key: get/set接口中的主键名，默认为`'id'`

示例代码：

```js
var db = require('rapid-mysql').instance({
  host: 'localhost',
  port: 3306,
  user: 'root',
  password: 'root',
  resource: 'test'
});
```

注意：rapid-mysql用`resource`参数而不是`database`参数来指定数据库名。`resource`支持`dbname.tablename`格式，在get/set接口中如果未
指定`tablename`，则使用`resource`中指定的`tablename`。

返回：Agent对象

----

QueryContext
---

Agent/Transaction等类派生于QueryContext，所以它们的实例可使用query/findOne等方法。

###function query(query:string, [data:array], [cb:function])

从当前上下文获取连接并执行查询，返回一个Promise对象。

关于Promise的使用请参考
 [kriskowal/q](https://github.com/kriskowal/q)

示例代码：

```js
db.query('SELECT 1+1 as result').then(function(results){...});
```

返回：Promise对象

###function find(tableName:string, [where:object], [options:object], [cb:function])

执行一次查询，从`tableName`指定的表中找到满足`where`指定条件的行，并返回`options.fields`指定的列。

示例代码：

```js
db.find('user',{
    'id' : { $lt : 12345}
}, {
    fields: ['id','name'],
    orderBy: 'id',
    desc: true,
    groupBy: 'gid'
})
```

options接受以下字段：

  - fields: 返回的字段列表，字符串或数组
  - orderBy: 排序字段，类型为字符串或数组，默认为null
  - desc: 是否降序排序，默认为null
  - groupBy: 分组
  - distinct: 是否返回值去重，默认为false,
  - limit: 限制返回条数，默认为null：返回全部
  - progress: 是否逐条返回结果，默认为false

注意：options.progress为true时，cb将被忽略

####查询条件对象

find接受的查询条件对象为`{key: rule}`形式。一个对象的多个key，以and连接。
如: `{id:123,password:'456'}` 将被编译为 `(id=123) and (password='456')`

rule接受以下类型的数据：
  - 数字
  - 字符串
  - 查询条件表达式对象

find支持以下查询条件表达式：

  - $or: 接受一个数组，数组的每一项以or进行连接。如：`{$or:[{id:123}, {password:'456'}]}` 对应 `(id=123) or (password='456')`
  $or不能作为某个key对应的规则(如：`{id: {$or: [...]}}`是不允许的)。
  - $gt: 某个key大于某个值
  - $gte: 某个key大于等于某个值
  - $lt: 某个key小于某个值
  - $lte: 某个key小于等于某个值
  - $in: 某个key在某个集合内。集合接受数组或子查询。
  - $nin: 某个key不在某个集合内
  - $ne: 某个key不等于某个值
  - $like: 某个key符合mysql的like表达式
  - $nlike: 某个key不符合mysql的like表达式
  - $regex: 某个key符合mysql的正则表达式
  - $nregex: 某个key不符合mysql的正则表达式
  
同一个查询条件表达式可以指定多个操作符，如：`{id: {$gt:100, $lt:200}}`

子查询接受字符串(如: `SELECT id from user`)或对象类型。对象类型子查询包含`tableName`,`where`,`fields`,`orderBy`等字段。


默认地，字段名、查询条件的值中的字符串将被处理。如果不想对其进行处理
（如：`SELECT count(id) from test where time=UNIX_TIMESTAMP() order by rand()`)
可以将值转换为字符串对象（如：Object('count(id)') 或 new String('count(id)')

返回：Promise对象




###function findOne(tableName:string, [where:object], [options:object], [cb:function])

尝试获取一个值，如果找不到，则返回ERR_NOT_FOUND


示例代码：
```js
db.findOne('test',{id:1}).then(function(obj){
 // obj.id===1
});
```

返回：Promise对象




###function insert(tableName:string, values:object|array, [options:object],[cb:function]) 

执行insert语句，values为插入的值、值列表、子查询表达式，options为选项。

insert支持的选项有：

 - ignore: 当PK|UK冲突时，忽略该记录，默认为false
 - onDuplicate: 当ignore为false且PK|UK冲突时，执行update
 - fields: 插入的字段名称。确定插入字段的方式为：
   - 如果指定了fields，则以指定的fields执行`INSERT INTO tableName (fields) values (...)`
   - 如果未指定fields，且values为对象数组，则以values[0]的keys作为fields
   - 否则，如果values为对象，则执行`INSERT INTO tableName set ...`
   - 否则，执行`INSERT into tableName values (...)`，
   - 如果values为二维数组/对象数组，则执行多条插入
 - subQuery: values类型为subQuery对象,执行`INSERT INTO tableName (fields) select xxx`形式插入。默认为false
 具体的subQuery格式参考`find`

示例代码：
```js
 // INSERT into `test` set `name` = 'John'
db.insert('test', {name:'John'}).then(function(ret){
   console.log(ret.insertId);
});

 // INSERT into test(name) values ('Tom')
db.insert('test', 'Tom', {fields:'name'}};

 // INSERT into test values (null,'Jack',123)
db.insert('test', [null, 'Jack',123]};

// INSERT into test(name,gid) values('Jack',123)
db.insert('test', ['Jack',123], {fields:['name', 'gid']};

// This is equivalent to the former, and Jack.fid is ignored
db.insert('test', {name: 'Jack', gid: 123, fid: 789}, {fields:['name', 'gid']};

// INSERT into test(name,gid) values('Tom',124),('Jerry',124)
db.insert('test', [['Tom',124], ['Jerry', 124]], {fields:['name', 'gid']};

 // This is equivalent to the former, and Jerry.fid is ignored
db.insert('test', [
    {name: 'Tom', gid: 124},
    {name: 'Jerry', gid: 125, fid: 789}
]);

 // This is equivalent to the former, and Tom.fid is ignored
db.insert('test', [
    {name: 'Tom', gid: 124, fid:789},
    {name: 'Jerry', gid: 125, fid: 789}
], {fields:['name', 'gid']});

db.insert('test', {name: 'Tom', gid: Object('rand()*1000')});

```

###function update(tableName:string, values:object|array, [options:object], [cb:function])

执行update语句，其中values为更新的值，options为选项。

update支持的选项有：

  - fields: 更新的字段名称。
  - where: 查询条件
  

示例代码：
```js

db.update('test', 'Jerry', {
    fields:['name'], where: {id: 1}
});

db.update('test', {name:'Jerry', gid:1000}, {
    where: {id: 1}
});

 // This is equivalent to the former
db.update('test', ['Jerry', 1000], {
    fields:['name', 'gid'], where: {id: 1}
});

 // This is equivalent to the former, and Jerry.fid is ignored
db.update('test', {name:'Jerry', gid:1000, fid:0}, {
    fields:['name', 'gid'], where: {id: 1}
});

```

###function get(key:string): Promise

###function set(key:string, val:object): Promise

###function delete(key:string): Promise

----

Agent
---

Agent是从db获得的实例，继承于QueryContext

###function prepare(query:string, [options:object])

创建一个查询语句。查询语句可以被稍后执行，并允许对请求进行合并、缓存

可选参数有：

  * useCache: 使用查询cache。相同的查询参数的查询将被合并为一次请求。（默认：true）
  * cacheTime: cache有效期。从查询完成开始计算，查询结果在有效期内将一直有效，不再发送新的请求（默认：0）
  * keyHasher: 将value进行hash的函数。默认：Array.join

注意！使用update类语句时请务必禁用cache

示例代码：

```js
var stmt = db.prepare('SELECT * from user where id=?');
```

返回：Statement对象。



###function begin([cb:function])

使用事务。begin将申请一个非slave连接，并发送`begin`命令。当连接成功后，将一个Transaction对象传递到回调。

Transaction继承于QueryContext，所以可以在Transaction对象上使用query/findOne等方法。

示例代码：

```js
db.begin().then(function(trans){
    return trans.query('UPDATE user set score=score+1 where id=?',[12345]).then(function(){
        return trans.commit();
    });
});
```

返回：Promise对象。

----

Statement
---

Statement是Agent.prepare返回的结果，本身是一个函数，可以被调用，原型为

###function Statement([data:array], [cb:function], [noCache:boolean])

执行Statement。如果statement启用了cache，且之前有命中的请求未到期或未完成，且noCache不为true，则返回之前缓存的结果

示例代码：

```js
stmt.query([userid]).then(function(results){...});
```

返回：Promise对象


----

Transaction
---

Transaction是Agent.begin返回的结果，继承于QueryContext，所有的请求都将在一个连接上执行

###function commit([cb:function])

发送commit并结束事务

返回：Promise对象。

###function rollback([cb:function])

发送rollback并结束事务

返回：Promise对象。


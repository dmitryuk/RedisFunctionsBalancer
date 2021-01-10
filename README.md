# Redis functions balancer
[![NPM](https://nodei.co/npm/redis-functions-balancer.png)](https://nodei.co/npm/redis-functions-balancer/)

Balance executes of NodeJs-functions or anything with redis.

For example, if you have several functions (A, B, C) doing the same things (http requests, long-running code), and you want to execute it evenly.

Working in clusters (PM2, NodeJs Cluster).

Uses [Redis][0] list with rank and [Javascript iterators][1].

Ready to use with TypeScript and JavaScript.

## Installation
```
npm install redis-functions-balancer --save-prod
```

## Example of usage
```typescript
import RedisBalancer from "redis-functions-balancer";
const redis = require("redis");
const redisClient = redis.createClient(6379, 'redis');

// Your functions here
// ... //
const A = () => {};
const B = () => {};
const C = () => {};
// ... //
let balancer = new RedisBalancer([A, B, C], redisClient);
// or reuse balancer variable with another functions
balancer.setData([A, B]);
// ... //
// Get async iterator {done, value}
let iterator = await balancer.getAsyncIterator();

while ( (foo = await iterator.next()) && !foo.done) {
    // Your function A|B|C will be here evenly
    let func = foo.value;
    
    try {
        // Executing on your way (
        func();
    } catch (e) {
        // something happen badly and you want to postpone executes of the function next 10 runs
        balancer.increaseRank(func, 10);
    }
}

```

[0]: https://www.npmjs.com/package/redis
[1]: https://www.typescriptlang.org/docs/handbook/iterators-and-generators.html
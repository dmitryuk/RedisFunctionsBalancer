import RedisBalancer from "../index";
import {beforeEach} from "mocha";
import {promisify} from "util";
import assert = require("assert");

const redis = require("redis");
const redisClient = redis.createClient(6379, 'redis');

const A = () => new Promise(() => console.log('A'));
const B = () => new Promise(() => console.log('B'));
const C = () => new Promise(() => console.log('C'));

let methods = [A, B, C];
let balancer: RedisBalancer<Function>;
let zRangeAsync = promisify(redisClient.zrange).bind(redisClient);
describe('Test Callable Balancer', async function () {
    beforeEach(async () => {
        balancer = new RedisBalancer(methods, redisClient, 'example');
        await balancer.resetStore();
    });

    it('check store key generated', async () => {
        assert.strictEqual('example', balancer.getStoreKey());
        balancer.setData([C, B, A]);
        balancer.setStoreKey('example2');
        assert.strictEqual('example2', balancer.getStoreKey());
    });

    it('check iterator first run in default order', async () => {
        let iterator = balancer.getAsyncIterator();
        let foo;
        let callId = 0;
        while ((foo = await iterator.next()) && !foo.done) {
            assert.strictEqual(methods[callId], foo.value);
            callId++;
        }
    });

    it('check redis state with iterator', async () => {
        let key = balancer.getStoreKey();
        let result = await zRangeAsync(key, 0, -1);
        assert.strictEqual(0, result.length);
        let iterator = balancer.getAsyncIterator();
        result = await zRangeAsync(key, 0, -1);
        assert.strictEqual(0, result.length);

        let data = await iterator.next();
        result = await zRangeAsync(key, 0, -1);
        assert.deepStrictEqual(['1', '2', '0'], result);
        assert.strictEqual(A, data.value);

        data = await iterator.next();
        result = await zRangeAsync(key, 0, -1);
        assert.deepStrictEqual(['2', '0', '1'], result);
        assert.strictEqual(B, data.value);

        data = await iterator.next();
        result = await zRangeAsync(key, 0, -1);
        assert.deepStrictEqual(['0', '1', '2'], result);
        assert.strictEqual(C, data.value);
    });

    it('test 2 iterators', async () => {
        let iterator = await balancer.getAsyncIterator(),
            data;
        await iterator.next();
        await balancer.increaseRank(B, 2);

        iterator = await balancer.getAsyncIterator();
        data = await iterator.next();
        assert.strictEqual(C, data.value);
    });
});

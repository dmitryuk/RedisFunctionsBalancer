import CallableBalancer from "../index";
import {beforeEach} from "mocha";
import {promisify} from "util";
import assert = require("assert");

const redis = require("redis");
const redisClient = redis.createClient(6379, 'redis');

const A = () => new Promise(() => console.log('A'));
const B = () => new Promise(() => console.log('B'));
const C = () => new Promise(() => console.log('C'));

let methods = [A, B, C];
let balancer: CallableBalancer;
let zrangeAsync = promisify(redisClient.zrange).bind(redisClient);
describe('Test Callable Balancer', async function () {
    beforeEach(async () => {
        balancer = new CallableBalancer(methods, redisClient)
        await balancer.resetStore();
    });

    it('check store key generated', async () => {
        assert.strictEqual('balancer.A.B.C', balancer.getStoreKey());
        balancer.setMethods([C, B, A]);
        assert.strictEqual('balancer.C.B.A', balancer.getStoreKey());
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
        let result = await zrangeAsync(key, 0, -1);
        assert.strictEqual(0, result.length);
        let iterator = balancer.getAsyncIterator();
        result = await zrangeAsync(key, 0, -1);
        assert.strictEqual(0, result.length);

        let data = await iterator.next();
        result = await zrangeAsync(key, 0, -1);
        assert.deepStrictEqual(['B', 'C', 'A'], result);
        assert.strictEqual(A, data.value);

        data = await iterator.next();
        result = await zrangeAsync(key, 0, -1);
        assert.deepStrictEqual(['C', 'A', 'B'], result);
        assert.strictEqual(B, data.value);

        data = await iterator.next();
        result = await zrangeAsync(key, 0, -1);
        assert.deepStrictEqual(['A', 'B', 'C'], result);
        assert.strictEqual(C, data.value);
    });

    it('test 2 iterators', async () => {
        let iterator = await balancer.getAsyncIterator(),
            data;
        await iterator.next();
        await balancer.increaseMethodRank(B, 2);

        iterator = await balancer.getAsyncIterator();
        data = await iterator.next();
        assert.strictEqual(C, data.value);
    });
});

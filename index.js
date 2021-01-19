"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __await = (this && this.__await) || function (v) { return this instanceof __await ? (this.v = v, this) : new __await(v); }
var __asyncGenerator = (this && this.__asyncGenerator) || function (thisArg, _arguments, generator) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var g = generator.apply(thisArg, _arguments || []), i, q = [];
    return i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i;
    function verb(n) { if (g[n]) i[n] = function (v) { return new Promise(function (a, b) { q.push([n, v, a, b]) > 1 || resume(n, v); }); }; }
    function resume(n, v) { try { step(g[n](v)); } catch (e) { settle(q[0][3], e); } }
    function step(r) { r.value instanceof __await ? Promise.resolve(r.value.v).then(fulfill, reject) : settle(q[0][2], r); }
    function fulfill(value) { resume("next", value); }
    function reject(value) { resume("throw", value); }
    function settle(f, v) { if (f(v), q.shift(), q.length) resume(q[0][0], q[0][1]); }
};
Object.defineProperty(exports, "__esModule", { value: true });
const util_1 = require("util");
class RedisBalancer {
    /**
     *
     * @param data not empty array of functions
     * @param redisClient
     * @param redisPrefix
     */
    constructor(data, redisClient, redisPrefix) {
        this.INC_VALUE = 1;
        this.redisPrefix = redisPrefix;
        this._redisClient = redisClient;
        this._data = data;
        // Initialize Redis functions as async await
        this._functions = {
            delAsync: util_1.promisify(redisClient.DEL).bind(this._redisClient),
            zAddAsync: util_1.promisify(redisClient.ZADD).bind(this._redisClient),
            zRangeAsync: util_1.promisify(redisClient.zrange).bind(this._redisClient),
            zIncRbyAsync: util_1.promisify(redisClient.zincrby).bind(this._redisClient),
        };
    }
    setData(data) {
        this._data = data;
    }
    increaseRank(record, incValue = this.INC_VALUE) {
        return __awaiter(this, void 0, void 0, function* () {
            let key = this._data.indexOf(record);
            return this.increaseRankByIndex(key, incValue);
        });
    }
    increaseRankByIndex(index, incValue = this.INC_VALUE) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this._functions.zIncRbyAsync(this.redisPrefix, incValue, index.toString());
        });
    }
    getAsyncIterator() {
        return __asyncGenerator(this, arguments, function* getAsyncIterator_1() {
            let storedData = yield __await(this.getRange());
            // Redis store defined
            for (let storedKey of storedData) {
                for (let [key, record] of this._data.entries()) {
                    if (storedKey === key.toString()) {
                        yield __await(this.increaseRankByIndex(key, this.INC_VALUE));
                        yield yield __await(record);
                    }
                }
            }
        });
    }
    resetStore() {
        return __awaiter(this, void 0, void 0, function* () {
            yield this._functions.delAsync(this.redisPrefix);
        });
    }
    getStoreKey() {
        return this.redisPrefix;
    }
    setStoreKey(key) {
        this.redisPrefix = key;
    }
    /**
     * Returns an Array stored in Redis in Rank order
     * @private
     */
    getRange() {
        return __awaiter(this, void 0, void 0, function* () {
            let storedMethodNames = yield this._functions.zRangeAsync(this.redisPrefix, 0, -1);
            // If Redis store is not initialized yield in default order
            if (storedMethodNames.length !== this._data.length) {
                let args = [], result = [];
                this._data.forEach((record, index) => {
                    // Default rank is 1
                    args.push("1", index.toString());
                    result.push(index.toString());
                });
                yield this._functions.zAddAsync(this.redisPrefix, 'NX', ...args);
                return result;
            }
            return storedMethodNames;
        });
    }
}
exports.default = RedisBalancer;

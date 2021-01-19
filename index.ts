import {promisify} from "util";
import {RedisClient} from "redis";

type RedisFunctions = {
    delAsync: (key: string) => Promise<number>,
    zAddAsync: (key: string, mode: string, ...args: string[]) => Promise<number>,
    zRangeAsync: (key: string, begin: number, end: number) => Promise<unknown>,
    zIncRbyAsync: (key: string, incValue: number, element: string) => Promise<string>;
};

export default class RedisBalancer<T> {
    private _storeKey: string;
    private _data: Array<T>;
    private readonly _STORE_PREFIX = 'balancer';
    private readonly _redisClient: RedisClient;
    private readonly redisPrefix: string;
    private readonly INC_VALUE = 1;

    private readonly _functions: RedisFunctions;

    /**
     *
     * @param data not empty array of functions
     * @param redisClient
     * @param redisPrefix
     */
    constructor(data: Array<T>, redisClient: RedisClient, redisPrefix: string) {
        this.redisPrefix = redisPrefix;
        this._redisClient = redisClient;
        this._data = data;
        this._storeKey = this.makeStoreKey(data);

        // Initialize Redis functions as async await
        this._functions = {
            delAsync: promisify(redisClient.DEL).bind(this._redisClient),
            zAddAsync: promisify(redisClient.ZADD).bind(this._redisClient),
            zRangeAsync: promisify(redisClient.zrange).bind(this._redisClient),
            zIncRbyAsync: promisify(redisClient.zincrby).bind(this._redisClient),
        };
    }

    public setData(data: Array<T>) {
        this._data = data;
        this._storeKey = this.makeStoreKey(data);
    }

    public async increaseRank(record: T, incValue: number = this.INC_VALUE) {
        let key = this._data.indexOf(record);
        return this.increaseRankByIndex(key, incValue)
    }

    protected async increaseRankByIndex(index: number, incValue: number = this.INC_VALUE) {
        await this._functions.zIncRbyAsync(this._storeKey, incValue, index.toString());
    }

    public async* getAsyncIterator(): AsyncIterableIterator<T> {
        let storedData = await this.getRange();

        // Redis store defined
        for (let storedKey of storedData) {
            for (let [key, record] of this._data.entries()) {
                if (storedKey === key.toString())  {
                    await this.increaseRankByIndex(key, this.INC_VALUE);
                    yield record;
                }
            }
        }
    }

    public async resetStore(): Promise<void> {
        await this._functions.delAsync(this._storeKey);
    }

    public getStoreKey(): string {
        return this._storeKey;
    }

    /**
     * Return redis key to store list of data with ranks
     * @param data
     * @protected
     */
    protected makeStoreKey(data: Array<T>): string {
        let storeKeyArray: Array<string> = [this._STORE_PREFIX, this.redisPrefix];
        data.forEach((method: T, index: number) => {
            storeKeyArray.push(index.toString());
        });

        return storeKeyArray.join('.');
    }

    /**
     * Returns an Array stored in Redis in Rank order
     * @private
     */
    protected async getRange(): Promise<Array<string>> {
        let storedMethodNames = await this._functions.zRangeAsync(this._storeKey, 0, -1) as Array<string>;
        // If Redis store is not initialized yield in default order
        if (storedMethodNames.length !== this._data.length) {
            let args: Array<string> = [],
                result: Array<string> = [];

            this._data.forEach((record, index) => {
                // Default rank is 1
                args.push("1", index.toString());
                result.push(index.toString());
            });
            await this._functions.zAddAsync(this._storeKey, 'NX', ...args);

            return result;
        }

        return storedMethodNames;
    }
}

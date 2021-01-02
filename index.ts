import {promisify} from "util";
import {RedisClient} from "redis";

type RedisFunctions = {
    delAsync: (key: string) => Promise<number>,
    zAddAsync: (key: string, mode: string, ...args: string[]) => Promise<number>,
    zRangeAsync: (key: string, begin: number, end: number) => Promise<unknown>,
    zIncRbyAsync: (key: string, incValue: number, element: string) => Promise<string>;
};

export default class CallableBalancer {
    private _storeKey: string;
    private _methods: Array<Function>;
    private readonly _STORE_PREFIX = 'balancer';
    private readonly _redisClient: RedisClient;
    private readonly INC_VALUE = 1;

    private readonly _functions: RedisFunctions;

    /**
     *
     * @param methods not empty array of functions
     * @param redisClient
     */
    constructor(methods: Array<Function>, redisClient: RedisClient) {
        this._redisClient = redisClient;
        this._methods = methods;
        this._storeKey = this.makeStoreKey(methods);

        // Initialize Redis functions as async await
        this._functions = {
            delAsync: promisify(redisClient.DEL).bind(this._redisClient),
            zAddAsync: promisify(redisClient.ZADD).bind(this._redisClient),
            zRangeAsync: promisify(redisClient.zrange).bind(this._redisClient),
            zIncRbyAsync: promisify(redisClient.zincrby).bind(this._redisClient),
        };
    }

    public setMethods(methods: Array<Function>) {
        this._methods = methods;
        this._storeKey = this.makeStoreKey(methods);
    }

    public async increaseMethodRank(method: Function, incValue: number = this.INC_VALUE) {
        await this._functions.zIncRbyAsync(this._storeKey, incValue, method.name);
    }

    public async* getAsyncIterator(): AsyncIterableIterator<Function> {
        let storedMethodNames = await this.getRange();

        // Redis store defined
        for (let methodName of storedMethodNames) {
            for (let method of this._methods) {
                if (method.name === methodName) {
                    await this.increaseMethodRank(method, this.INC_VALUE);
                    yield method;
                }
            }
        }
    }

    /**
     * Clear store
     */
    public async resetStore(): Promise<void> {
        await this._functions.delAsync(this._storeKey);
    }

    public getStoreKey(): string {
        return this._storeKey;
    }

    /**
     * Return redis key to store list of methods with ranks
     * @param methods
     * @protected
     */
    protected makeStoreKey(methods: Array<Function>): string {
        let storeKeyArray: Array<string> = [this._STORE_PREFIX];
        methods.forEach((method: Function) => {
            storeKeyArray.push(method.name);
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
        if (storedMethodNames.length !== this._methods.length) {
            let args: Array<string> = [],
                result: Array<string> = [];

            this._methods.forEach(method => {
                // Default rank is 1
                args.push("1", method.name);
                result.push(method.name);
            });
            await this._functions.zAddAsync(this._storeKey, 'NX', ...args);

            return result;
        }

        return storedMethodNames;
    }
}

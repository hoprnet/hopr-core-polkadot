"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const api_1 = require("@polkadot/api");
const keyring_1 = __importDefault(require("@polkadot/keyring"));
const events_1 = require("./events");
const srml_types_1 = require("./srml_types");
exports.Types = srml_types_1.Types;
const crypto_1 = require("crypto");
const wasm_crypto_1 = require("@polkadot/wasm-crypto");
const Utils = __importStar(require("./utils"));
exports.Utils = Utils;
const DbKeys = __importStar(require("./dbKeys"));
const Constants = __importStar(require("./constants"));
const config_1 = require("./config");
const secp256k1_1 = __importDefault(require("secp256k1"));
const channel_1 = require("./channel");
class HoprPolkadot {
    constructor(api, self, db) {
        this.api = api;
        this.self = self;
        this.db = db;
        this._started = false;
        this.utils = Utils;
        this.types = srml_types_1.Types;
        this.channel = channel_1.Channel;
        this.dbKeys = DbKeys;
        this.constants = Constants;
        this.eventSubscriptions = new events_1.EventSignalling(this.api);
    }
    /**
     * Returns the current account nonce and lazily caches the result.
     */
    get nonce() {
        if (this._nonce != null) {
            return Promise.resolve(this._nonce++);
        }
        return new Promise(async (resolve, reject) => {
            try {
                this._nonce = (await this.api.query.system.accountNonce(this.self.onChainKeyPair.publicKey)).toNumber();
            }
            catch (err) {
                return reject(err);
            }
            return resolve(this._nonce++);
        });
    }
    /**
     * Starts the connector and initializes the internal state.
     */
    async start() {
        await wasm_crypto_1.waitReady();
        this._started = true;
    }
    get started() {
        return this._started;
    }
    /**
     * Initializes the values that we store per user on-chain.
     * @param nonce set nonce manually for batch operations
     */
    async initOnchainValues(nonce) {
        let secret = new Uint8Array(crypto_1.randomBytes(32));
        const dbPromise = this.db.put(Buffer.from(this.dbKeys.OnChainSecret()), secret.slice());
        for (let i = 0; i < 500; i++) {
            secret = await this.utils.hash(secret);
        }
        await Promise.all([
            this.api.tx.hopr
                .init(this.api.createType('Hash', this.self.onChainKeyPair.publicKey), secret)
                .signAndSend(this.self.onChainKeyPair, { nonce: nonce != null ? nonce : await this.nonce }),
            dbPromise
        ]);
    }
    /**
     * Stops the connector and interrupts the communication with the blockchain.
     */
    async stop() {
        const promise = new Promise(resolve => {
            this.api.once('disconnected', () => {
                resolve();
            });
        });
        this.api.disconnect();
        return promise;
    }
    /**
     * Returns the current account balance.
     */
    get accountBalance() {
        return this.api.query.balances.freeBalance(this.api.createType('AccountId', this.self.onChainKeyPair.publicKey));
    }
    /**
     * Returns the current account balance.
     */
    get accountNativeBalance() {
        return this.api.query.balances.freeBalance(this.api.createType('AccountId', this.self.onChainKeyPair.publicKey));
    }
    /**
     * Creates an uninitialised instance.
     *
     * @param db database instance
     */
    static async create(db, seed, options) {
        const apiPromise = api_1.ApiPromise.create({
            provider: new api_1.WsProvider(options != null && options.provider ? options.provider : config_1.DEFAULT_URI),
            types: srml_types_1.SRMLTypes
        });
        await wasm_crypto_1.waitReady();
        let hoprKeyPair;
        if (seed != null) {
            hoprKeyPair = {
                privateKey: seed,
                publicKey: secp256k1_1.default.publicKeyCreate(seed),
                onChainKeyPair: new keyring_1.default({ type: 'sr25519' }).addFromSeed(seed, undefined, 'sr25519')
            };
        }
        else if (options != null && options.id != null && isFinite(options.id)) {
            if (options.id > config_1.DEMO_ACCOUNTS.length) {
                throw Error(`Unable to find demo account for index '${options.id}'. Please make sure that you have specified enough demo accounts.`);
            }
            const privateKey = Utils.stringToU8a(config_1.DEMO_ACCOUNTS[options.id]);
            if (!secp256k1_1.default.privateKeyVerify(privateKey)) {
                throw Error(`Unable to import demo account at inde '${options.id}' because seed is not usable.`);
            }
            const publicKey = secp256k1_1.default.publicKeyCreate(privateKey);
            if (!secp256k1_1.default.publicKeyVerify(publicKey)) {
                throw Error(`Unable to import demo account at inde '${options.id}' because seed is not usable.`);
            }
            hoprKeyPair = {
                privateKey,
                publicKey,
                onChainKeyPair: new keyring_1.default({ type: 'sr25519' }).addFromSeed(privateKey, undefined, 'sr25519')
            };
        }
        else {
            throw Error('Invalid input parameters.');
        }
        const api = await apiPromise;
        const result = new HoprPolkadot(api, hoprKeyPair, db);
        if (!(await checkOnChainValues(api, db, hoprKeyPair.onChainKeyPair))) {
            await result.initOnchainValues();
        }
        return result;
    }
}
HoprPolkadot.constants = Constants;
async function checkOnChainValues(api, db, keyPair) {
    let offChain;
    let secret = new Uint8Array();
    try {
        secret = await db.get(Buffer.from(DbKeys.OnChainSecret()));
        offChain = true;
    }
    catch (err) {
        if (err.notFound != true) {
            throw err;
        }
        offChain = false;
    }
    const state = await api.query.hopr.states(keyPair.publicKey);
    const onChain = !Utils.u8aEquals(state.pubkey, new Uint8Array(srml_types_1.Public.SIZE).fill(0x00)) ||
        !Utils.u8aEquals(state.secret, new Uint8Array(srml_types_1.Hash.SIZE).fill(0x00));
    if (offChain != onChain) {
        if (offChain) {
            await api.tx.hopr.init(api.createType('Hash', keyPair.publicKey), secret).signAndSend(keyPair);
        }
        else {
            throw Error(`Key is present on-chain but not in our database.`);
        }
    }
    return offChain && onChain;
}
exports.default = HoprPolkadot;

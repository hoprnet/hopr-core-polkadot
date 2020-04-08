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
exports.Ticket = srml_types_1.Ticket;
const crypto_1 = require("crypto");
const wasm_crypto_1 = require("@polkadot/wasm-crypto");
const Utils = __importStar(require("./utils"));
exports.Utils = Utils;
const dbKeys_1 = __importDefault(require("./dbKeys"));
const constants_1 = __importDefault(require("./constants"));
const config_1 = require("./config");
const secp256k1_1 = __importDefault(require("secp256k1"));
const channel_1 = require("./channel");
exports.Channel = channel_1.Channel;
const DbKeys = new dbKeys_1.default();
exports.DbKeys = DbKeys;
const Constants = new constants_1.default();
exports.Constants = Constants;
class HoprPolkadotClass {
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
        this.CHAIN_NAME = `HOPR on Polkadot`;
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
                this._nonce = (await this.api.query.system.accountNonce(this.self.keyPair.publicKey)).toNumber();
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
        if (!this.started) {
            throw Error('Module is not yet fully initialised.');
        }
        let secret = new Uint8Array(crypto_1.randomBytes(32));
        const dbPromise = this.db.put(this.dbKeys.OnChainSecret(), secret.slice());
        for (let i = 0; i < 500; i++) {
            secret = await this.utils.hash(secret);
        }
        await Promise.all([
            this.api.tx.hopr
                .init(this.api.createType('Hash', this.self.keyPair.publicKey), secret)
                .signAndSend(this.self.keyPair, { nonce: nonce != null ? nonce : await this.nonce }),
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
        return this.api.query.balances.freeBalance(this.api.createType('AccountId', this.self.keyPair.publicKey));
    }
    /**
     * Creates an uninitialised instance.
     *
     * @param db database instance
     */
    static async create(db, seed, options) {
        const api = api_1.ApiPromise.create({
            provider: new api_1.WsProvider(options != null && options.provider ? options.provider : config_1.DEFAULT_URI),
            types: srml_types_1.SRMLTypes
        });
        let hoprKeyPair;
        if (seed != null) {
            hoprKeyPair = {
                privateKey: seed,
                publicKey: secp256k1_1.default.publicKeyCreate(seed),
                keyPair: new keyring_1.default({ type: 'sr25519' }).addFromSeed(seed, undefined, 'sr25519')
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
                keyPair: new keyring_1.default({ type: 'sr25519' }).addFromSeed(privateKey, undefined, 'sr25519')
            };
        }
        else {
            throw Error('Invalid input parameters.');
        }
        return new HoprPolkadotClass(await api, hoprKeyPair, db);
    }
}
exports.default = HoprPolkadotClass;
//# sourceMappingURL=index.js.map
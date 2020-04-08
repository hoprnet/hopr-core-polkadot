"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const srml_types_1 = require("../srml_types");
const wasm_crypto_1 = require("@polkadot/wasm-crypto");
const settle_1 = require("./settle");
const open_1 = require("./open");
const utils_1 = require("../utils");
const dbKeys_1 = require("../dbKeys");
const chalk_1 = __importDefault(require("chalk"));
const NONCE_HASH_KEY = Uint8Array.from(new TextEncoder().encode('Nonce'));
const bn_js_1 = __importDefault(require("bn.js"));
class Channel {
    constructor(coreConnector, counterparty, signedChannel) {
        this.coreConnector = coreConnector;
        this.counterparty = counterparty;
        this.ticket = srml_types_1.Ticket;
        this._signedChannel = signedChannel;
    }
    get offChainCounterparty() {
        return this._signedChannel.signer;
    }
    get channelId() {
        if (this._channelId != null) {
            return Promise.resolve(this._channelId);
        }
        return new Promise(async (resolve, reject) => {
            try {
                this._channelId = await utils_1.getId(this.coreConnector.api.createType('AccountId', this.coreConnector.self.onChainKeyPair.publicKey), this.counterparty);
            }
            catch (err) {
                return reject(err);
            }
            resolve(this._channelId);
        });
    }
    get channel() {
        if (this._signedChannel != null) {
            return Promise.resolve(this._signedChannel.channel);
        }
        return new Promise(async (resolve, reject) => {
            try {
                const record = await this.coreConnector.db.get(Buffer.from(this.coreConnector.dbKeys.Channel(this.counterparty)));
                this._signedChannel = new srml_types_1.SignedChannel({
                    bytes: record.buffer,
                    offset: record.byteOffset
                });
            }
            catch (err) {
                return reject(err);
            }
            return resolve(this._signedChannel.channel);
        });
    }
    get settlementWindow() {
        if (this._settlementWindow != null) {
            return Promise.resolve(this._settlementWindow);
        }
        return new Promise(async (resolve, reject) => {
            try {
                this._settlementWindow = await this.coreConnector.api.query.hopr.pendingWindow();
            }
            catch (err) {
                return reject(err);
            }
            return resolve(this._settlementWindow);
        });
    }
    get state() {
        return this.channel;
    }
    get balance_a() {
        return this.channel.then(channel => {
            switch (channel.type) {
                case 'Funded':
                    return channel.asFunded.balance_a;
                case 'Active':
                    return channel.asActive.balance_a;
                case 'PendingSettlement':
                    return channel.asPendingSettlement[0].balance_a;
                default:
                    throw Error(`Invalid state. Got '${channel.type}'`);
            }
        });
    }
    get balance() {
        return this.channel.then(channel => {
            switch (channel.type) {
                case 'Funded':
                    return channel.asFunded.balance;
                case 'Active':
                    return channel.asActive.balance;
                case 'PendingSettlement':
                    return channel.asPendingSettlement[0].balance;
                default:
                    throw Error(`Invalid state. Got '${channel.type}'`);
            }
        });
    }
    get currentBalance() {
        if (this.coreConnector.utils.isPartyA(this.coreConnector.api.createType('AccountId', this.coreConnector.self.onChainKeyPair.publicKey), this.counterparty)) {
            return Promise.resolve(this.balance_a);
        }
        return new Promise(async (resolve) => {
            return resolve(this.coreConnector.api.createType('Balance', (await this.balance).sub(await this.balance_a)));
        });
    }
    get currentBalanceOfCounterparty() {
        if (!this.coreConnector.utils.isPartyA(this.coreConnector.api.createType('AccountId', this.coreConnector.self.onChainKeyPair.publicKey), this.counterparty)) {
            return Promise.resolve(this.balance_a);
        }
        return new Promise(async (resolve) => {
            return resolve(this.coreConnector.api.createType('Balance', (await this.balance).sub(await this.balance_a)));
        });
    }
    /**
     * Initiates the settlement of this payment channel.
     * @returns a Promise that resolves once the payment channel is settled, otherwise
     * it rejects the Promise with an error.
     */
    async initiateSettlement() {
        let channelSettler;
        const [channelId, settlementWindow] = await Promise.all([this.channelId, this.settlementWindow]);
        try {
            channelSettler = await settle_1.ChannelSettler.create({
                hoprPolkadot: this.coreConnector,
                counterparty: this.counterparty,
                channelId,
                settlementWindow
            });
        }
        catch (err) {
            throw err;
        }
        await Promise.all([
            /* prettier-ignore */
            channelSettler.onceClosed().then(() => channelSettler.withdraw()),
            channelSettler.init()
        ]);
        await this.coreConnector.db.del(Buffer.from(this.coreConnector.dbKeys.Channel(this.counterparty)));
    }
    async getPreviousChallenges() {
        let pubKeys = [];
        return new Promise(async (resolve, reject) => {
            this.coreConnector.db
                .createReadStream({
                gt: this.coreConnector.dbKeys.Challenge(await this.channelId, this.coreConnector.api.createType('Hash', new Uint8Array(srml_types_1.Hash.SIZE).fill(0x00))),
                lt: this.coreConnector.dbKeys.Challenge(await this.channelId, this.coreConnector.api.createType('Hash', new Uint8Array(srml_types_1.Hash.SIZE).fill(0xff)))
            })
                .on('error', reject)
                .on('data', ({ key, ownKeyHalf }) => {
                const [channelId, challenge] = this.coreConnector.dbKeys.ChallengeKeyParse(key, this.coreConnector.api);
                // @TODO BIG TODO !!
                // replace this by proper EC-arithmetic
                pubKeys.push(utils_1.u8aXOR(false, challenge, ownKeyHalf.toU8a()));
            })
                .on('end', () => {
                if (pubKeys.length > 0) {
                    return resolve(this.coreConnector.api.createType('Hash', utils_1.u8aXOR(false, ...pubKeys)));
                }
                resolve();
            });
        });
    }
    /**
     * Checks if there exists a payment channel with `counterparty`.
     * @param coreConnector the CoreConnector instance
     * @param counterparty secp256k1 public key of the counterparty
     */
    static async isOpen(coreConnector, counterparty) {
        const channelId = await coreConnector.utils.getId(coreConnector.api.createType('AccountId', coreConnector.self.onChainKeyPair.publicKey), counterparty);
        const [onChain, offChain] = await Promise.all([
            coreConnector.api.query.hopr.channels(channelId).then((channel) => channel != null && channel.type != 'Uninitialized', () => false),
            coreConnector.db.get(Buffer.from(coreConnector.dbKeys.Channel(counterparty))).then(() => true, (err) => {
                if (err.notFound) {
                    return false;
                }
                else {
                    throw err;
                }
            })
        ]);
        if (onChain != offChain) {
            if (!onChain && offChain) {
                throw Error(`Channel ${utils_1.u8aToHex(channelId)} exists off-chain but not on-chain.`);
            }
            else {
                throw Error(`Channel ${utils_1.u8aToHex(channelId)} exists on-chain but not off-chain.`);
            }
        }
        return onChain && offChain;
    }
    /**
     * Checks whether the channel is open and opens that channel if necessary.
     * @param coreConnector the connector instance
     * @param offChainCounterparty public key used off-chain
     * @param getOnChainPublicKey yields the on-chain identity
     * @param channelBalance desired channel balance
     * @param sign signing provider
     */
    static async create(coreConnector, offChainCounterparty, getOnChainPublicKey, channelBalance, sign) {
        let signedChannel;
        const counterparty = coreConnector.api.createType('AccountId', await getOnChainPublicKey(offChainCounterparty));
        const channelId = await utils_1.getId(coreConnector.api.createType('AccountId', coreConnector.self.onChainKeyPair.publicKey), counterparty);
        if (await this.isOpen(coreConnector, counterparty)) {
            const record = await coreConnector.db.get(Buffer.from(coreConnector.dbKeys.Channel(counterparty)));
            signedChannel = new srml_types_1.SignedChannel({
                bytes: record.buffer,
                offset: record.byteOffset
            });
        }
        else if (sign != null && channelBalance != null) {
            const channelOpener = await open_1.ChannelOpener.create(coreConnector, counterparty, channelId);
            if (coreConnector.utils.isPartyA(coreConnector.api.createType('AccountId', coreConnector.self.onChainKeyPair.publicKey), counterparty)) {
                console.log(chalk_1.default.yellow(`increase funds self`));
                await channelOpener.increaseFunds(channelBalance.balance_a);
            }
            else {
                console.log(chalk_1.default.yellow(`increase funds counterparty`));
                await channelOpener.increaseFunds(coreConnector.api.createType('Balance', channelBalance.balance.sub(channelBalance.balance_a.toBn())));
            }
            signedChannel = await sign(channelBalance);
            await Promise.all([
                /* prettier-ignore */
                channelOpener.onceOpen(),
                channelOpener.onceFundedByCounterparty(signedChannel.channel).then(() => channelOpener.setActive(signedChannel))
            ]);
            await coreConnector.db.put(Buffer.from(coreConnector.dbKeys.Channel(counterparty)), Buffer.from(signedChannel));
        }
        else {
            throw Error('Invalid input parameters.');
        }
        return new Channel(coreConnector, counterparty, signedChannel);
    }
    /**
     * Handles the opening request received by another HOPR node.
     * @param hoprPolkadot the connector instance
     */
    static handleOpeningRequest(hoprPolkadot) {
        return open_1.ChannelOpener.handleOpeningRequest(hoprPolkadot);
    }
    /**
     * Get all channels from the database.
     * @param coreConnector the connector instance
     * @param onData function that is applied on every entry, cf. `map`
     * @param onEnd function that is applied at the end, cf. `reduce`
     */
    static getAll(coreConnector, onData, onEnd) {
        const promises = [];
        return new Promise((resolve, reject) => {
            coreConnector.db
                .createReadStream({
                gt: Buffer.from(coreConnector.dbKeys.Channel(coreConnector.api.createType('Hash', new Uint8Array(srml_types_1.Hash.SIZE).fill(0x00)))),
                lt: Buffer.from(coreConnector.dbKeys.Channel(coreConnector.api.createType('Hash', new Uint8Array(srml_types_1.Hash.SIZE).fill(0xff))))
            })
                .on('error', err => reject(err))
                .on('data', ({ key, value }) => {
                const signedChannel = new srml_types_1.SignedChannel({
                    bytes: value.buffer,
                    offset: value.byteOffset
                });
                promises.push(onData(new Channel(coreConnector, dbKeys_1.ChannelKeyParse(key, coreConnector.api), signedChannel)));
            })
                .on('end', () => resolve(onEnd(promises)));
        });
    }
    /**
     * Tries to close all channels and returns the finally received funds.
     * @notice returns `0` if there are no open channels and/or we have not received any funds.
     * @param coreConnector the connector instance
     */
    static async closeChannels(coreConnector) {
        const result = new bn_js_1.default(0);
        return Channel.getAll(coreConnector, (channel) => channel.initiateSettlement().then(() => {
            // @TODO add balance
            result.iaddn(0);
        }), async (promises) => {
            await Promise.all(promises);
            return coreConnector.api.createType('Balance', result);
        });
    }
    /**
     * Checks whether this signature has already been used.
     * @param signature signature to check
     */
    async testAndSetNonce(signature) {
        await wasm_crypto_1.waitReady();
        const nonce = wasm_crypto_1.blake2b(signature, NONCE_HASH_KEY, 32);
        const key = this.coreConnector.dbKeys.Nonce(await this.channelId, this.coreConnector.api.createType('Hash', nonce));
        let found;
        try {
            found = await this.coreConnector.db.get(Buffer.from(key));
        }
        catch (err) {
            if (err.notFound == null || err.notFound != true) {
                throw err;
            }
        }
        if (found != null) {
            throw Error('Nonces must not be used twice.');
        }
        await this.coreConnector.db.put(Buffer.from(key), Buffer.from(''));
    }
}
exports.Channel = Channel;

"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const srml_types_1 = require("../srml_types");
const wasm_crypto_1 = require("@polkadot/wasm-crypto");
const settle_1 = require("./settle");
const open_1 = require("./open");
const util_1 = require("@polkadot/util");
const NONCE_HASH_KEY = Uint8Array.from(new TextEncoder().encode('Nonce'));
const bn_js_1 = __importDefault(require("bn.js"));
class Channel {
    constructor(hoprPolkadot, counterparty, signedChannel) {
        this.hoprPolkadot = hoprPolkadot;
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
                this._channelId = await this.hoprPolkadot.utils.getId(this.hoprPolkadot.api.createType('AccountId', this.hoprPolkadot.self.keyPair.publicKey), this.counterparty, this.hoprPolkadot.api);
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
                console.log(await this.hoprPolkadot.db.get(this.hoprPolkadot.dbKeys.Channel(this.counterparty)));
                this._signedChannel = new srml_types_1.SignedChannel(await this.hoprPolkadot.db.get(this.hoprPolkadot.dbKeys.Channel(this.counterparty)));
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
                this._settlementWindow = await this.hoprPolkadot.api.query.hopr.pendingWindow();
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
        if (this.hoprPolkadot.utils.isPartyA(this.hoprPolkadot.api.createType('AccountId', this.hoprPolkadot.self.keyPair.publicKey), this.counterparty)) {
            return Promise.resolve(this.balance_a);
        }
        return new Promise(async (resolve) => {
            return resolve(this.hoprPolkadot.api.createType('Balance', (await this.balance).sub(await this.balance_a)));
        });
    }
    get currentBalanceOfCounterparty() {
        if (!this.hoprPolkadot.utils.isPartyA(this.hoprPolkadot.api.createType('AccountId', this.hoprPolkadot.self.keyPair.publicKey), this.counterparty)) {
            return Promise.resolve(this.balance_a);
        }
        return new Promise(async (resolve) => {
            return resolve(this.hoprPolkadot.api.createType('Balance', (await this.balance).sub(await this.balance_a)));
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
                hoprPolkadot: this.hoprPolkadot,
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
    }
    async getPreviousChallenges() {
        let pubKeys = [];
        return new Promise(async (resolve, reject) => {
            this.hoprPolkadot.db
                .createReadStream({
                gt: this.hoprPolkadot.dbKeys.Challenge(await this.channelId, this.hoprPolkadot.api.createType('Hash', new Uint8Array(srml_types_1.Hash.SIZE).fill(0x00))),
                lt: this.hoprPolkadot.dbKeys.Challenge(await this.channelId, this.hoprPolkadot.api.createType('Hash', new Uint8Array(srml_types_1.Hash.SIZE).fill(0x00)))
            })
                .on('error', reject)
                .on('data', ({ key, ownKeyHalf }) => {
                const [channelId, challenge] = this.hoprPolkadot.dbKeys.ChallengeKeyParse(key, this.hoprPolkadot.api);
                // BIG TODO !!
                // replace this by proper EC-arithmetic
                pubKeys.push(this.hoprPolkadot.utils.u8aXOR(false, challenge.toU8a(), ownKeyHalf.toU8a()));
            })
                .on('end', () => {
                if (pubKeys.length > 0) {
                    return resolve(this.hoprPolkadot.api.createType('Hash', this.hoprPolkadot.utils.u8aXOR(false, ...pubKeys)));
                }
                resolve();
            });
        });
    }
    /**
     * Checks if there exists a payment channel with `counterparty`.
     * @param hoprPolkadot the CoreConnector instance
     * @param counterparty secp256k1 public key of the counterparty
     */
    static async isOpen(hoprPolkadot, counterparty, channelId) {
        const [onChain, offChain] = await Promise.all([
            hoprPolkadot.api.query.hopr.channels(channelId).then((channel) => channel != null && channel.type != 'Uninitialized', () => false),
            hoprPolkadot.db.get(hoprPolkadot.dbKeys.Channel(counterparty)).then(() => true, (err) => {
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
                throw Error(`Channel ${util_1.u8aToHex(channelId)} exists off-chain but not on-chain.`);
            }
            else {
                throw Error(`Channel ${util_1.u8aToHex(channelId)} exists on-chain but not off-chain.`);
            }
        }
        return onChain && offChain;
    }
    /**
     * Checks whether the channel is open and opens that channel if necessary.
     * @param hoprPolkadot the connector instance
     * @param offChainCounterparty public key used off-chain
     * @param getOnChainPublicKey yields the on-chain identity
     * @param channelBalance desired channel balance
     * @param sign signing provider
     */
    static async create(hoprPolkadot, offChainCounterparty, getOnChainPublicKey, channelBalance, sign) {
        let signedChannel;
        const counterparty = hoprPolkadot.api.createType('AccountId', await getOnChainPublicKey(offChainCounterparty));
        const channelId = await hoprPolkadot.utils.getId(hoprPolkadot.api.createType('AccountId', hoprPolkadot.self.keyPair.publicKey), counterparty, hoprPolkadot.api);
        if (await this.isOpen(hoprPolkadot, counterparty, channelId)) {
            signedChannel = new srml_types_1.SignedChannel(await hoprPolkadot.db.get(hoprPolkadot.dbKeys.Channel(counterparty)));
        }
        else if (sign != null && channelBalance != null) {
            const channelOpener = await open_1.ChannelOpener.create(hoprPolkadot, counterparty, channelId);
            if (hoprPolkadot.utils.isPartyA(hoprPolkadot.api.createType('AccountId', hoprPolkadot.self.keyPair.publicKey), counterparty)) {
                await channelOpener.increaseFunds(channelBalance.balance_a);
            }
            else {
                await channelOpener.increaseFunds(hoprPolkadot.api.createType('Balance', channelBalance.balance.sub(channelBalance.balance_a.toBn())));
            }
            signedChannel = await sign(channelBalance);
            await Promise.all([
                /* prettier-ignore */
                channelOpener.onceOpen(),
                channelOpener.setActive(signedChannel)
            ]);
            await hoprPolkadot.db.put(hoprPolkadot.dbKeys.Channel(counterparty), Buffer.from(signedChannel.toU8a()));
        }
        else {
            throw Error('Invalid input parameters.');
        }
        return new Channel(hoprPolkadot, counterparty, signedChannel);
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
     * @param hoprPolkadot the connector instance
     * @param onData function that is applied on every entry, cf. `map`
     * @param onEnd function that is applied at the end, cf. `reduce`
     */
    static getAll(hoprPolkadot, onData, onEnd) {
        const promises = [];
        return new Promise((resolve, reject) => {
            hoprPolkadot.db
                .createReadStream({
                gt: hoprPolkadot.dbKeys.Channel(hoprPolkadot.api.createType('Hash', new Uint8Array(srml_types_1.Hash.SIZE).fill(0x00))),
                lt: hoprPolkadot.dbKeys.Channel(hoprPolkadot.api.createType('Hash', new Uint8Array(srml_types_1.Hash.SIZE).fill(0xff)))
            })
                .on('error', err => reject(err))
                .on('data', ({ key, value }) => {
                const signedChannel = new srml_types_1.SignedChannel(value);
                promises.push(onData(new Channel(hoprPolkadot, hoprPolkadot.dbKeys.ChannelKeyParse(key, hoprPolkadot.api), signedChannel)));
            })
                .on('end', () => resolve(onEnd(promises)));
        });
    }
    /**
     * Tries to close all channels and returns the finally received funds.
     * @notice returns `0` if there are no open channels and/or we have not received any funds.
     * @param hoprPolkadot the connector instance
     */
    static async closeChannels(hoprPolkadot) {
        const result = new bn_js_1.default(0);
        return Channel.getAll(hoprPolkadot, (channel) => channel.initiateSettlement().then(() => {
            // @TODO add balance
            result.iaddn(0);
        }), async (promises) => {
            await Promise.all(promises);
            return hoprPolkadot.api.createType('Balance', result);
        });
    }
    /**
     * Checks whether this signature has already been used.
     * @param signature signature to check
     */
    async testAndSetNonce(signature) {
        await wasm_crypto_1.waitReady();
        const nonce = wasm_crypto_1.blake2b(signature, NONCE_HASH_KEY, 32);
        const key = this.hoprPolkadot.dbKeys.Nonce(await this.channelId, this.hoprPolkadot.api.createType('Hash', nonce));
        try {
            await this.hoprPolkadot.db.get(Buffer.from(key));
        }
        catch (err) {
            if (err.notFound == null || err.notFound != true) {
                throw err;
            }
            return;
        }
        throw Error('Nonces must not be used twice.');
    }
}
exports.Channel = Channel;
//# sourceMappingURL=index.js.map
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const srml_types_1 = require("../srml_types");
const events_1 = require("../events");
const utils_1 = require("../utils");
const chalk_1 = __importDefault(require("chalk"));
class ChannelOpener {
    constructor(hoprPolkadot, counterparty, channelId) {
        this.hoprPolkadot = hoprPolkadot;
        this.counterparty = counterparty;
        this.channelId = channelId;
    }
    static handleOpeningRequest(hoprPolkadot) {
        return (source) => {
            return (async function* () {
                for await (const msg of source) {
                    const signedChannelArray = msg.slice();
                    const signedChannel = new srml_types_1.SignedChannel({
                        bytes: signedChannelArray.buffer,
                        offset: signedChannelArray.byteOffset
                    });
                    const counterparty = hoprPolkadot.api.createType('AccountId', signedChannel.signature.sr25519PublicKey);
                    const channelId = await utils_1.getId(counterparty, hoprPolkadot.api.createType('AccountId', hoprPolkadot.self.onChainKeyPair.publicKey));
                    let channelOpener = await ChannelOpener.create(hoprPolkadot, counterparty, channelId);
                    channelOpener
                        .onceOpen()
                        .then(() => hoprPolkadot.db.put(utils_1.u8aToHex(hoprPolkadot.dbKeys.Channel(counterparty)), Buffer.from(signedChannel)));
                    if (hoprPolkadot.utils.isPartyA(hoprPolkadot.api.createType('AccountId', hoprPolkadot.self.onChainKeyPair.publicKey), counterparty)) {
                        console.log(chalk_1.default.green(`Funding self`, signedChannel.channel.asFunded.balance_a.toString()));
                        await channelOpener.increaseFunds(signedChannel.channel.asFunded.balance_a);
                    }
                    else {
                        console.log(chalk_1.default.green(`Funding counterparty`, hoprPolkadot.api.createType('Balance', signedChannel.channel.asFunded.balance.sub(signedChannel.channel.asFunded.balance_a.toBn()))));
                        await channelOpener.increaseFunds(hoprPolkadot.api.createType('Balance', signedChannel.channel.asFunded.balance.sub(signedChannel.channel.asFunded.balance_a.toBn())));
                    }
                    await hoprPolkadot.db.put(Buffer.from(hoprPolkadot.dbKeys.Channel(counterparty)), Buffer.from(signedChannel));
                    yield (await srml_types_1.SignedChannel.create(hoprPolkadot, {
                        bytes: signedChannel.buffer,
                        offset: signedChannel.byteOffset
                    }, { channel: signedChannel.channel })).subarray();
                }
            })();
        };
    }
    static async create(hoprPolkadot, counterparty, channelId) {
        return new ChannelOpener(hoprPolkadot, counterparty, channelId);
    }
    async increaseFunds(newAmount) {
        if ((await this.hoprPolkadot.accountBalance).lt(newAmount)) {
            throw Error('Insufficient funds.');
        }
        await this.hoprPolkadot.api.tx.hopr
            .create(newAmount.toU8a(), this.counterparty)
            .signAndSend(this.hoprPolkadot.self.onChainKeyPair, { nonce: await this.hoprPolkadot.nonce });
        return this;
    }
    onceOpen() {
        const eventIdentifier = events_1.Opened(this.channelId);
        return new Promise(resolve => {
            this.hoprPolkadot.eventSubscriptions.once(eventIdentifier, () => {
                resolve(this);
            });
        });
    }
    async onceFundedByCounterparty(channel, handler) {
        if (handler == null) {
            let unsubscribe;
            return new Promise(async (resolve) => {
                unsubscribe = await this.hoprPolkadot.api.query.hopr.channels(this.channelId, (currentChannel) => {
                    if (currentChannel.isFunded && currentChannel.eq(channel)) {
                        unsubscribe();
                        resolve(this);
                    }
                });
            });
        }
        // @TODO implement else
        const unsubscribe = await this.hoprPolkadot.api.query.hopr.channels(this.channelId, _ => {
            unsubscribe();
        });
    }
    async setActive(signedChannel) {
        try {
            await this.hoprPolkadot.api.tx.hopr
                .setActive(this.counterparty, signedChannel.signature.onChainSignature)
                .signAndSend(this.hoprPolkadot.self.onChainKeyPair, { nonce: await this.hoprPolkadot.nonce });
        }
        catch (err) {
            console.log(err);
        }
        return this;
    }
}
exports.ChannelOpener = ChannelOpener;
//# sourceMappingURL=open.js.map
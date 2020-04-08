"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const srml_types_1 = require("../srml_types");
const events_1 = require("../events");
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
                    const signedChannel = new srml_types_1.SignedChannel(msg.slice());
                    const counterparty = hoprPolkadot.api.createType('AccountId', signedChannel.signature.sr25519PublicKey);
                    const channelId = await hoprPolkadot.utils.getId(counterparty, hoprPolkadot.api.createType('AccountId', hoprPolkadot.self.keyPair.publicKey), hoprPolkadot.api);
                    let channelOpener = await ChannelOpener.create(hoprPolkadot, counterparty, channelId);
                    channelOpener
                        .onceOpen()
                        .then(() => hoprPolkadot.db.put(hoprPolkadot.dbKeys.Channel(counterparty), Buffer.from(signedChannel.toU8a())));
                    if (hoprPolkadot.utils.isPartyA(hoprPolkadot.api.createType('AccountId', hoprPolkadot.self.keyPair.publicKey), counterparty)) {
                        await channelOpener.increaseFunds(signedChannel.channel.asFunded.balance_a);
                    }
                    else {
                        await channelOpener.increaseFunds(hoprPolkadot.api.createType('Balance', signedChannel.channel.asFunded.balance.sub(signedChannel.channel.asFunded.balance_a.toBn())));
                    }
                    await hoprPolkadot.db.put(hoprPolkadot.dbKeys.Channel(counterparty), Buffer.from(signedChannel.toU8a()));
                    signedChannel.signature = await hoprPolkadot.utils.sign(signedChannel.channel.toU8a(), hoprPolkadot.self.privateKey, hoprPolkadot.self.publicKey);
                    yield signedChannel.toU8a();
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
            .signAndSend(this.hoprPolkadot.self.keyPair, { nonce: await this.hoprPolkadot.nonce });
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
    async onceFundedByCounterparty(handler) {
        if (handler == null) {
            return new Promise(async (resolve) => {
                const unsubscribe = await this.hoprPolkadot.api.query.hopr.channels(this.channelId, _ => {
                    unsubscribe();
                    resolve(this);
                });
            });
        }
        // TODO specify else
        const unsubscribe = await this.hoprPolkadot.api.query.hopr.channels(this.channelId, _ => {
            unsubscribe();
        });
    }
    async setActive(signedChannel) {
        await this.hoprPolkadot.api.tx.hopr
            .setActive(this.counterparty, signedChannel.signature.onChainSignature)
            .signAndSend(this.hoprPolkadot.self.keyPair, { nonce: await this.hoprPolkadot.nonce });
        return this;
    }
}
exports.ChannelOpener = ChannelOpener;
//# sourceMappingURL=open.js.map
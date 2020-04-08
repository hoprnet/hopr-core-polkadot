"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const events_1 = require("../events");
const util_1 = require("@polkadot/util");
class ChannelSettler {
    constructor(hoprPolkadot, counterparty, channelId, settlementWindow) {
        this.hoprPolkadot = hoprPolkadot;
        this.counterparty = counterparty;
        this.channelId = channelId;
        this.settlementWindow = settlementWindow;
        this.handlers = [];
    }
    get end() {
        if (this._end) {
            return Promise.resolve(this._end);
        }
        return new Promise(async (resolve, reject) => {
            let channel;
            try {
                channel = await this.hoprPolkadot.api.query.hopr.channels(this.channelId);
            }
            catch (err) {
                return reject(err);
            }
            if (channel.isPendingSettlement) {
                this._end = channel.asPendingSettlement[1];
            }
            else {
                try {
                    let unsubscribe;
                    await new Promise(async (resolve, reject) => {
                        unsubscribe = await this.hoprPolkadot.api.query.hopr.channels(this.channelId, (channel) => {
                            console.log(`channel has changed.`, channel.toJSON());
                            if (channel.isPendingSettlement) {
                                setImmediate(() => {
                                    unsubscribe();
                                    resolve();
                                });
                            }
                        });
                    });
                }
                catch (err) {
                    return reject(`Channel state must be 'PendingSettlement', but is '${channel.type}'`);
                }
            }
            return resolve(this._end);
        });
    }
    static async create(props) {
        let channel = await props.hoprPolkadot.api.query.hopr.channels(props.channelId);
        if (!(channel.isPendingSettlement || channel.isActive)) {
            throw Error(`Invalid state. Expected channel state to be either 'Active' or 'Pending'. Got '${channel.type}'.`);
        }
        return new ChannelSettler(props.hoprPolkadot, props.counterparty, props.channelId, props.settlementWindow);
    }
    async init() {
        this.unsubscribePushback = this.unsubscribePushback || this.hoprPolkadot.eventSubscriptions.on(events_1.PushedBackSettlement(this.channelId), (event) => {
            this._end = event.data[0];
        });
        try {
            this.hoprPolkadot.api.tx.hopr
                .initiateSettlement(this.counterparty)
                .signAndSend(this.hoprPolkadot.self.onChainKeyPair, { nonce: await this.hoprPolkadot.nonce });
        }
        catch (err) {
            console.log(`Tried to settle channel ${util_1.u8aToHex(this.channelId)} but failed due to ${err.message}`);
        }
        return this;
    }
    // optional
    // oncePushedBack(handler?: EventHandler): void | Promise<ChannelCloser> {
    //   Reflect.apply(checkInitialised, this, [])
    //   const eventIdentifier = PushedBackSettlement(this.props.channelId)
    //   if (isEventHandler(handler)) {
    //     this.props.eventRegistry.once(eventIdentifier, handler)
    //     return
    //   }
    //   return new Promise<ChannelCloser>(resolve => {
    //     this.props.eventRegistry.once(eventIdentifier, () => resolve(this))
    //   })
    // }
    async onceClosed() {
        if (this.unsubscribeChannelListener == null) {
            this.unsubscribeChannelListener = await this.timeoutFactory();
        }
        return new Promise(resolve => {
            this.handlers.push(resolve);
        });
    }
    async withdraw() {
        await this.hoprPolkadot.api.tx.hopr
            .withdraw(this.counterparty)
            .signAndSend(this.hoprPolkadot.self.onChainKeyPair, { nonce: await this.hoprPolkadot.nonce });
        console.log('withdrawn');
    }
    timeoutFactory() {
        return new Promise(async (resolve, reject) => {
            // make sure that we have `end` cached
            try {
                await this.end;
            }
            catch (err) {
                return reject(err);
            }
            resolve(this.hoprPolkadot.api.query.timestamp.now(async (moment) => {
                if (moment.gt(await this.end)) {
                    while (this.handlers.length > 0) {
                        (this.handlers.pop())();
                    }
                }
            }));
        });
    }
}
exports.ChannelSettler = ChannelSettler;
//# sourceMappingURL=settle.js.map
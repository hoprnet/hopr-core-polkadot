"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const srml_types_1 = require("../srml_types");
const events_1 = require("../events");
class ChannelSettler {
    constructor(props) {
        this.props = props;
        this.handlers = [];
    }
    get end() {
        if (this._end) {
            return Promise.resolve(this._end);
        }
        return new Promise(async (resolve, reject) => {
            let channel;
            try {
                channel = await this.props.hoprPolkadot.api.query.hopr.channels(this.props.channelId);
            }
            catch (err) {
                return reject(err);
            }
            if (channel.isPendingSettlement) {
                this._end = channel.asPendingSettlement[1];
            }
            else {
                try {
                    await new Promise(async (resolve, reject) => {
                        const unsub = await this.props.hoprPolkadot.api.query.hopr.channels(this.props.channelId, (channel) => {
                            console.log(`channel has changed. ${channel.toString()}`);
                            if (channel.isPendingSettlement) {
                                setImmediate(() => {
                                    unsub();
                                    resolve();
                                });
                            }
                        });
                    });
                }
                catch (err) {
                    return reject(`Channel state must be '${srml_types_1.PendingSettlement.name}', but is '${channel.type}'`);
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
        return new ChannelSettler(props);
    }
    async init() {
        this.props.hoprPolkadot.api.tx.hopr
            .initiateSettlement(this.props.counterparty)
            .signAndSend(this.props.hoprPolkadot.self.keyPair, { nonce: await this.props.hoprPolkadot.nonce });
        const unsubscribe = this.props.hoprPolkadot.eventSubscriptions.on(events_1.PushedBackSettlement(this.props.channelId), (event) => {
            this._end = event.data[0];
        });
        unsubscribe();
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
        if (this.timer == null) {
            this.timer = await this.timeoutFactory();
        }
        return new Promise(resolve => {
            let index = this.handlers.push(() => {
                this.handlers.splice(index - 1, 1, undefined);
                this.cleanHandlers();
                return resolve();
            });
        });
    }
    async withdraw() {
        await this.props.hoprPolkadot.api.tx.hopr
            .withdraw(this.props.counterparty)
            .signAndSend(this.props.hoprPolkadot.self.keyPair, { nonce: await this.props.hoprPolkadot.nonce });
        console.log('withdrawn');
    }
    timeoutFactory() {
        return new Promise(async (resolve, reject) => {
            let end = await this.end;
            resolve(this.props.hoprPolkadot.api.query.timestamp.now(async (moment) => {
                if (moment.gt(await this.end)) {
                    this.handlers.forEach(handler => handler != null && handler());
                }
            }));
        });
    }
    cleanHandlers() {
        while (this.handlers.length > 0 && this.handlers[this.handlers.length - 1] === undefined) {
            this.handlers.pop();
        }
        if (this.handlers.length == 0 && this.timer != null) {
            this.timer();
        }
    }
}
exports.ChannelSettler = ChannelSettler;
//# sourceMappingURL=settle.js.map
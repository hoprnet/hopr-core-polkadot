"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const secp256k1_1 = __importDefault(require("secp256k1"));
const util_1 = require("@polkadot/util");
const types_1 = require("@polkadot/types");
const signature_1 = require("./signature");
const channel_1 = require("./channel");
const base_1 = require("./base");
class SignedChannel extends Uint8Array {
    constructor(arr, struct) {
        if (arr != null && struct == null) {
            super(arr);
        }
        else if (arr == null && struct != null) {
            super(util_1.u8aConcat(struct.signature, struct.channel.toU8a()));
        }
        else {
            throw Error(`Invalid constructor arguments.`);
        }
        this.registry = new types_1.TypeRegistry();
        this.registry.register({
            Channel: channel_1.Channel,
            Funded: channel_1.Funded,
            Uninitialized: channel_1.Uninitialized,
            Active: channel_1.Active,
            PendingSettlement: channel_1.PendingSettlement,
            ChannelBalance: channel_1.ChannelBalance,
            Balance: base_1.Balance,
            Moment: base_1.Moment
        });
    }
    subarray(begin = 0, end) {
        return new Uint8Array(this.buffer, begin + this.byteOffset, end != null ? end - begin : undefined);
    }
    get signature() {
        if (this._signature == null) {
            this._signature = new signature_1.Signature({
                bytes: this.buffer,
                offset: this.byteOffset
            });
        }
        return this._signature;
    }
    set signature(newSignature) {
        this.set(newSignature, 0);
    }
    // TODO: Only expecting Funded or Active Channels
    get channel() {
        return new channel_1.Channel(this.registry, this.subarray(signature_1.Signature.SIZE, signature_1.Signature.SIZE + channel_1.ChannelBalance.SIZE + 1));
    }
    static get SIZE() {
        return signature_1.Signature.SIZE + channel_1.ChannelBalance.SIZE + 1;
    }
    get signer() {
        // @ts-ignore
        return secp256k1_1.default.ecdsaRecover(this.signature.signature, this.signature.recovery, this.signature.sr25519PublicKey);
    }
    toU8a() {
        return new Uint8Array(this.buffer, 0, SignedChannel.SIZE);
    }
}
exports.SignedChannel = SignedChannel;
//# sourceMappingURL=signedChannel.js.map
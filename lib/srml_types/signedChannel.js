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
const utils_1 = require("../utils");
class SignedChannel extends Uint8Array {
    constructor(arr, struct) {
        if (arr != null && struct == null) {
            super(arr.bytes, arr.offset, SignedChannel.SIZE);
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
    subarray(begin = 0, end = SignedChannel.SIZE) {
        return new Uint8Array(this.buffer, begin + this.byteOffset, end - begin);
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
    // TODO: Only expecting Funded or Active Channels
    get channel() {
        if (this._channel == null) {
            this._channel = new channel_1.Channel(this.registry, this.subarray(signature_1.Signature.SIZE, signature_1.Signature.SIZE + channel_1.ChannelBalance.SIZE + 1));
        }
        return this._channel;
    }
    get signer() {
        return new Promise(async (resolve) => resolve(secp256k1_1.default.ecdsaRecover(this.signature.signature, this.signature.recovery, await utils_1.hash(util_1.u8aConcat(this.signature.sr25519PublicKey, this.channel.toU8a())))));
    }
    static async create(coreConnector, arr, struct) {
        let signedChannel;
        if (arr != null && struct == null) {
            signedChannel = new SignedChannel(arr);
            if (utils_1.u8aEquals(signedChannel.signature, new Uint8Array(signature_1.Signature.SIZE).fill(0x00))) {
                signedChannel.set(await utils_1.sign(signedChannel.channel.toU8a(), coreConnector.self.privateKey, coreConnector.self.publicKey), 0);
            }
        }
        else if (arr == null && struct != null) {
            const array = new Uint8Array(SignedChannel.SIZE).fill(0x00);
            signedChannel = new SignedChannel({
                bytes: array.buffer,
                offset: array.byteOffset
            });
            signedChannel.set(struct.channel.toU8a(), signature_1.Signature.SIZE);
            if (struct.signature == null || utils_1.u8aEquals(struct.signature, new Uint8Array(signature_1.Signature.SIZE).fill(0x00))) {
                signedChannel.signature.set(await utils_1.sign(signedChannel.channel.toU8a(), coreConnector.self.privateKey, coreConnector.self.publicKey), 0);
            }
            if (struct.signature != null) {
                signedChannel.set(struct.signature, 0);
            }
        }
        else if (arr != null && struct != null) {
            signedChannel = new SignedChannel(arr);
            if (struct.channel != null) {
                if (!utils_1.u8aEquals(signedChannel.channel.toU8a(), new Uint8Array(signedChannel.channel.toU8a().length).fill(0x00)) &&
                    !signedChannel.channel.eq(struct.channel)) {
                    throw Error(`Argument mismatch. Please make sure the encoded channel in the array is the same as the one given throug struct.`);
                }
                signedChannel.set(struct.channel.toU8a(), signature_1.Signature.SIZE);
            }
            if (struct.signature != null) {
                signedChannel.set(struct.signature, 0);
            }
            else {
                signedChannel.signature.set(await utils_1.sign(signedChannel.channel.toU8a(), coreConnector.self.privateKey, coreConnector.self.publicKey), 0);
            }
        }
        else {
            throw Error(`Invalid input parameters.`);
        }
        return signedChannel;
    }
    async verify(coreConnector) {
        return await utils_1.verify(this.channel.toU8a(), this.signature, coreConnector.self.publicKey);
    }
    static get SIZE() {
        return signature_1.Signature.SIZE + channel_1.ChannelBalance.SIZE + 1;
    }
}
exports.SignedChannel = SignedChannel;

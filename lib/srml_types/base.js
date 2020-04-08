"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const types_1 = require("@polkadot/types");
class Balance extends types_1.u128 {
    static get SIZE() {
        return 16;
    }
    static get SYMBOL() {
        return `HOPR`;
    }
    static get DECIMALS() {
        return 18;
    }
}
exports.Balance = Balance;
class Moment extends types_1.u64 {
    static get SIZE() {
        return 8;
    }
}
exports.Moment = Moment;
class Hash extends types_1.H256 {
    static get SIZE() {
        return 32;
    }
}
exports.Hash = Hash;
class Public extends types_1.H256 {
    static get SIZE() {
        return 32;
    }
}
exports.Public = Public;
class AccountId extends Public {
    static get SIZE() {
        return 32;
    }
}
exports.AccountId = AccountId;
class TicketEpoch extends types_1.u32 {
    static get SIZE() {
        return 32;
    }
}
exports.TicketEpoch = TicketEpoch;
class ChannelId extends types_1.H256 {
    static get SIZE() {
        return 32;
    }
}
exports.ChannelId = ChannelId;
class PreImage extends types_1.H256 {
    static get SIZE() {
        return 32;
    }
}
exports.PreImage = PreImage;

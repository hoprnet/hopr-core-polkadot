"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const codec_1 = require("@polkadot/types/codec");
const types_1 = require("@polkadot/types");
const types_2 = require("@polkadot/types");
const base_1 = require("./base");
class ChannelBalance extends codec_1.Struct.with({
    balance: base_1.Balance,
    balance_a: base_1.Balance,
}) {
    static get SIZE() {
        return base_1.Balance.SIZE + base_1.Balance.SIZE;
    }
    static create(arr, struct) {
        const registry = new types_1.TypeRegistry();
        registry.register(base_1.Balance);
        if (arr != null && struct == null) {
            return new ChannelBalance(registry, new Uint8Array(arr.bytes, arr.offset));
        }
        else if (arr == null && struct != null) {
            return new ChannelBalance(registry, struct);
        }
        else {
            throw Error(`Invalid input parameters.`);
        }
    }
}
exports.ChannelBalance = ChannelBalance;
class Uninitialized extends types_2.Null {
    constructor() {
        super(...arguments);
        this.commonName = 'Uninitialized';
    }
}
exports.Uninitialized = Uninitialized;
class Funded extends ChannelBalance {
    constructor() {
        super(...arguments);
        this.commonName = 'Funded';
    }
    toString() {
        return `{\n\tbalance: ${this.balance.toString()},\n\tbalance_a: ${this.balance_a.toString()}\n}`;
    }
}
exports.Funded = Funded;
class Active extends ChannelBalance {
    constructor() {
        super(...arguments);
        this.commonName = 'Active';
    }
    toString() {
        return `{\n\tbalance: ${this.balance.toString()},\n\tbalance_a: ${this.balance_a.toString()}\n}`;
    }
}
exports.Active = Active;
class PendingSettlement extends codec_1.Tuple.with([ChannelBalance, base_1.Moment]) {
    constructor() {
        super(...arguments);
        this.commonName = 'PendingSettlement';
    }
    toString() {
        return `{\n\tbalance: ${this[0].balance.toString()},\n\tbalance_a: ${this[0].balance_a.toString()},\n\tmoment: ${this[1].toString()}\n}`;
    }
}
exports.PendingSettlement = PendingSettlement;
class Channel extends codec_1.Enum.with({
    Uninitialized,
    Funded,
    Active,
    PendingSettlement,
}) {
    constructor(registry, value) {
        if (value instanceof Uint8Array) {
            super(registry, value.subarray(1), value.subarray(0, 1)[0]);
            return;
        }
        switch (value.commonName) {
            case 'Uninitialized':
                super(registry, value, 0);
                break;
            case 'Funded':
                super(registry, value, 1);
                break;
            case 'Active':
                super(registry, value, 2);
                break;
            case 'PendingSettlement':
                super(registry, value, 3);
                break;
        }
    }
    toString() {
        let str = '';
        if (this.isUninitialized) {
            str += Uninitialized.name;
        }
        else if (this.isFunded) {
            str += Funded.name;
        }
        else if (this.isActive) {
            str += Active.name;
        }
        else if (this.isPendingSettlement) {
            str += PendingSettlement.name;
        }
        str += this.value.toString();
        return str;
    }
    static createFunded(balance) {
        const registry = new types_1.TypeRegistry();
        return new Channel(registry, new Funded(registry, balance));
    }
    static createActive(balance) {
        const registry = new types_1.TypeRegistry();
        return new Channel(registry, new Active(registry, balance));
    }
    static createPending(moment, balance) {
        const registry = new types_1.TypeRegistry();
        return new Channel(registry, new PendingSettlement(registry, [balance, moment]));
    }
    static get SIZE() {
        throw Error('not implemented');
        return 0;
    }
}
exports.Channel = Channel;

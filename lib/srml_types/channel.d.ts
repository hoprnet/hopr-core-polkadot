import { Struct, Enum, Tuple } from '@polkadot/types/codec';
import type { Registry } from '@polkadot/types/types';
import { Null } from '@polkadot/types';
import { Balance, Moment } from './base';
import type { Types } from '@hoprnet/hopr-core-connector-interface';
import type BN from 'bn.js';
declare type ChannelBalanceConstructor = {
    balance: number | BN;
    balance_a: number | BN;
};
declare const ChannelBalance_base: import("@polkadot/types/types").Constructor<Struct<{
    balance: typeof Balance;
    balance_a: typeof Balance;
}, {
    balance: import("@polkadot/types/types").Codec;
    balance_a: import("@polkadot/types/types").Codec;
}, {
    balance: any;
    balance_a: any;
}, {
    balance: string;
    balance_a: string;
}>>;
declare class ChannelBalance extends ChannelBalance_base {
    balance: Balance;
    balance_a: Balance;
    static get SIZE(): number;
    static create(arr?: {
        bytes: ArrayBuffer;
        offset: number;
    }, struct?: {
        balance: Balance | BN;
        balance_a: Balance | BN;
    }): ChannelBalance;
}
declare class Uninitialized extends Null {
    commonName: string;
}
declare class Funded extends ChannelBalance {
    commonName: string;
    toString(): string;
}
declare class Active extends ChannelBalance {
    commonName: string;
    toString(): string;
}
declare const PendingSettlement_base: import("@polkadot/types/types").Constructor<Tuple>;
declare class PendingSettlement extends PendingSettlement_base {
    commonName: string;
    0: ChannelBalance;
    1: Moment;
    toString(): string;
}
declare const Channel_base: import("@polkadot/types/codec/Enum").EnumConstructor<Enum>;
declare class Channel extends Channel_base implements Types.Channel {
    asUninitialized: Uninitialized;
    asFunded: Funded;
    asActive: Active;
    asPendingSettlement: PendingSettlement;
    isUninitialized: boolean;
    isFunded: boolean;
    isActive: boolean;
    isPendingSettlement: boolean;
    constructor(registry: Registry, value: Uninitialized | Funded | Active | PendingSettlement | Uint8Array);
    toString(): string;
    static createFunded(balance: ChannelBalanceConstructor | ChannelBalance): Channel;
    static createActive(balance: ChannelBalanceConstructor | ChannelBalance): Channel;
    static createPending(moment: BN | Moment, balance: ChannelBalanceConstructor | ChannelBalance): Channel;
    static get SIZE(): number;
}
export { ChannelBalance, Uninitialized, Funded, Active, PendingSettlement, Channel };

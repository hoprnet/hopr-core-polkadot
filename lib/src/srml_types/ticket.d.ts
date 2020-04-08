import { Struct } from '@polkadot/types/codec';
import BN from 'bn.js';
import { Channel as ChannelInstance } from '../channel';
import { Hash, TicketEpoch, Balance } from './base';
import { SignedTicket } from './signedTicket';
import { Types } from '@hoprnet/hopr-core-connector-interface';
declare const Ticket_base: import("@polkadot/types/types").Constructor<Struct<{
    channelId: typeof Hash;
    challenge: typeof Hash;
    epoch: typeof TicketEpoch;
    amount: typeof Balance;
    winProb: typeof Hash;
    onChainSecret: typeof Hash;
}, {
    channelId: import("@polkadot/types/types").Codec;
    challenge: import("@polkadot/types/types").Codec;
    epoch: import("@polkadot/types/types").Codec;
    amount: import("@polkadot/types/types").Codec;
    winProb: import("@polkadot/types/types").Codec;
    onChainSecret: import("@polkadot/types/types").Codec;
}, {
    channelId: any;
    challenge: any;
    epoch: any;
    amount: any;
    winProb: any;
    onChainSecret: any;
}, {
    channelId: string;
    challenge: string;
    epoch: string;
    amount: string;
    winProb: string;
    onChainSecret: string;
}>>;
declare class Ticket extends Ticket_base implements Types.Ticket {
    channelId: Hash;
    challenge: Hash;
    epoch: TicketEpoch;
    amount: Balance;
    winProb: Hash;
    onChainSecret: Hash;
    getEmbeddedFunds(): BN;
    static get SIZE(): number;
    static create(channel: ChannelInstance, amount: Balance, challenge: Hash, privKey: Uint8Array, pubKey: Uint8Array): Promise<SignedTicket>;
    static verify(channel: ChannelInstance, signedTicket: SignedTicket): Promise<boolean>;
    static submit(channel: ChannelInstance, signedTicket: SignedTicket): Promise<void>;
}
export { Ticket };

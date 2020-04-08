import { Struct } from '@polkadot/types/codec';
import { TicketEpoch, Hash, Public } from './base';
declare const State_base: import("@polkadot/types/types").Constructor<Struct<{
    epoch: typeof TicketEpoch;
    secret: typeof Hash;
    pubkey: typeof Public;
}, {
    epoch: import("@polkadot/types/types").Codec;
    secret: import("@polkadot/types/types").Codec;
    pubkey: import("@polkadot/types/types").Codec;
}, {
    epoch: any;
    secret: any;
    pubkey: any;
}, {
    epoch: string;
    secret: string;
    pubkey: string;
}>>;
declare class State extends State_base {
    secret: Hash;
    pubkey: Public;
    epoch: TicketEpoch;
    static get SIZE(): number;
}
export { State };

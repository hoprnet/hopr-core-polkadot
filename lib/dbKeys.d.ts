import { Hash } from './srml_types';
import type { AccountId } from './srml_types';
import type { ApiPromise } from '@polkadot/api';
export declare function Channel(counterparty: AccountId): Uint8Array;
export declare function ChannelKeyParse(arr: Uint8Array, api: ApiPromise): AccountId;
export declare function Challenge(channelId: Hash, challenge: Hash): Uint8Array;
export declare function ChallengeKeyParse(arr: Uint8Array, api: ApiPromise): [Hash, Hash];
export declare function ChannelId(signatureHash: Hash): Uint8Array;
export declare function Nonce(channelId: Hash, nonce: Hash): Uint8Array;
export declare function OnChainSecret(): Uint8Array;
export declare function Ticket(channelId: Hash, challenge: Hash): Uint8Array;

import { Hash, AccountId } from './srml_types';
import { ApiPromise } from '@polkadot/api';
import { DbKeys as IDbKeys } from '@hoprnet/hopr-core-connector-interface';
export default class DbKeys implements IDbKeys {
    Channel(counterparty: AccountId): Uint8Array;
    ChannelKeyParse(arr: Uint8Array, api: ApiPromise): AccountId;
    Challenge(channelId: Hash, challenge: Hash): Uint8Array;
    ChallengeKeyParse(arr: Uint8Array, api: ApiPromise): [Hash, Hash];
    ChannelId(signatureHash: Hash): Uint8Array;
    Nonce(channelId: Hash, nonce: Hash): Uint8Array;
    OnChainSecret(): Uint8Array;
    Ticket(channelId: Hash, challenge: Hash): Uint8Array;
}

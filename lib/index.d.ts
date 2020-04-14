import { ApiPromise } from '@polkadot/api';
import type { KeyringPair } from '@polkadot/keyring/types';
import type { LevelUp } from 'levelup';
import { EventSignalling } from './events';
import { Types, Balance, NativeBalance } from './srml_types';
import * as Utils from './utils';
import * as Constants from './constants';
import HoprCoreConnector, { Utils as IUtils, Types as ITypes, Channel as IChannel, DbKeys as IDbKeys } from '@hoprnet/hopr-core-connector-interface';
export { Types, Utils };
export declare type HoprPolkadotProps = {
    self: KeyringPair;
    api: ApiPromise;
    db: LevelUp;
};
export declare type HoprKeyPair = {
    privateKey: Uint8Array;
    publicKey: Uint8Array;
    onChainKeyPair: KeyringPair;
};
declare class HoprPolkadot implements HoprCoreConnector {
    api: ApiPromise;
    self: HoprKeyPair;
    db: LevelUp;
    private _started;
    private _nonce?;
    eventSubscriptions: EventSignalling;
    constructor(api: ApiPromise, self: HoprKeyPair, db: LevelUp);
    /**
     * Returns the current account nonce and lazily caches the result.
     */
    get nonce(): Promise<number>;
    /**
     * Starts the connector and initializes the internal state.
     */
    start(): Promise<void>;
    get started(): boolean;
    /**
     * Initializes the values that we store per user on-chain.
     * @param nonce set nonce manually for batch operations
     */
    initOnchainValues(nonce?: number): Promise<void>;
    /**
     * Stops the connector and interrupts the communication with the blockchain.
     */
    stop(): Promise<void>;
    /**
     * Returns the current account balance.
     */
    get accountBalance(): Promise<Balance>;
    /**
     * Returns the current account balance.
     */
    get accountNativeBalance(): Promise<NativeBalance>;
    readonly utils: typeof IUtils;
    readonly types: typeof ITypes;
    readonly channel: typeof IChannel;
    readonly dbKeys: typeof IDbKeys;
    readonly constants: typeof Constants;
    static constants: typeof Constants;
    /**
     * Creates an uninitialised instance.
     *
     * @param db database instance
     */
    static create(db: LevelUp, seed?: Uint8Array, options?: {
        id: number;
        provider: string;
    }): Promise<HoprPolkadot>;
}
export default HoprPolkadot;

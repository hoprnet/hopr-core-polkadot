import { ApiPromise } from '@polkadot/api';
import { KeyringPair } from '@polkadot/keyring/types';
import { LevelUp } from 'levelup';
import { EventSignalling } from './events';
import { Types, Balance, Ticket } from './srml_types';
import * as Utils from './utils';
import DbKeysClass from './dbKeys';
import ConstantsClass from './constants';
import { Channel } from './channel';
import { HoprCoreConnectorInstance } from '@hoprnet/hopr-core-connector-interface';
declare const DbKeys: DbKeysClass;
declare const Constants: ConstantsClass;
export { Utils, DbKeys, Constants, Channel, Types, Ticket };
export declare type HoprPolkadotProps = {
    self: KeyringPair;
    api: ApiPromise;
    db: LevelUp;
};
export declare type HoprKeyPair = {
    privateKey: Uint8Array;
    publicKey: Uint8Array;
    keyPair: KeyringPair;
};
export default class HoprPolkadotClass implements HoprCoreConnectorInstance {
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
    readonly utils: typeof Utils;
    readonly types: {
        AccountId: typeof import("./srml_types/base").AccountId;
        Balance: typeof Balance;
        ChannelId: typeof import("./srml_types/base").ChannelId;
        PreImage: typeof import("./srml_types/base").PreImage;
        Moment: typeof import("./srml_types/base").Moment;
        Hash: typeof import("./srml_types/base").Hash;
        Public: typeof import("./srml_types/base").Public;
        ChannelBalance: typeof import("./srml_types/channel").ChannelBalance;
        Channel: typeof import("./srml_types/channel").Channel;
        Funded: typeof import("./srml_types/channel").Funded;
        State: typeof import("./srml_types/state").State;
        Ticket: typeof Ticket;
        TicketEpoch: typeof import("./srml_types/base").TicketEpoch;
        SignedChannel: typeof import("./srml_types/signedChannel").SignedChannel;
        SignedTicket: typeof import("./srml_types/signedTicket").SignedTicket;
        Signature: typeof import("./srml_types/signature").Signature;
    };
    readonly channel: typeof Channel;
    readonly dbKeys: DbKeysClass;
    readonly constants: ConstantsClass;
    readonly CHAIN_NAME = "HOPR on Polkadot";
    /**
     * Creates an uninitialised instance.
     *
     * @param db database instance
     */
    static create(db: LevelUp, seed?: Uint8Array, options?: {
        id: number;
        provider: string;
    }): Promise<HoprPolkadotClass>;
}

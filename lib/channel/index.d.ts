import type { Channel as ChannelEnum, ChannelBalance, Balance, Signature } from '../srml_types';
import { SignedChannel, Hash } from '../srml_types';
import type { Moment, AccountId } from '@polkadot/types/interfaces';
import type HoprPolkadot from '..';
import { Channel as ChannelInstance, Types } from '@hoprnet/hopr-core-connector-interface';
declare class Channel implements ChannelInstance<HoprPolkadot> {
    coreConnector: HoprPolkadot;
    counterparty: AccountId;
    private _signedChannel;
    private _settlementWindow?;
    private _channelId?;
    constructor(coreConnector: HoprPolkadot, counterparty: AccountId, signedChannel: SignedChannel);
    get offChainCounterparty(): Promise<Uint8Array>;
    get channelId(): Promise<Hash>;
    private get channel();
    get settlementWindow(): Promise<Moment>;
    get state(): Promise<ChannelEnum>;
    get balance_a(): Promise<Balance>;
    get balance(): Promise<Balance>;
    get currentBalance(): Promise<Balance>;
    get currentBalanceOfCounterparty(): Promise<Balance>;
    ticket: typeof Types.Ticket;
    /**
     * Initiates the settlement of this payment channel.
     * @returns a Promise that resolves once the payment channel is settled, otherwise
     * it rejects the Promise with an error.
     */
    initiateSettlement(): Promise<void>;
    getPreviousChallenges(): Promise<Hash>;
    /**
     * Checks if there exists a payment channel with `counterparty`.
     * @param coreConnector the CoreConnector instance
     * @param counterparty secp256k1 public key of the counterparty
     */
    static isOpen(coreConnector: HoprPolkadot, counterparty: AccountId): Promise<boolean>;
    /**
     * Checks whether the channel is open and opens that channel if necessary.
     * @param coreConnector the connector instance
     * @param offChainCounterparty public key used off-chain
     * @param getOnChainPublicKey yields the on-chain identity
     * @param channelBalance desired channel balance
     * @param sign signing provider
     */
    static create(coreConnector: HoprPolkadot, offChainCounterparty: Uint8Array, getOnChainPublicKey: (counterparty: Uint8Array) => Promise<Uint8Array>, channelBalance?: ChannelBalance, sign?: (channelBalance: ChannelBalance) => Promise<Types.SignedChannel<ChannelEnum, Signature>>): Promise<Channel>;
    /**
     * Handles the opening request received by another HOPR node.
     * @param hoprPolkadot the connector instance
     */
    static handleOpeningRequest(hoprPolkadot: HoprPolkadot): (source: AsyncIterable<Uint8Array>) => AsyncIterator<Uint8Array>;
    /**
     * Get all channels from the database.
     * @param coreConnector the connector instance
     * @param onData function that is applied on every entry, cf. `map`
     * @param onEnd function that is applied at the end, cf. `reduce`
     */
    static getAll<T, R>(coreConnector: HoprPolkadot, onData: (channel: Channel) => Promise<T>, onEnd: (promises: Promise<T>[]) => R): Promise<R>;
    /**
     * Tries to close all channels and returns the finally received funds.
     * @notice returns `0` if there are no open channels and/or we have not received any funds.
     * @param coreConnector the connector instance
     */
    static closeChannels(coreConnector: HoprPolkadot): Promise<Balance>;
    /**
     * Checks whether this signature has already been used.
     * @param signature signature to check
     */
    testAndSetNonce(signature: Uint8Array): Promise<void>;
}
export { Channel };

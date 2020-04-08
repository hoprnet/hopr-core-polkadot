import type { Hash, AccountId, Moment } from '../srml_types';
import type HoprPolkadot from '..';
declare type ChannelSettlerProps = {
    hoprPolkadot: HoprPolkadot;
    counterparty: AccountId;
    channelId: Hash;
    settlementWindow: Moment;
};
export declare class ChannelSettler {
    hoprPolkadot: HoprPolkadot;
    counterparty: AccountId;
    channelId: Hash;
    settlementWindow: Moment;
    private _end?;
    unsubscribeChannelListener?: () => void;
    get end(): Promise<Moment>;
    private handlers;
    private unsubscribePushback;
    private constructor();
    static create(props: ChannelSettlerProps): Promise<ChannelSettler>;
    init(): Promise<ChannelSettler>;
    onceClosed(): Promise<void>;
    withdraw(): Promise<void>;
    private timeoutFactory;
}
export {};

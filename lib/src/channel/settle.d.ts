import { Hash, AccountId, Moment } from '../srml_types';
import HoprPolkadot from '..';
declare type ChannelSettlerProps = {
    hoprPolkadot: HoprPolkadot;
    counterparty: AccountId;
    channelId: Hash;
    settlementWindow: Moment;
};
export declare class ChannelSettler {
    private props;
    private _end?;
    timer?: () => void;
    get end(): Promise<Moment>;
    private handlers;
    private constructor();
    static create(props: ChannelSettlerProps): Promise<ChannelSettler>;
    init(): Promise<ChannelSettler>;
    onceClosed(): Promise<void>;
    withdraw(): Promise<void>;
    private timeoutFactory;
    private cleanHandlers;
}
export {};

import { Hash, Balance } from './srml_types';
import { ApiPromise } from '@polkadot/api';
import { Event } from '@polkadot/types/interfaces';
export declare type EventHandler = (event: Event) => void;
declare type SubscriptionArgs = Map<number, Uint8Array>;
declare type EventSubscription = {
    args: SubscriptionArgs;
    handlers: (EventHandler | undefined)[];
};
declare type ArgumentSelector = Map<string, EventSubscription[]>;
declare type EventRegistry = {
    selectors?: Map<number, ArgumentSelector>;
    handlers?: (EventHandler | undefined)[];
};
export declare class EventSignalling {
    registry: {
        [sectionMethod: string]: EventRegistry;
    };
    constructor(api: ApiPromise);
    dispatch(event: Event): void;
    on(eventSubscription: HoprEventSubscription, handler: EventHandler): () => void;
    once(str: HoprEventSubscription, handler: EventHandler): void;
    private removeHandler;
}
export declare type HoprEventSubscription = {
    selector: string;
    args?: SubscriptionArgs;
};
export declare function Opened(channelId?: Hash, balanceA?: Balance, balance?: Balance): HoprEventSubscription;
export declare function InitiatedSettlement(channelId: Hash, balanceA?: Balance): HoprEventSubscription;
export declare function PushedBackSettlement(channelId: Hash, balanceA?: Balance): {
    selector: string;
    args: Map<number, Uint8Array>;
} | {
    selector: string;
    args?: undefined;
};
export {};

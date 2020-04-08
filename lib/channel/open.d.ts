import type { Balance, AccountId, Channel as ChannelEnum, Hash } from '../srml_types';
import { SignedChannel } from '../srml_types';
import { EventHandler } from '../events';
import type HoprPolkadot from '..';
declare class ChannelOpener {
    private hoprPolkadot;
    private counterparty;
    channelId: Hash;
    private constructor();
    static handleOpeningRequest(hoprPolkadot: HoprPolkadot): (source: AsyncIterable<Uint8Array>) => AsyncIterator<Uint8Array>;
    static create(hoprPolkadot: HoprPolkadot, counterparty: AccountId, channelId: Hash): Promise<ChannelOpener>;
    increaseFunds(newAmount: Balance): Promise<ChannelOpener>;
    onceOpen(): Promise<ChannelOpener>;
    onceFundedByCounterparty(channel: ChannelEnum, handler?: EventHandler): Promise<void | ChannelOpener>;
    setActive(signedChannel: SignedChannel): Promise<ChannelOpener>;
}
export { ChannelOpener };

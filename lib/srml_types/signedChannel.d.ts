import { Signature } from './signature';
import { Channel } from './channel';
import type { Types } from '@hoprnet/hopr-core-connector-interface';
import type HoprPolkadot from '../';
declare class SignedChannel extends Uint8Array implements Types.SignedChannel<Channel, Signature> {
    private registry;
    private _signature?;
    private _channel?;
    constructor(arr?: {
        bytes: ArrayBuffer;
        offset: number;
    }, struct?: {
        signature: Signature;
        channel: Channel;
    });
    subarray(begin?: number, end?: number): Uint8Array;
    get signature(): Signature;
    get channel(): Channel;
    get signer(): Promise<Uint8Array>;
    static create(coreConnector: HoprPolkadot, arr?: {
        bytes: ArrayBuffer;
        offset: number;
    }, struct?: {
        channel: Channel;
        signature?: Signature;
    }): Promise<SignedChannel>;
    verify(coreConnector: HoprPolkadot): Promise<boolean>;
    static get SIZE(): number;
}
export { SignedChannel };

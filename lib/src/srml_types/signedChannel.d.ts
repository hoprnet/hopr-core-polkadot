import { Signature } from './signature';
import { Channel } from './channel';
declare class SignedChannel extends Uint8Array {
    private registry;
    private _signature?;
    constructor(arr?: Uint8Array, struct?: {
        signature: Signature;
        channel: Channel;
    });
    subarray(begin?: number, end?: number): Uint8Array;
    get signature(): Signature;
    set signature(newSignature: Signature);
    get channel(): Channel;
    static get SIZE(): number;
    get signer(): any;
    toU8a(): Uint8Array;
}
export { SignedChannel };

import type { Types } from '@hoprnet/hopr-core-connector-interface';
declare class Signature extends Uint8Array implements Types.Signature {
    constructor(arr?: {
        bytes: ArrayBuffer;
        offset: number;
    }, struct?: {
        secp256k1Signature: Uint8Array;
        secp256k1Recovery: number;
        sr25519PublicKey: Uint8Array;
        sr25519Signature: Uint8Array;
    });
    static create(arr?: {
        bytes: ArrayBuffer;
        offset: number;
    }, struct?: {
        secp256k1Signature: Uint8Array;
        secp256k1Recovery: number;
        sr25519PublicKey: Uint8Array;
        sr25519Signature: Uint8Array;
    }): Signature;
    get secp256k1Signature(): Uint8Array;
    get secp256k1Recovery(): Uint8Array;
    get sr25519PublicKey(): Uint8Array;
    get sr25519Signature(): Uint8Array;
    get signature(): Uint8Array;
    get msgPrefix(): Uint8Array;
    get recovery(): number;
    get onChainSignature(): Uint8Array;
    subarray(begin?: number, end?: number): Uint8Array;
    static get SIZE(): number;
}
export { Signature };

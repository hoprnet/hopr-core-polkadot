"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const util_1 = require("@polkadot/util");
const SECP256K1_SIGNATURE_LENGTH = 64;
const SECP256K1_SIGNATURE_RECOVERY_LENGTH = 1;
const SR25519_PUBLIC_KEY_LENGTH = 32;
const SR25519_SIGNATURE_LENGTH = 64;
class Signature extends Uint8Array {
    constructor(arr, struct) {
        if (arr == null && struct != null) {
            super(util_1.u8aConcat(struct.secp256k1Signature, new Uint8Array([struct.secp256k1Recovery]), struct.sr25519PublicKey, struct.sr25519Signature));
        }
        else if (arr != null && struct == null) {
            super(arr.bytes, arr.offset, Signature.SIZE);
        }
        else {
            throw Error('Invalid constructor arguments.');
        }
    }
    get secp256k1Signature() {
        return this.subarray(0, SECP256K1_SIGNATURE_LENGTH);
    }
    get secp256k1Recovery() {
        return this.subarray(SECP256K1_SIGNATURE_LENGTH, SECP256K1_SIGNATURE_LENGTH + SECP256K1_SIGNATURE_RECOVERY_LENGTH);
    }
    get sr25519PublicKey() {
        return this.subarray(SECP256K1_SIGNATURE_LENGTH + SECP256K1_SIGNATURE_RECOVERY_LENGTH, SECP256K1_SIGNATURE_LENGTH + SECP256K1_SIGNATURE_RECOVERY_LENGTH + SR25519_PUBLIC_KEY_LENGTH);
    }
    get sr25519Signature() {
        return this.subarray(SECP256K1_SIGNATURE_LENGTH + SECP256K1_SIGNATURE_RECOVERY_LENGTH + SR25519_PUBLIC_KEY_LENGTH, SECP256K1_SIGNATURE_LENGTH +
            SECP256K1_SIGNATURE_RECOVERY_LENGTH +
            SR25519_PUBLIC_KEY_LENGTH +
            SR25519_SIGNATURE_LENGTH);
    }
    get signature() {
        return this.secp256k1Signature;
    }
    get msgPrefix() {
        return this.sr25519PublicKey;
    }
    get recovery() {
        return this.secp256k1Recovery[0];
    }
    get onChainSignature() {
        return this.sr25519Signature;
    }
    subarray(begin = 0, end) {
        return new Uint8Array(this.buffer, begin + this.byteOffset, end != null ? end - begin : undefined);
    }
    static get SIZE() {
        return (SECP256K1_SIGNATURE_LENGTH +
            SECP256K1_SIGNATURE_RECOVERY_LENGTH +
            SR25519_PUBLIC_KEY_LENGTH +
            SR25519_SIGNATURE_LENGTH);
    }
}
exports.Signature = Signature;
//# sourceMappingURL=signature.js.map
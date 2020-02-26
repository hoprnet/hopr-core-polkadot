import { u8aConcat } from '@polkadot/util'

import { Types } from '@hoprnet/hopr-core-connector-interface'

const SECP256K1_SIGNATURE_LENGTH = 64
const SECP256K1_SIGNATURE_RECOVERY_LENGTH = 1
const SR25519_PUBLIC_KEY_LENGTH = 32
const SR25519_SIGNATURE_LENGTH = 64

class Signature extends Uint8Array implements Types.Signature {
  constructor(
    arr?: {
      bytes: ArrayBuffer
      offset: number
    },
    struct?: {
      secp256k1Signature: Uint8Array
      secp256k1Recovery: number
      sr25519PublicKey: Uint8Array
      sr25519Signature: Uint8Array
    }
  ) {
    if (arr == null && struct != null) {
      super(
        u8aConcat(
          struct.secp256k1Signature,
          new Uint8Array([struct.secp256k1Recovery]),
          struct.sr25519PublicKey,
          struct.sr25519Signature
        )
      )
    } else if (arr != null && struct == null) {
      super(arr.bytes, arr.offset, Signature.SIZE)
    } else {
      throw Error('Invalid constructor arguments.')
    }
  }

  get secp256k1Signature(): Uint8Array {
    return this.subarray(0, SECP256K1_SIGNATURE_LENGTH)
  }

  get secp256k1Recovery(): Uint8Array {
    return this.subarray(SECP256K1_SIGNATURE_LENGTH, SECP256K1_SIGNATURE_LENGTH + SECP256K1_SIGNATURE_RECOVERY_LENGTH)
  }

  get sr25519PublicKey(): Uint8Array {
    return this.subarray(
      SECP256K1_SIGNATURE_LENGTH + SECP256K1_SIGNATURE_RECOVERY_LENGTH,
      SECP256K1_SIGNATURE_LENGTH + SECP256K1_SIGNATURE_RECOVERY_LENGTH + SR25519_PUBLIC_KEY_LENGTH
    )
  }

  get sr25519Signature(): Uint8Array {
    return this.subarray(
      SECP256K1_SIGNATURE_LENGTH + SECP256K1_SIGNATURE_RECOVERY_LENGTH + SR25519_PUBLIC_KEY_LENGTH,
      SECP256K1_SIGNATURE_LENGTH +
        SECP256K1_SIGNATURE_RECOVERY_LENGTH +
        SR25519_PUBLIC_KEY_LENGTH +
        SR25519_SIGNATURE_LENGTH
    )
  }

  get signature(): Uint8Array {
    return this.secp256k1Signature
  }

  get msgPrefix(): Uint8Array {
    return this.sr25519PublicKey
  }

  get recovery(): number {
    return this.secp256k1Recovery[0]
  }

  get onChainSignature(): Uint8Array {
    return this.sr25519Signature
  }

  subarray(begin: number = 0, end: number = Signature.SIZE): Uint8Array {
    return new Uint8Array(this.buffer, begin + this.byteOffset, end - begin)
  }

  static get SIZE() {
    return (
      SECP256K1_SIGNATURE_LENGTH +
      SECP256K1_SIGNATURE_RECOVERY_LENGTH +
      SR25519_PUBLIC_KEY_LENGTH +
      SR25519_SIGNATURE_LENGTH
    )
  }
}

export { Signature }

import secp256k1 from 'secp256k1'

import { u8aConcat } from '@polkadot/util'
import { TypeRegistry } from '@polkadot/types'

import { Signature } from './signature'
import { Channel, Funded, Uninitialized, Active, PendingSettlement, ChannelBalance } from './channel'
import { Balance, Moment } from './base'

class SignedChannel extends Uint8Array {
  private registry: TypeRegistry
  private _signature?: Signature

  constructor(
    arr?: Uint8Array,
    struct?: {
      signature: Signature
      channel: Channel
    }
  ) {
    if (arr != null && struct == null) {
      super(arr)
    } else if (arr == null && struct != null) {
      super(u8aConcat(struct.signature, struct.channel.toU8a()))
    } else {
      throw Error(`Invalid constructor arguments.`)
    }

    this.registry = new TypeRegistry()
    this.registry.register({
      Channel,
      Funded,
      Uninitialized,
      Active,
      PendingSettlement,
      ChannelBalance,
      Balance,
      Moment
    })
  }

  subarray(begin: number = 0, end?: number): Uint8Array {
    return new Uint8Array(this.buffer, begin + this.byteOffset, end != null ? end - begin : undefined)
  }

  get signature(): Signature {
    if (this._signature == null) {
      this._signature = new Signature({
        bytes: this.buffer,
        offset: this.byteOffset
      })
    }

    return this._signature
  }

  set signature(newSignature: Signature) {
    this.set(newSignature, 0)
  }

  // TODO: Only expecting Funded or Active Channels
  get channel(): Channel {
    return new Channel(this.registry, this.subarray(Signature.SIZE, Signature.SIZE + ChannelBalance.SIZE + 1))
  }

  static get SIZE() {
    return Signature.SIZE + ChannelBalance.SIZE + 1
  }

  get signer() {
    // @ts-ignore
    return secp256k1.ecdsaRecover(this.signature.signature, this.signature.recovery, this.signature.sr25519PublicKey)
  }

  toU8a(): Uint8Array {
    return new Uint8Array(this.buffer, 0, SignedChannel.SIZE)
  }
}

export { SignedChannel }

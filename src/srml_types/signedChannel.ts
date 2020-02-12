import secp256k1 from 'secp256k1'

import { u8aConcat } from '@polkadot/util'
import { TypeRegistry } from '@polkadot/types'

import { Signature } from './signature'
import { Channel, Funded, Uninitialized, Active, PendingSettlement, ChannelBalance } from './channel'
import { Balance, Moment } from './base'

class SignedChannel extends Uint8Array {
  private registry: TypeRegistry
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

  subarray(begin: number, end?: number): Uint8Array {
    return new Uint8Array(this.buffer, begin, end != null ? end - begin : undefined)
  }

  get signature(): Signature {
    return new Signature(this.subarray(0, Signature.SIZE))
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
    return secp256k1.recover(
      Buffer.from(this.signature.sr25519PublicKey),
      Buffer.from(this.signature.signature),
      this.signature.recovery
    )
  }

  toU8a(): Uint8Array {
    return new Uint8Array(this.buffer, 0, SignedChannel.SIZE)
  }
}

export { SignedChannel }

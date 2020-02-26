import secp256k1 from 'secp256k1'

import { u8aConcat } from '@polkadot/util'
import { TypeRegistry } from '@polkadot/types'

import { Signature } from './signature'
import { Channel, Funded, Uninitialized, Active, PendingSettlement, ChannelBalance } from './channel'
import { Balance, Moment } from './base'

import { Types } from '@hoprnet/hopr-core-connector-interface'

class SignedChannel extends Uint8Array implements Types.SignedChannel {
  private registry: TypeRegistry
  private _signature?: Signature
  private _channel?: Channel

  constructor(
    arr?: {
      bytes: ArrayBuffer
      offset: number
    },
    struct?: {
      signature: Signature
      channel: Channel
    }
  ) {
    if (arr != null && struct == null) {
      super(arr.bytes, arr.offset, SignedChannel.SIZE)
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

  subarray(begin: number = 0, end: number = SignedChannel.SIZE): Uint8Array {
    return new Uint8Array(this.buffer, begin + this.byteOffset, end - begin)
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
    if (this._channel == null) {
      this._channel = new Channel(
        this.registry,
        this.subarray(Signature.SIZE, Signature.SIZE + ChannelBalance.SIZE + 1)
      )
    }

    return this._channel
  }

  static get SIZE() {
    return Signature.SIZE + ChannelBalance.SIZE + 1
  }

  get signer() {
    return secp256k1.ecdsaRecover(this.signature.signature, this.signature.recovery, this.signature.sr25519PublicKey)
  }
}

export { SignedChannel }

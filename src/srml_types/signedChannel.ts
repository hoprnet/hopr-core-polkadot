import secp256k1 from 'secp256k1'

import { u8aConcat } from '@polkadot/util'
import { TypeRegistry } from '@polkadot/types'

import { Signature } from './signature'
import { Channel, Funded, Uninitialized, Active, PendingSettlement, ChannelBalance } from './channel'
import { Balance, Moment } from './base'
import { verify, sign } from '../utils'

import type { Types } from '@hoprnet/hopr-core-connector-interface'

import type HoprPolkadot from '../'

class SignedChannel extends Uint8Array implements Types.SignedChannel<Signature> {
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

  get signer() {
    return secp256k1.ecdsaRecover(this.signature.signature, this.signature.recovery, this.signature.sr25519PublicKey)
  }

  static async create(coreConnector: HoprPolkadot, channel: Channel, arr?: {
    bytes: ArrayBuffer,
    offset: number
  }): Promise<SignedChannel> {
    const signature = await sign(channel.toU8a(), coreConnector.self.privateKey, coreConnector.self.publicKey)

    if (arr != null) {
      const signedChannel = new SignedChannel(arr)
      signedChannel.signature.set(signature, 0)
      signedChannel.set(channel.toU8a(), Signature.SIZE)

      return signedChannel
    }

    return new SignedChannel(undefined, {
      signature,
      channel
    })
  }
  
  async verify(coreConnector: HoprPolkadot) {
    return await verify(this.channel.toU8a(), this.signature, coreConnector.self.publicKey)
  }


  static get SIZE() {
    return Signature.SIZE + ChannelBalance.SIZE + 1
  }

}

export { SignedChannel }

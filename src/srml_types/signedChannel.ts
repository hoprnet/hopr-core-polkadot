import secp256k1 from 'secp256k1'

import { u8aConcat } from '@polkadot/util'
import { TypeRegistry } from '@polkadot/types'

import { Signature } from './signature'
import { Channel, Funded, Uninitialized, Active, PendingSettlement, ChannelBalance } from './channel'
import { Balance, Moment } from './base'
import { verify, sign, u8aEquals, hash } from '../utils'

import type { Types } from '@hoprnet/hopr-core-connector-interface'

import type HoprPolkadot from '../'

class SignedChannel extends Uint8Array implements Types.SignedChannel<Channel, Signature> {
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
      Moment,
    })
  }

  subarray(begin: number = 0, end: number = SignedChannel.SIZE): Uint8Array {
    return new Uint8Array(this.buffer, begin + this.byteOffset, end - begin)
  }

  get signature(): Signature {
    if (this._signature == null) {
      this._signature = new Signature({
        bytes: this.buffer,
        offset: this.byteOffset,
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

  get signer(): Promise<Uint8Array> {
    return new Promise<Uint8Array>(async (resolve) =>
      resolve(
        secp256k1.ecdsaRecover(
          this.signature.signature,
          this.signature.recovery,
          await hash(u8aConcat(this.signature.sr25519PublicKey, this.channel.toU8a()))
        )
      )
    )
  }

  static async create(
    coreConnector: HoprPolkadot,
    arr?: {
      bytes: ArrayBuffer
      offset: number
    },
    struct?: {
      channel: Channel
      signature?: Signature
    }
  ): Promise<SignedChannel> {
    let signedChannel: SignedChannel
    if (arr != null && struct == null) {
      signedChannel = new SignedChannel(arr)

      if (u8aEquals(signedChannel.signature, new Uint8Array(Signature.SIZE).fill(0x00))) {
        signedChannel.set(
          await sign(signedChannel.channel.toU8a(), coreConnector.self.privateKey, coreConnector.self.publicKey),
          0
        )
      }
    } else if (arr == null && struct != null) {
      const array = new Uint8Array(SignedChannel.SIZE).fill(0x00)
      signedChannel = new SignedChannel({
        bytes: array.buffer,
        offset: array.byteOffset,
      })

      signedChannel.set(struct.channel.toU8a(), Signature.SIZE)

      if (struct.signature == null || u8aEquals(struct.signature, new Uint8Array(Signature.SIZE).fill(0x00))) {
        signedChannel.signature.set(
          await sign(signedChannel.channel.toU8a(), coreConnector.self.privateKey, coreConnector.self.publicKey),
          0
        )
      }

      if (struct.signature != null) {
        signedChannel.set(struct.signature, 0)
      }
    } else if (arr != null && struct != null) {
      signedChannel = new SignedChannel(arr)

      if (struct.channel != null) {
        if (
          !u8aEquals(signedChannel.channel.toU8a(), new Uint8Array(signedChannel.channel.toU8a().length).fill(0x00)) &&
          !signedChannel.channel.eq(struct.channel)
        ) {
          throw Error(
            `Argument mismatch. Please make sure the encoded channel in the array is the same as the one given throug struct.`
          )
        }

        signedChannel.set(struct.channel.toU8a(), Signature.SIZE)
      }

      if (struct.signature != null) {
        signedChannel.set(struct.signature, 0)
      } else {
        signedChannel.signature.set(
          await sign(signedChannel.channel.toU8a(), coreConnector.self.privateKey, coreConnector.self.publicKey),
          0
        )
      }
    } else {
      throw Error(`Invalid input parameters.`)
    }

    return signedChannel
  }

  async verify(coreConnector: HoprPolkadot) {
    return await verify(this.channel.toU8a(), this.signature, coreConnector.self.publicKey)
  }

  static get SIZE() {
    return Signature.SIZE + ChannelBalance.SIZE + 1
  }
}

export { SignedChannel }

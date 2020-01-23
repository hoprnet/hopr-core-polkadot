import { Hash, Ticket, Channel as ChannelEnum, Balance, Signature } from '../srml_types'
import { blake2b, waitReady } from '@polkadot/wasm-crypto'
import { Moment, AccountId } from '@polkadot/types/interfaces'
import { ChannelSettler } from './settle'
import { ChannelOpener } from './open'
import { createTypeUnsafe } from '@polkadot/types'

import { HoprPolkadotClass } from '..'

const NONCE_HASH_KEY = Uint8Array.from(new TextEncoder().encode('Nonce'))

import { ChannelInstance } from '@hoprnet/hopr-core-connector-interface'

export class Channel implements ChannelInstance {
  private _channel?: ChannelEnum
  private _settlementWindow?: Moment
  private _channelId?: Hash

  constructor(public hoprPolkadot: HoprPolkadotClass, public counterparty: AccountId, channel?: ChannelEnum) {
    if (channel != null) {
      this._channel = channel
    }
  }

  get channelId(): Promise<Hash> {
    if (this._channelId != null) {
      return Promise.resolve<Hash>(this._channelId)
    }

    return new Promise(async (resolve, reject) => {
      try {
        this._channelId = await this.hoprPolkadot.utils.getId(
          this.hoprPolkadot.api.createType('AccountId', this.hoprPolkadot.self.publicKey),
          this.counterparty,
          this.hoprPolkadot.api
        )
      } catch (err) {
        return reject(err)
      }

      resolve(this._channelId)
    })
  }

  private get channel(): Promise<ChannelEnum> {
    if (this._channel != null) {
      return Promise.resolve<ChannelEnum>(this._channel)
    }

    return new Promise<ChannelEnum>(async (resolve, reject) => {
      try {
        this._channel = createTypeUnsafe<ChannelEnum>(this.hoprPolkadot.api.registry, 'Channel', [
          await this.hoprPolkadot.db.get(this.hoprPolkadot.dbKeys.Channel(this.counterparty))
        ])
      } catch (err) {
        return reject(err)
      }

      return resolve(this._channel)
    })
  }

  get settlementWindow(): Promise<Moment> {
    if (this._settlementWindow != null) {
      return Promise.resolve<Moment>(this._settlementWindow)
    }

    return new Promise<Moment>(async (resolve, reject) => {
      try {
        this._settlementWindow = await this.hoprPolkadot.api.query.hopr.pendingWindow<Moment>()
      } catch (err) {
        return reject(err)
      }

      return resolve(this._settlementWindow)
    })
  }

  get state(): Promise<ChannelEnum> {
    return this.channel
  }

  get balance_a(): Promise<Balance> {
    return this.channel.then(channel => {
      switch (channel.type) {
        case 'Funded':
          return channel.asFunded.balance_a
        case 'Active':
          return channel.asActive.balance_a
        case 'PendingSettlement':
          return channel.asPendingSettlement[0].balance_a
        default:
          throw Error(`Invalid state. Got '${channel.type}'`)
      }
    })
  }

  get balance(): Promise<Balance> {
    return this.channel.then(channel => {
      switch (channel.type) {
        case 'Funded':
          return channel.asFunded.balance
        case 'Active':
          return channel.asActive.balance
        case 'PendingSettlement':
          return channel.asPendingSettlement[0].balance
        default:
          throw Error(`Invalid state. Got '${channel.type}'`)
      }
    })
  }

  get currentBalance(): Promise<Balance> {
    if (
      this.hoprPolkadot.utils.isPartyA(
        this.hoprPolkadot.api.createType('AccountId', this.hoprPolkadot.self.publicKey),
        this.counterparty
      )
    ) {
      return Promise.resolve<Balance>(this.balance_a)
    }

    return new Promise<Balance>(async resolve => {
      return resolve(this.hoprPolkadot.api.createType('Balance', (await this.balance).sub(await this.balance_a)))
    })
  }

  get currentBalanceOfCounterparty(): Promise<Balance> {
    if (
      !this.hoprPolkadot.utils.isPartyA(
        this.hoprPolkadot.api.createType('AccountId', this.hoprPolkadot.self.publicKey),
        this.counterparty
      )
    ) {
      return Promise.resolve<Balance>(this.balance_a)
    }
    return new Promise<Balance>(async resolve => {
      return resolve(this.hoprPolkadot.api.createType('Balance', (await this.balance).sub(await this.balance_a)))
    })
  }

  ticket = Ticket

  async initiateSettlement(): Promise<void> {
    let channelSettler: ChannelSettler

    try {
      channelSettler = await ChannelSettler.create({
        hoprPolkadot: this.hoprPolkadot,
        counterparty: this.counterparty,
        channelId: await this.channelId,
        settlementWindow: await this.settlementWindow
      })
    } catch (err) {
      throw err
    }

    await Promise.all([channelSettler.onceClosed().then(() => channelSettler.withdraw()), channelSettler.init()])
  }

  async getPreviousChallenges(): Promise<Hash> {
    let pubKeys: Uint8Array[] = []

    return new Promise<Hash>(async (resolve, reject) => {
      this.hoprPolkadot.db
        .createReadStream({
          gt: this.hoprPolkadot.dbKeys.Challenge(
            await this.channelId,
            this.hoprPolkadot.api.createType('Hash', new Uint8Array(Hash.length).fill(0x00))
          ),
          lt: this.hoprPolkadot.dbKeys.Challenge(
            await this.channelId,
            this.hoprPolkadot.api.createType('Hash', new Uint8Array(Hash.length).fill(0x00))
          )
        })
        .on('error', reject)
        .on('data', ({ key, ownKeyHalf }) => {
          const [channelId, challenge] = this.hoprPolkadot.dbKeys.ChallengeKeyParse(key, this.hoprPolkadot.api)

          // BIG TODO !!
          // replace this by proper EC-arithmetic
          pubKeys.push(this.hoprPolkadot.utils.u8aXOR(false, challenge.toU8a(), ownKeyHalf.toU8a()))
        })
        .on('end', () => {
          if (pubKeys.length > 0) {
            return resolve(this.hoprPolkadot.api.createType('Hash', this.hoprPolkadot.utils.u8aXOR(false, ...pubKeys)))
          }

          resolve()
        })
    })
  }

  static async create(hoprPolkadot: HoprPolkadotClass, counterparty: AccountId): Promise<Channel> {
    let record = await hoprPolkadot.db.get(hoprPolkadot.dbKeys.Channel(counterparty))

    return new Channel(
      hoprPolkadot,
      counterparty,
      createTypeUnsafe<ChannelEnum>(hoprPolkadot.api.registry, 'Channel', record)
    )
  }

  static async open(
    hoprPolkadot: HoprPolkadotClass,
    amount: Balance,
    signature: Promise<Signature>,
    counterparty: AccountId
  ): Promise<Channel> {
    const channelOpener = await ChannelOpener.create(hoprPolkadot, counterparty)

    await channelOpener.increaseFunds(amount)
    await Promise.all([
      /* prettier-ignore */
      channelOpener.onceOpen(),
      channelOpener.setActive(await signature)
    ])

    const channel = new Channel(hoprPolkadot, counterparty)

    await hoprPolkadot.db.put(hoprPolkadot.dbKeys.Channel(counterparty), channel)

    return channel
  }

  static getAll<T, R>(
    hoprPolkadot: HoprPolkadotClass,
    onData: (channel: Channel) => T,
    onEnd: (promises: Promise<T>[]) => R
  ): Promise<R> {
    const promises: Promise<T>[] = []
    return new Promise<R>((resolve, reject) => {
      hoprPolkadot.db
        .createReadStream({
          gt: hoprPolkadot.dbKeys.Channel(hoprPolkadot.api.createType('Hash', new Uint8Array(Hash.length).fill(0x00))),
          lt: hoprPolkadot.dbKeys.Channel(hoprPolkadot.api.createType('Hash', new Uint8Array(Hash.length).fill(0xff)))
        })
        .on('error', err => reject(err))
        .on('data', ({ key, value }) => {
          const channel: ChannelEnum = createTypeUnsafe<ChannelEnum>(hoprPolkadot.api.registry, 'Channel', [value])

          promises.push(
            Promise.resolve(
              onData(new Channel(hoprPolkadot, hoprPolkadot.dbKeys.ChannelKeyParse(key, hoprPolkadot.api), channel))
            )
          )
        })
        .on('end', () => resolve(onEnd(promises)))
    })
  }
  static async closeChannels(hoprPolkadot: HoprPolkadotClass): Promise<Balance> {
    return Channel.getAll(
      hoprPolkadot,
      (channel: Channel) => {
        channel.initiateSettlement()
      },
      async (promises: Promise<void>[]) => {
        return Promise.all(promises).then(() => hoprPolkadot.api.createType('Balance', 0))
      }
    )
  }

  async testAndSetNonce(signature: Uint8Array): Promise<void> {
    await waitReady()
    const nonce = blake2b(signature, NONCE_HASH_KEY, 32)

    const key = this.hoprPolkadot.dbKeys.Nonce(await this.channelId, this.hoprPolkadot.api.createType('Hash', nonce))

    await this.hoprPolkadot.db.get(Buffer.from(key)).then(
      () => {
        throw Error('Nonces must not be used twice.')
      },
      (err: any) => {
        if (err.notFound == null || !err.notFound) {
          throw err
        }
      }
    )
  }
}

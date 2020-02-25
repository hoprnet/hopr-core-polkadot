import { Hash, Ticket, Channel as ChannelEnum, ChannelBalance, Balance, SignedChannel } from '../srml_types'
import { blake2b, waitReady } from '@polkadot/wasm-crypto'
import { Moment, AccountId } from '@polkadot/types/interfaces'
import { ChannelSettler } from './settle'
import { ChannelOpener } from './open'
import { u8aToHex } from '@polkadot/util'

import HoprPolkadot from '..'

const NONCE_HASH_KEY = Uint8Array.from(new TextEncoder().encode('Nonce'))

import { ChannelInstance } from '@hoprnet/hopr-core-connector-interface'
import BN from 'bn.js'

class Channel implements ChannelInstance {
  private _signedChannel: SignedChannel
  private _settlementWindow?: Moment
  private _channelId?: Hash

  constructor(public hoprPolkadot: HoprPolkadot, public counterparty: AccountId, signedChannel: SignedChannel) {
    this._signedChannel = signedChannel
  }

  get offChainCounterparty(): Uint8Array {
    return this._signedChannel.signer
  }

  get channelId(): Promise<Hash> {
    if (this._channelId != null) {
      return Promise.resolve<Hash>(this._channelId)
    }

    return new Promise(async (resolve, reject) => {
      try {
        this._channelId = await this.hoprPolkadot.utils.getId(
          this.hoprPolkadot.api.createType('AccountId', this.hoprPolkadot.self.keyPair.publicKey),
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
    if (this._signedChannel != null) {
      return Promise.resolve<ChannelEnum>(this._signedChannel.channel)
    }

    return new Promise<ChannelEnum>(async (resolve, reject) => {
      try {
        console.log(await this.hoprPolkadot.db.get(this.hoprPolkadot.dbKeys.Channel(this.counterparty)))
        this._signedChannel = new SignedChannel(
          await this.hoprPolkadot.db.get(this.hoprPolkadot.dbKeys.Channel(this.counterparty))
        )
      } catch (err) {
        return reject(err)
      }

      return resolve(this._signedChannel.channel)
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
        this.hoprPolkadot.api.createType('AccountId', this.hoprPolkadot.self.keyPair.publicKey),
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
        this.hoprPolkadot.api.createType('AccountId', this.hoprPolkadot.self.keyPair.publicKey),
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

  /**
   * Initiates the settlement of this payment channel.
   * @returns a Promise that resolves once the payment channel is settled, otherwise
   * it rejects the Promise with an error.
   */
  async initiateSettlement(): Promise<void> {
    let channelSettler: ChannelSettler

    const [channelId, settlementWindow] = await Promise.all([this.channelId, this.settlementWindow])

    try {
      channelSettler = await ChannelSettler.create({
        hoprPolkadot: this.hoprPolkadot,
        counterparty: this.counterparty,
        channelId,
        settlementWindow
      })
    } catch (err) {
      throw err
    }

    await Promise.all([
      /* prettier-ignore */
      channelSettler.onceClosed().then(() => channelSettler.withdraw()),
      channelSettler.init()
    ])
  }

  async getPreviousChallenges(): Promise<Hash> {
    let pubKeys: Uint8Array[] = []

    return new Promise<Hash>(async (resolve, reject) => {
      this.hoprPolkadot.db
        .createReadStream({
          gt: this.hoprPolkadot.dbKeys.Challenge(
            await this.channelId,
            this.hoprPolkadot.api.createType('Hash', new Uint8Array(Hash.SIZE).fill(0x00))
          ),
          lt: this.hoprPolkadot.dbKeys.Challenge(
            await this.channelId,
            this.hoprPolkadot.api.createType('Hash', new Uint8Array(Hash.SIZE).fill(0x00))
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

  /**
   * Checks if there exists a payment channel with `counterparty`.
   * @param hoprPolkadot the CoreConnector instance
   * @param counterparty secp256k1 public key of the counterparty
   */
  static async isOpen(hoprPolkadot: HoprPolkadot, counterparty: AccountId, channelId: Hash) {
    const [onChain, offChain]: [boolean, boolean] = await Promise.all([
      hoprPolkadot.api.query.hopr.channels<ChannelEnum>(channelId).then(
        (channel: ChannelEnum) => channel != null && channel.type != 'Uninitialized',
        () => false
      ),
      hoprPolkadot.db.get(hoprPolkadot.dbKeys.Channel(counterparty)).then(
        () => true,
        (err: any) => {
          if (err.notFound) {
            return false
          } else {
            throw err
          }
        }
      )
    ])

    if (onChain != offChain) {
      if (!onChain && offChain) {
        throw Error(`Channel ${u8aToHex(channelId)} exists off-chain but not on-chain.`)
      } else {
        throw Error(`Channel ${u8aToHex(channelId)} exists on-chain but not off-chain.`)
      }
    }

    return onChain && offChain
  }

  /**
   * Checks whether the channel is open and opens that channel if necessary.
   * @param hoprPolkadot the connector instance
   * @param offChainCounterparty public key used off-chain
   * @param getOnChainPublicKey yields the on-chain identity
   * @param channelBalance desired channel balance
   * @param sign signing provider
   */
  static async create(
    hoprPolkadot: HoprPolkadot,
    offChainCounterparty: Uint8Array,
    getOnChainPublicKey: (counterparty: Uint8Array) => Promise<Uint8Array>,
    channelBalance?: ChannelBalance,
    sign?: (channelBalance: ChannelBalance) => Promise<SignedChannel>
  ): Promise<Channel> {
    let signedChannel: SignedChannel

    const counterparty = hoprPolkadot.api.createType('AccountId', await getOnChainPublicKey(offChainCounterparty))

    const channelId = await hoprPolkadot.utils.getId(
      hoprPolkadot.api.createType('AccountId', hoprPolkadot.self.keyPair.publicKey),
      counterparty,
      hoprPolkadot.api
    )
    if (await this.isOpen(hoprPolkadot, counterparty, channelId)) {
      signedChannel = new SignedChannel(await hoprPolkadot.db.get(hoprPolkadot.dbKeys.Channel(counterparty)))
    } else if (sign != null && channelBalance != null) {
      const channelOpener = await ChannelOpener.create(hoprPolkadot, counterparty, channelId)

      if (
        hoprPolkadot.utils.isPartyA(
          hoprPolkadot.api.createType('AccountId', hoprPolkadot.self.keyPair.publicKey),
          counterparty
        )
      ) {
        await channelOpener.increaseFunds(channelBalance.balance_a)
      } else {
        await channelOpener.increaseFunds(
          hoprPolkadot.api.createType('Balance', channelBalance.balance.sub(channelBalance.balance_a.toBn()))
        )
      }

      signedChannel = await sign(channelBalance)
      await Promise.all([
        /* prettier-ignore */
        channelOpener.onceOpen(),
        channelOpener.setActive(signedChannel)
      ])

      await hoprPolkadot.db.put(hoprPolkadot.dbKeys.Channel(counterparty), Buffer.from(signedChannel.toU8a()))
    } else {
      throw Error('Invalid input parameters.')
    }

    return new Channel(hoprPolkadot, counterparty, signedChannel)
  }

  /**
   * Handles the opening request received by another HOPR node.
   * @param hoprPolkadot the connector instance
   */
  static handleOpeningRequest(
    hoprPolkadot: HoprPolkadot
  ): (source: AsyncIterable<Uint8Array>) => AsyncIterator<Uint8Array> {
    return ChannelOpener.handleOpeningRequest(hoprPolkadot)
  }

  /**
   * Get all channels from the database.
   * @param hoprPolkadot the connector instance
   * @param onData function that is applied on every entry, cf. `map`
   * @param onEnd function that is applied at the end, cf. `reduce`
   */
  static getAll<T, R>(
    hoprPolkadot: HoprPolkadot,
    onData: (channel: Channel) => Promise<T>,
    onEnd: (promises: Promise<T>[]) => R
  ): Promise<R> {
    const promises: Promise<T>[] = []
    return new Promise<R>((resolve, reject) => {
      hoprPolkadot.db
        .createReadStream({
          gt: hoprPolkadot.dbKeys.Channel(hoprPolkadot.api.createType('Hash', new Uint8Array(Hash.SIZE).fill(0x00))),
          lt: hoprPolkadot.dbKeys.Channel(hoprPolkadot.api.createType('Hash', new Uint8Array(Hash.SIZE).fill(0xff)))
        })
        .on('error', err => reject(err))
        .on('data', ({ key, value }: { key: Buffer; value: Buffer }) => {
          const signedChannel: SignedChannel = new SignedChannel(value)

          promises.push(
            onData(new Channel(hoprPolkadot, hoprPolkadot.dbKeys.ChannelKeyParse(key, hoprPolkadot.api), signedChannel))
          )
        })
        .on('end', () => resolve(onEnd(promises)))
    })
  }

  /**
   * Tries to close all channels and returns the finally received funds.
   * @notice returns `0` if there are no open channels and/or we have not received any funds.
   * @param hoprPolkadot the connector instance
   */
  static async closeChannels(hoprPolkadot: HoprPolkadot): Promise<Balance> {
    const result = new BN(0)
    return Channel.getAll(
      hoprPolkadot,
      (channel: Channel) =>
        channel.initiateSettlement().then(() => {
          // @TODO add balance
          result.iaddn(0)
        }),
      async (promises: Promise<void>[]) => {
        await Promise.all(promises)

        return hoprPolkadot.api.createType('Balance', result)
      }
    )
  }

  /**
   * Checks whether this signature has already been used.
   * @param signature signature to check
   */
  async testAndSetNonce(signature: Uint8Array): Promise<void> {
    await waitReady()
    const nonce = blake2b(signature, NONCE_HASH_KEY, 32)

    const key = this.hoprPolkadot.dbKeys.Nonce(await this.channelId, this.hoprPolkadot.api.createType('Hash', nonce))

    try {
      await this.hoprPolkadot.db.get(Buffer.from(key))
    } catch (err) {
      if (err.notFound == null || err.notFound != true) {
        throw err
      }
      return
    }

    throw Error('Nonces must not be used twice.')
  }
}

export { Channel }

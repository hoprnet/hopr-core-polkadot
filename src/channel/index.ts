import type { Channel as ChannelEnum, ChannelBalance, Balance, Signature } from '../srml_types'
import { SignedChannel, Ticket, Hash } from '../srml_types'
import { blake2b, waitReady } from '@polkadot/wasm-crypto'
import type { Moment, AccountId } from '@polkadot/types/interfaces'
import { ChannelSettler } from './settle'
import { ChannelOpener } from './open'
import { u8aToHex, u8aXOR, getId } from '../utils'
import { ChannelKeyParse } from '../dbKeys'

import chalk from 'chalk'

import type HoprPolkadot from '..'

const NONCE_HASH_KEY = Uint8Array.from(new TextEncoder().encode('Nonce'))

import { Channel as ChannelInstance, Types } from '@hoprnet/hopr-core-connector-interface'
import BN from 'bn.js'

class Channel implements ChannelInstance<HoprPolkadot> {
  private _signedChannel: SignedChannel
  private _settlementWindow?: Moment
  private _channelId?: Hash

  constructor(public coreConnector: HoprPolkadot, public counterparty: AccountId, signedChannel: SignedChannel) {
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
        this._channelId = await getId(
          this.coreConnector.api.createType('AccountId', this.coreConnector.self.onChainKeyPair.publicKey),
          this.counterparty
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
        const record = await this.coreConnector.db.get(Buffer.from(this.coreConnector.dbKeys.Channel(this.counterparty)))

        this._signedChannel = new SignedChannel({
          bytes: record.buffer,
          offset: record.byteOffset
        })
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
        this._settlementWindow = await this.coreConnector.api.query.hopr.pendingWindow<Moment>()
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
      this.coreConnector.utils.isPartyA(
        this.coreConnector.api.createType('AccountId', this.coreConnector.self.onChainKeyPair.publicKey),
        this.counterparty
      )
    ) {
      return Promise.resolve<Balance>(this.balance_a)
    }

    return new Promise<Balance>(async resolve => {
      return resolve(this.coreConnector.api.createType('Balance', (await this.balance).sub(await this.balance_a)))
    })
  }

  get currentBalanceOfCounterparty(): Promise<Balance> {
    if (
      !this.coreConnector.utils.isPartyA(
        this.coreConnector.api.createType('AccountId', this.coreConnector.self.onChainKeyPair.publicKey),
        this.counterparty
      )
    ) {
      return Promise.resolve<Balance>(this.balance_a)
    }
    return new Promise<Balance>(async resolve => {
      return resolve(this.coreConnector.api.createType('Balance', (await this.balance).sub(await this.balance_a)))
    })
  }

  ticket = Ticket as typeof Types.Ticket

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
        hoprPolkadot: this.coreConnector,
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

    await this.coreConnector.db.del(Buffer.from(this.coreConnector.dbKeys.Channel(this.counterparty)))
  }

  async getPreviousChallenges(): Promise<Hash> {
    let pubKeys: Uint8Array[] = []

    return new Promise<Hash>(async (resolve, reject) => {
      this.coreConnector.db
        .createReadStream({
          gt: this.coreConnector.dbKeys.Challenge(
            await this.channelId,
            this.coreConnector.api.createType('Hash', new Uint8Array(Hash.SIZE).fill(0x00))
          ),
          lt: this.coreConnector.dbKeys.Challenge(
            await this.channelId,
            this.coreConnector.api.createType('Hash', new Uint8Array(Hash.SIZE).fill(0xff))
          )
        })
        .on('error', reject)
        .on('data', ({ key, ownKeyHalf }) => {
          const [channelId, challenge] = this.coreConnector.dbKeys.ChallengeKeyParse(key, this.coreConnector.api)

          // @TODO BIG TODO !!
          // replace this by proper EC-arithmetic
          pubKeys.push(u8aXOR(false, challenge, ownKeyHalf.toU8a()))
        })
        .on('end', () => {
          if (pubKeys.length > 0) {
            return resolve(this.coreConnector.api.createType('Hash', u8aXOR(false, ...pubKeys)))
          }

          resolve()
        })
    })
  }

  /**
   * Checks if there exists a payment channel with `counterparty`.
   * @param coreConnector the CoreConnector instance
   * @param counterparty secp256k1 public key of the counterparty
   */
  static async isOpen(coreConnector: HoprPolkadot, counterparty: AccountId): Promise<boolean> {
    const channelId = await coreConnector.utils.getId(
      coreConnector.api.createType('AccountId', coreConnector.self.onChainKeyPair.publicKey),
      counterparty
    )

    const [onChain, offChain]: [boolean, boolean] = await Promise.all([
      coreConnector.api.query.hopr.channels<ChannelEnum>(channelId).then(
        (channel: ChannelEnum) => channel != null && channel.type != 'Uninitialized',
        () => false
      ),
      coreConnector.db.get(Buffer.from(coreConnector.dbKeys.Channel(counterparty))).then(
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
   * @param coreConnector the connector instance
   * @param offChainCounterparty public key used off-chain
   * @param getOnChainPublicKey yields the on-chain identity
   * @param channelBalance desired channel balance
   * @param sign signing provider
   */
  static async create(
    coreConnector: HoprPolkadot,
    offChainCounterparty: Uint8Array,
    getOnChainPublicKey: (counterparty: Uint8Array) => Promise<Uint8Array>,
    channelBalance?: ChannelBalance,
    sign?: (channelBalance: ChannelBalance) => Promise<Types.SignedChannel<ChannelEnum, Signature>>
  ): Promise<Channel> {
    let signedChannel: SignedChannel

    const counterparty = coreConnector.api.createType('AccountId', await getOnChainPublicKey(offChainCounterparty))

    const channelId = await getId(
      coreConnector.api.createType('AccountId', coreConnector.self.onChainKeyPair.publicKey),
      counterparty
    )

    if (await this.isOpen(coreConnector, counterparty)) {
      const record = await coreConnector.db.get(Buffer.from(coreConnector.dbKeys.Channel(counterparty)))
      signedChannel = new SignedChannel({
        bytes: record.buffer,
        offset: record.byteOffset
      })
    } else if (sign != null && channelBalance != null) {
      const channelOpener = await ChannelOpener.create(coreConnector, counterparty, channelId)

      if (
        coreConnector.utils.isPartyA(
          coreConnector.api.createType('AccountId', coreConnector.self.onChainKeyPair.publicKey),
          counterparty
        )
      ) {
        console.log(chalk.yellow(`increase funds self`))
        await channelOpener.increaseFunds(channelBalance.balance_a)
      } else {
        console.log(chalk.yellow(`increase funds counterparty`))
        await channelOpener.increaseFunds(
          coreConnector.api.createType('Balance', channelBalance.balance.sub(channelBalance.balance_a.toBn()))
        )
      }

      signedChannel = await sign(channelBalance) as SignedChannel

      await Promise.all([
        /* prettier-ignore */
        channelOpener.onceOpen(),
        channelOpener.onceFundedByCounterparty(signedChannel.channel).then(() => channelOpener.setActive(signedChannel))
      ])

      await coreConnector.db.put(Buffer.from(coreConnector.dbKeys.Channel(counterparty)), Buffer.from(signedChannel))
    } else {
      throw Error('Invalid input parameters.')
    }

    return new Channel(coreConnector, counterparty, signedChannel)
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
   * @param coreConnector the connector instance
   * @param onData function that is applied on every entry, cf. `map`
   * @param onEnd function that is applied at the end, cf. `reduce`
   */
  static getAll<T, R>(
    coreConnector: HoprPolkadot,
    onData: (channel: Channel) => Promise<T>,
    onEnd: (promises: Promise<T>[]) => R
  ): Promise<R> {
    const promises: Promise<T>[] = []
    return new Promise<R>((resolve, reject) => {
      coreConnector.db
        .createReadStream({
          gt: Buffer.from(
            coreConnector.dbKeys.Channel(coreConnector.api.createType('Hash', new Uint8Array(Hash.SIZE).fill(0x00)))
          ),
          lt: Buffer.from(
            coreConnector.dbKeys.Channel(coreConnector.api.createType('Hash', new Uint8Array(Hash.SIZE).fill(0xff)))
          )
        })
        .on('error', err => reject(err))
        .on('data', ({ key, value }: { key: Buffer; value: Buffer }) => {
          const signedChannel: SignedChannel = new SignedChannel({
            bytes: value.buffer,
            offset: value.byteOffset
          })

          promises.push(
            onData(new Channel(coreConnector, ChannelKeyParse(key, coreConnector.api), signedChannel))
          )
        })
        .on('end', () => resolve(onEnd(promises)))
    })
  }

  /**
   * Tries to close all channels and returns the finally received funds.
   * @notice returns `0` if there are no open channels and/or we have not received any funds.
   * @param coreConnector the connector instance
   */
  static async closeChannels(coreConnector: HoprPolkadot): Promise<Balance> {
    const result = new BN(0)
    return Channel.getAll(
      coreConnector,
      (channel: Channel) =>
        channel.initiateSettlement().then(() => {
          // @TODO add balance
          result.iaddn(0)
        }),
      async (promises: Promise<void>[]) => {
        await Promise.all(promises)

        return coreConnector.api.createType('Balance', result)
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

    const key = this.coreConnector.dbKeys.Nonce(await this.channelId, this.coreConnector.api.createType('Hash', nonce))

    let found: Buffer | undefined
    try {
      found = await this.coreConnector.db.get(Buffer.from(key))
    } catch (err) {
      if (err.notFound == null || err.notFound != true) {
        throw err
      }      
    }

    if (found != null) {
      throw Error('Nonces must not be used twice.')
    }

    await this.coreConnector.db.put(Buffer.from(key), Buffer.from(''))
  }
}

export { Channel }

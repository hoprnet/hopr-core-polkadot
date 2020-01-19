import { ApiPromise, WsProvider } from '@polkadot/api'
import { KeyringPair } from '@polkadot/keyring/types'
import { LevelUp } from 'levelup'
import { EventSignalling } from './events'
import { Types, SRMLTypes, Balance, AccountId, Channel as ChannelEnum, Hash } from './srml_types'
import { randomBytes } from 'crypto'
import { waitReady } from '@polkadot/wasm-crypto'
import Utils from './utils'
import DbKeys from './db_keys'
import { createTypeUnsafe } from '@polkadot/types'
import { ChannelOpener } from './channel/open'

const POLKADOT_URI: string = 'ws://localhost:9944'

import { ChannelClass } from './channel'

import { HoprCoreConnectorClass } from '@hoprnet/hopr-core-connector-interface'

export { Utils, DbKeys }

export type HoprPolkadotProps = {
  self: KeyringPair
  api: ApiPromise
  db: LevelUp
}

export class HoprPolkadotClass implements HoprCoreConnectorClass {
  private _started: boolean = false
  private _nonce?: number

  eventSubscriptions: EventSignalling

  constructor(private _props: HoprPolkadotProps) {
    this.eventSubscriptions = new EventSignalling(this._props.api)
  }

  get started(): boolean {
    if (!this._started) {
      throw Error('Module is not yet fully initialised.')
    }

    return this._started
  }

  set started(started: boolean) {
    this._started = started
  }

  get api(): ApiPromise {
    return this._props.api
  }

  get self(): KeyringPair {
    return this._props.self
  }

  get db(): LevelUp {
    return this._props.db
  }

  get nonce(): Promise<number> {
    if (this._nonce != null) {
      return Promise.resolve(this._nonce++)
    }

    return new Promise<number>(async (resolve, reject) => {
      try {
        this._nonce = (await this._props.api.query.system.accountNonce(this._props.self.publicKey)).toNumber()
      } catch (err) {
        return reject(err)
      }

      return resolve(this._nonce++)
    })
  }

  async start(): Promise<void> {
    await Promise.all([
      // prettier-ignore
      this._props.api.isReady
    ])

    this.started = true
  }

  async initOnchainValues(nonce?: number): Promise<void> {
    this.started

    let secret = new Uint8Array(randomBytes(32))

    await Promise.all([
      /* prettier-ignore */
      this._props.db.put(this.dbKeys.OnChainSecret(), secret),
      waitReady()
    ])

    for (let i = 0; i < 1000; i++) {
      secret = await this.utils.hash(secret)
    }

    await this._props.api.tx.hopr
      .init(this._props.api.createType('Hash', this._props.self.publicKey), secret)
      .signAndSend(this._props.self, { nonce: nonce || (await this.nonce) })
  }

  async checkFreeBalance(newBalance: Balance): Promise<void> {
    const balance: Balance = await this._props.api.query.balances.freeBalance<Balance>(
      this._props.api.createType('AccountId', this._props.self.publicKey)
    )

    if (balance.lt(newBalance))
      throw Error('Insufficient balance. Free balance must be greater than requested balance.')
  }

  async stop(): Promise<void> {
    this._props.api.disconnect()

    return new Promise(resolve => {
      this._props.api.once('disconnected', () => {
        resolve()
      })
    })
  }

  async transfer(to: AccountId, amount: Balance): Promise<void> {
    this._props.api.tx.balances.transfer(to, amount.toU8a()).signAndSend(this._props.self)
  }

  utils = new Utils()
  types = Types

  private async createChannel(counterparty: AccountId): Promise<ChannelClass> {
    let record = await this.db.get(this.dbKeys.Channel(counterparty))

    return new ChannelClass(this, counterparty, createTypeUnsafe<ChannelEnum>(this.api.registry, 'Channel', record))
  }

  private async openChannel(
    amount: Balance,
    signature: Promise<Uint8Array>,
    counterparty: AccountId
  ): Promise<ChannelClass> {
    const channelOpener = await ChannelOpener.create(this, counterparty)

    await channelOpener.increaseFunds(amount)
    await Promise.all([
      /* prettier-ignore */
      channelOpener.onceOpen(),
      channelOpener.setActive(await signature)
    ])

    const channel = new ChannelClass(this, counterparty)

    await this.db.put(this.dbKeys.Channel(await channel.channelId), '')

    return channel
  }

  private getAllChannels<T, R>(
    onData: (channel: ChannelClass) => T,
    onEnd: (promises: Promise<T>[]) => R,
    hoprPolkadot: HoprPolkadotClass
  ): Promise<R> {
    const promises: Promise<T>[] = []
    return new Promise<R>((resolve, reject) => {
      hoprPolkadot.db
        .createReadStream({
          gt: this.dbKeys.Channel(hoprPolkadot.api.createType('Hash', new Uint8Array(Hash.length).fill(0x00))),
          lt: this.dbKeys.Channel(hoprPolkadot.api.createType('Hash', new Uint8Array(Hash.length).fill(0xff)))
        })
        .on('error', err => reject(err))
        .on('data', ({ key, value }) => {
          const channel: ChannelEnum = createTypeUnsafe<ChannelEnum>(hoprPolkadot.api.registry, 'Channel', [value])

          promises.push(
            Promise.resolve(onData(new ChannelClass(this, this.dbKeys.ChannelKeyParse(key, hoprPolkadot.api), channel)))
          )
        })
        .on('end', () => resolve(onEnd(promises)))
    })
  }

  private async closeChannels(hoprPolkadot: HoprPolkadotClass): Promise<Balance> {
    return this.getAllChannels(
      (channel: ChannelClass) => {
        channel.initiateSettlement()
      },
      async (promises: Promise<void>[]) => {
        return Promise.all(promises).then(() => hoprPolkadot.api.createType('Balance', 0))
      },
      hoprPolkadot
    )
  }
  channel = {
    create: this.createChannel,
    open: this.openChannel,
    getAll: this.getAllChannels,
    closeChannels: this.closeChannels
  }

  dbKeys = new DbKeys()
}

const HoprPolkadot = {
  /**
   * Creates an uninitialised instance.
   *
   * @param db database instance
   */
  async create(db: LevelUp, keyPair: KeyringPair, uri: string = POLKADOT_URI): Promise<HoprPolkadotClass> {
    const api = await ApiPromise.create({
      provider: new WsProvider(uri),
      types: SRMLTypes
    })

    return new HoprPolkadotClass({
      api,
      db,
      self: keyPair
    })
  }
}

export default HoprPolkadot

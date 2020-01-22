import { ApiPromise, WsProvider } from '@polkadot/api'
import { KeyringPair } from '@polkadot/keyring/types'
import { LevelUp } from 'levelup'
import { EventSignalling } from './events'
import { Types, SRMLTypes, Balance, AccountId, Channel as ChannelEnum, Hash, Signature, Ticket } from './srml_types'
import { randomBytes } from 'crypto'
import { waitReady } from '@polkadot/wasm-crypto'
import UtilsClass from './utils'
import DbKeysClass from './dbKeys'
import ConstantsClass from './constants'
import { createTypeUnsafe } from '@polkadot/types'
import { ChannelOpener } from './channel/open'

const POLKADOT_URI: string = 'ws://localhost:9944'

import { ChannelClass } from './channel'

import { HoprCoreConnectorClass } from '@hoprnet/hopr-core-connector-interface'

const Utils = new UtilsClass()
const DbKeys = new DbKeysClass()
const Constants = new ConstantsClass()

export { Utils, DbKeys, Constants, ChannelClass as Channel, Types, Ticket }

export type HoprPolkadotProps = {
  self: KeyringPair
  api: ApiPromise
  db: LevelUp
}

export class HoprPolkadotClass implements HoprCoreConnectorClass {
  private _started: boolean = false
  private _nonce?: number

  eventSubscriptions: EventSignalling

  constructor(public api: ApiPromise, public self: KeyringPair, public db: LevelUp) {
    this.eventSubscriptions = new EventSignalling(this.api)
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

  get nonce(): Promise<number> {
    if (this._nonce != null) {
      return Promise.resolve(this._nonce++)
    }

    return new Promise<number>(async (resolve, reject) => {
      try {
        this._nonce = (await this.api.query.system.accountNonce(this.self.publicKey)).toNumber()
      } catch (err) {
        return reject(err)
      }

      return resolve(this._nonce++)
    })
  }

  async start(): Promise<void> {
    await Promise.all([
      // prettier-ignore
      this.api.isReady
    ])

    this.started = true
  }

  async initOnchainValues(nonce?: number): Promise<void> {
    this.started

    let secret = new Uint8Array(randomBytes(32))

    await Promise.all([
      /* prettier-ignore */
      this.db.put(this.dbKeys.OnChainSecret(), secret),
      waitReady()
    ])

    for (let i = 0; i < 1000; i++) {
      secret = await this.utils.hash(secret)
    }

    await this.api.tx.hopr
      .init(this.api.createType('Hash', this.self.publicKey), secret)
      .signAndSend(this.self, { nonce: nonce || (await this.nonce) })
  }

  async checkFreeBalance(newBalance: Balance): Promise<void> {
    const balance: Balance = await this.api.query.balances.freeBalance<Balance>(
      this.api.createType('AccountId', this.self.publicKey)
    )

    if (balance.lt(newBalance))
      throw Error('Insufficient balance. Free balance must be greater than requested balance.')
  }

  async stop(): Promise<void> {
    this.api.disconnect()

    return new Promise(resolve => {
      this.api.once('disconnected', () => {
        resolve()
      })
    })
  }

  async getAccountBalance(): Promise<Balance> {
    return this.api.query.balances.freeBalance<Balance>(this.self.publicKey)
  }
  async transfer(to: AccountId, amount: Balance): Promise<void> {
    this.api.tx.balances.transfer(to, amount.toU8a()).signAndSend(this.self)
  }

  utils = Utils
  types = Types

  channel = {
    self: this as HoprPolkadotClass,
    async create(counterparty: AccountId): Promise<ChannelClass> {
      let record = await this.self.db.get(this.self.dbKeys.Channel(counterparty))
  
      return new ChannelClass(this.self, counterparty, createTypeUnsafe<ChannelEnum>(this.self.api.registry, 'Channel', record))
    },
    async open(
      amount: Balance,
      signature: Promise<Signature>,
      counterparty: AccountId
    ): Promise<ChannelClass> {
      const channelOpener = await ChannelOpener.create(this.self, counterparty)
  

      await channelOpener.increaseFunds(amount)
      await Promise.all([
        /* prettier-ignore */
        channelOpener.onceOpen(),
        channelOpener.setActive(await signature)
      ])
  
      const channel = new ChannelClass(this.self, counterparty)
  
      await this.self.db.put(this.self.dbKeys.Channel(await channel.channelId), '')
  
      return channel
    },
    getAll<T, R>(
      onData: (channel: ChannelClass) => T,
      onEnd: (promises: Promise<T>[]) => R,
      hoprPolkadot: HoprPolkadotClass
    ): Promise<R> {
      const promises: Promise<T>[] = []
      return new Promise<R>((resolve, reject) => {
        hoprPolkadot.db
          .createReadStream({
            gt: this.self.dbKeys.Channel(hoprPolkadot.api.createType('Hash', new Uint8Array(Hash.length).fill(0x00))),
            lt: this.self.dbKeys.Channel(hoprPolkadot.api.createType('Hash', new Uint8Array(Hash.length).fill(0xff)))
          })
          .on('error', err => reject(err))
          .on('data', ({ key, value }) => {
            const channel: ChannelEnum = createTypeUnsafe<ChannelEnum>(hoprPolkadot.api.registry, 'Channel', [value])
  
            promises.push(
              Promise.resolve(onData(new ChannelClass(this.self, this.self.dbKeys.ChannelKeyParse(key, hoprPolkadot.api), channel)))
            )
          })
          .on('end', () => resolve(onEnd(promises)))
      })
    },
    async closeChannels(hoprPolkadot: HoprPolkadotClass): Promise<Balance> {
      return this.getAll(
        (channel: ChannelClass) => {
          channel.initiateSettlement()
        },
        async (promises: Promise<void>[]) => {
          return Promise.all(promises).then(() => hoprPolkadot.api.createType('Balance', 0))
        },
        hoprPolkadot
      )
    }
  }

  dbKeys = DbKeys

  constants = Constants
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

    return new HoprPolkadotClass(api, keyPair, db)
  }
}

export default HoprPolkadot

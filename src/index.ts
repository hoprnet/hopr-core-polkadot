import { ApiPromise, WsProvider } from '@polkadot/api'
import { KeyringPair } from '@polkadot/keyring/types'
import { LevelUp } from 'levelup'
import { EventSignalling } from './events'
import { Types, SRMLTypes, Balance, AccountId } from './srml_types'
import { OnChainSecret } from './db_keys'
import { randomBytes } from 'crypto'
import { waitReady } from '@polkadot/wasm-crypto'
import * as Utils from './utils'
import * as DbKeys from './db_keys'

const POLKADOT_URI: string = 'ws://localhost:9944'

import Channel from './channel'

import { HoprCoreConnectorClass } from '@hoprnet/hopr-core-connector-interface'

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
      this._props.db.put(OnChainSecret(), secret),
      waitReady()
    ])

    for (let i = 0; i < 1000; i++) {
      secret = await HoprPolkadot.utils.hash(secret)
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
  },

  utils: Utils,
  types: Types,
  channel: Channel,
  dbKeys: DbKeys
}

export default HoprPolkadot

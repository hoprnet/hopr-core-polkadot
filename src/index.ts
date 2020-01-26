import { ApiPromise, WsProvider } from '@polkadot/api'
import { u8aToHex } from '@polkadot/util'
import Keyring from '@polkadot/keyring'
import { KeyringPair } from '@polkadot/keyring/types'
import { LevelUp } from 'levelup'
import { EventSignalling } from './events'
import { Types, SRMLTypes, Balance, AccountId, Ticket } from './srml_types'
import { randomBytes } from 'crypto'
import { waitReady } from '@polkadot/wasm-crypto'
import UtilsClass from './utils'
import DbKeysClass from './dbKeys'
import ConstantsClass from './constants'

const POLKADOT_URI: string = 'ws://localhost:9944'

import { Channel } from './channel'

import { HoprCoreConnectorInstance } from '@hoprnet/hopr-core-connector-interface'

const Utils = new UtilsClass()
const DbKeys = new DbKeysClass()
const Constants = new ConstantsClass()

export { Utils, DbKeys, Constants, Channel, Types, Ticket }

export type HoprPolkadotProps = {
  self: KeyringPair
  api: ApiPromise
  db: LevelUp
}

export type HoprKeyPair = {
  privateKey: Uint8Array
  publicKey: Uint8Array
  keyPair: KeyringPair
}

export default class HoprPolkadotClass implements HoprCoreConnectorInstance {
  private _started: boolean = false
  private _nonce?: number

  eventSubscriptions: EventSignalling

  constructor(public api: ApiPromise, public self: HoprKeyPair, public db: LevelUp) {
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
        this._nonce = (await this.api.query.system.accountNonce(this.self.keyPair.publicKey)).toNumber()
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
      .init(this.api.createType('Hash', this.self.keyPair.publicKey), secret)
      .signAndSend(this.self.keyPair, { nonce: nonce != null ? nonce : await this.nonce })
  }

  async checkFreeBalance(newBalance: Balance): Promise<void> {
    const balance: Balance = await this.api.query.balances.freeBalance<Balance>(
      this.api.createType('AccountId', this.self.keyPair.publicKey)
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
    return this.api.query.balances.freeBalance<Balance>(this.self.keyPair.publicKey)
  }
  async transfer(to: AccountId, amount: Balance): Promise<void> {
    this.api.tx.balances.transfer(to, amount.toU8a()).signAndSend(this.self.keyPair)
  }

  utils = Utils
  types = Types

  channel = Channel

  dbKeys = DbKeys

  constants = Constants

  /**
   * Creates an uninitialised instance.
   *
   * @param db database instance, e.g. `ws://localhost:9944`
   * @param keyPair privKey and publicKey of this node
   */
  static async create(
    db: LevelUp,
    keyPair: {
      publicKey: Uint8Array
      privateKey: Uint8Array
    },
    uri: string = POLKADOT_URI
  ): Promise<HoprPolkadotClass> {
    const api = await ApiPromise.create({
      provider: new WsProvider(uri),
      types: SRMLTypes
    })

    const kPair = new Keyring({ type: 'sr25519' }).addFromSeed(keyPair.privateKey, undefined, 'sr25519')
    const hoprKeyPair = {
      ...keyPair,
      keyPair: kPair
    }

    console.log(`pubKey`, u8aToHex(kPair.publicKey))

    return new HoprPolkadotClass(api, hoprKeyPair, db)
  }
}

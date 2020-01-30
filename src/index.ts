
import assert from 'assert'
import { ApiPromise, WsProvider } from '@polkadot/api'
import Keyring from '@polkadot/keyring'
import { KeyringPair } from '@polkadot/keyring/types'
import { LevelUp } from 'levelup'
import { EventSignalling } from './events'
import { Types, SRMLTypes, Balance, Ticket } from './srml_types'
import { randomBytes } from 'crypto'
import { waitReady } from '@polkadot/wasm-crypto'
import UtilsClass from './utils'
import DbKeysClass from './dbKeys'
import ConstantsClass from './constants'
import { DEFAULT_URI } from './config'

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
    await this.api.isReady

    this._started = true
  }

  get started(): boolean {
    return this._started
  }

  async initOnchainValues(nonce?: number): Promise<void> {
    assert(this.started, 'Module is not yet fully initialised.')

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

  async stop(): Promise<void> {
    const promise = new Promise<void>(resolve => {
      this.api.once('disconnected', () => {
        resolve()
      })
    })

    this.api.disconnect()

    return promise
  }

  get accountBalance(): Promise<Balance> {
    return this.api.query.balances.freeBalance<Balance>(this.api.createType('AccountId', this.self.keyPair.publicKey))
  }

  readonly utils = Utils
  
  readonly types = Types

  readonly channel = Channel

  readonly dbKeys = DbKeys

  readonly constants = Constants

  readonly CHAIN_NAME = `HOPR on Polkadot`

  /**
   * Creates an uninitialised instance.
   *
   * @param db database instance
   * @param keyPair privKey and publicKey of this node
   */
  static async create(
    db: LevelUp,
    keyPair: {
      publicKey: Uint8Array
      privateKey: Uint8Array
    }
  ): Promise<HoprPolkadotClass> {
    const api = await ApiPromise.create({
      provider: new WsProvider(DEFAULT_URI),
      types: SRMLTypes
    })

    const kPair = new Keyring({ type: 'sr25519' }).addFromSeed(keyPair.privateKey, undefined, 'sr25519')
    const hoprKeyPair = {
      ...keyPair,
      keyPair: kPair
    }

    return new HoprPolkadotClass(api, hoprKeyPair, db)
  }
}

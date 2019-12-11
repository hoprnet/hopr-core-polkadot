import { ApiPromise, WsProvider } from '@polkadot/api'
import { KeyringPair } from '@polkadot/keyring/types'
import { LevelUp } from 'levelup'
import { EventSignalling } from './events'
import { Types, Balance } from './srml_types'
import { OnChainSecret } from './db_keys'
import { cryptoWaitReady } from '@polkadot/util-crypto'
import { randomBytes } from 'crypto'
import { blake2b, waitReady } from '@polkadot/wasm-crypto'
import { u8aConcat } from '@polkadot/util'

const POLKADOT_URI: string = 'ws://localhost:9944'

const ON_CHAIN_SECRET_HASH_KEY: Uint8Array = Uint8Array.from(new TextEncoder().encode('ChannelId'))
const HASH_LENGTH = 32 // bytes

export type HoprPolkadotProps = {
  self: KeyringPair
  api: ApiPromise
  db: LevelUp
}

export default class HoprPolkadot {
  private _started: boolean = false
  private _nonce?: number

  eventSubscriptions: EventSignalling

  constructor(private _props: HoprPolkadotProps) {
    this.eventSubscriptions = new EventSignalling(this._props.api)
  }

  private get started(): boolean {
    if (!this._started) {
      throw Error('Module is not yet fully initialised.')
    }

    return this._started
  }

  private set started(started: boolean) {
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
    return new Promise<number>(async (resolve, reject) => {
      if (this._nonce == null) {
        try {
          this._nonce = (await this._props.api.query.system.accountNonce(this._props.self.publicKey)).toNumber()
        } catch (err) {
          return reject(err)
        }
      }

      return resolve(this._nonce++)
    })
  }

  /**
   * Creates an uninitialised instance.
   *
   * @param db database instance
   */
  static async create(db: LevelUp, keyPair: KeyringPair, uri: string = POLKADOT_URI): Promise<HoprPolkadot> {
    const api = await ApiPromise.create({
      provider: new WsProvider(uri),
      types: Types
    })

    return new HoprPolkadot({
      api,
      db,
      self: keyPair
    })
  }

  async start(): Promise<void> {
    await Promise.all([
      // prettier-ignore
      this._props.api.isReady,
      cryptoWaitReady()
    ])

    this.started = true
  }

  async initOnchainValues() {
    this.started

    let secret = new Uint8Array(randomBytes(32))

    await Promise.all([
      /* prettier-ignore */
      this._props.db.put(OnChainSecret(), secret),
      waitReady()
    ])

    for (let i = 0; i < 1000; i++) {
      secret = blake2b(secret, ON_CHAIN_SECRET_HASH_KEY, HASH_LENGTH)
    }

    await this._props.api.tx.hopr
      .init(u8aConcat(new Uint8Array([0, 0, 0, 0]), this._props.self.publicKey), secret)
      .signAndSend(this._props.self, { nonce: await this.nonce })
  }

  async checkFreeBalance(newBalance: Balance): Promise<void> {
    const balance: Balance = await this._props.api.query.balances.freeBalance<Balance>(
      this._props.api.createType('AccountId', this._props.self.publicKey)
    )

    if (balance.lt(newBalance))
      throw Error('Insufficient balance. Free balance must be greater than requested balance.')
  }

  stop() {
    this._props.api.disconnect()
  }
}

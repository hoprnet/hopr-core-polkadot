import { ApiPromise, WsProvider } from '@polkadot/api'
import { KeyringPair } from '@polkadot/keyring/types'
import { LevelUp } from 'levelup'
import { EventSignalling } from './events'
import { Types, Balance, AccountId } from './srml_types'
import { Channel, ChannelOpener } from './channel'
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
  private started: boolean = false

  eventSubscriptions: EventSignalling

  constructor(private props: HoprPolkadotProps) {
    this.eventSubscriptions = new EventSignalling(this.props.api)
  }

  get api(): ApiPromise {
    return this.props.api
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
      this.props.api.isReady,
      cryptoWaitReady()
    ])

    this.started = true
  }

  async initOnchainValues() {
    let secret = new Uint8Array(randomBytes(32))

    await Promise.all([
      /* prettier-ignore */
      this.props.db.put(OnChainSecret(), secret),
      waitReady()
    ])

    for (let i = 0; i < 1000; i++) {
      secret = blake2b(secret, ON_CHAIN_SECRET_HASH_KEY, HASH_LENGTH)
    }

    await this.props.api.tx.hopr.init(u8aConcat(new Uint8Array([0,0,0,0]), this.props.self.publicKey), secret).signAndSend(this.props.self)
  }

  stop() {
    this.props.api.disconnect()
  }

  async openChannel(amount: Balance, counterparty: AccountId): Promise<ChannelOpener> {
    if (!this.started) throw Error('Module is not yet fully initialised.')

    return Channel.open(
      {
        ...this.props,
        counterparty
      },
      amount,
      this.eventSubscriptions
    )
  }
}

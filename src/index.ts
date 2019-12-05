import { ApiPromise, WsProvider } from '@polkadot/api'
import { KeyringPair } from '@polkadot/keyring/types'
import { LevelUp } from 'levelup'
import { EventSignalling } from './events'
import { Types, Balance, AccountId } from './srml_types'
import { Channel } from './channel'
import { cryptoWaitReady } from '@polkadot/util-crypto'

const POLKADOT_URI: string = 'ws://localhost:9944'

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

  /**
   * Creates an uninitialised instance.
   *
   * @param db database instance
   */
  static async create(db: LevelUp, keyPair: KeyringPair): Promise<HoprPolkadot> {
    const api = await ApiPromise.create({
      provider: new WsProvider(POLKADOT_URI),
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

  async openChannel(amount: Balance, counterparty: AccountId) {
    if (!this.started) throw Error('Module is not yet fully initialised.')

    Channel.open(
      {
        ...this.props,
        counterparty
      },
      amount,
      this.eventSubscriptions
    )
  }
}

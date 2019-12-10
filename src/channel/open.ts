import { Balance, AccountId, Channel as ChannelEnum, Hash } from '../srml_types'
import { Signature } from '../types'
import { isPartyA, getId } from '../utils'
import { Channel as ChannelKey } from '../db_keys'
import { Opened, EventHandler, HoprEventSubscription } from '../events'
import HoprPolkadot from '..'
import { Channel } from '.'

type ChannelOpenerProps = {
  hoprPolkadot: HoprPolkadot
  counterparty: AccountId
  amount: Balance
}

export class ChannelOpener {
  private _initialised: boolean = false

  private get initialised(): boolean {
    if (!this._initialised) {
      throw Error('Cannot alter state unless module is not initialized')
    }

    return this._initialised
  }

  private set initialised(initialised: boolean) {
    this._initialised = initialised
  }

  private constructor(private _props: ChannelOpenerProps, private channelId: Hash) {}

  static async create(props: ChannelOpenerProps): Promise<ChannelOpener> {
    const channelId = await getId(
      props.hoprPolkadot.api,
      props.hoprPolkadot.api.createType('AccountId', props.hoprPolkadot.self.publicKey),
      props.counterparty
    )

    await props.hoprPolkadot.db
      .get(ChannelKey(channelId))
      .then(_ => {
        throw Error('Channel must not exit.')
      })
      .catch(_ => {})

    return new ChannelOpener(props, channelId)
  }

  async increaseFunds(newAmount: Balance): Promise<ChannelOpener> {
    this.initialised && (await this._props.hoprPolkadot.checkFreeBalance(newAmount))

    if (
      isPartyA(
        this._props.hoprPolkadot.api.createType('AccountId', this._props.hoprPolkadot.self.publicKey),
        this._props.counterparty
      )
    ) {
      this._props.amount.iadd(newAmount)
    } else {
      this._props.amount.isub(newAmount)
    }

    await this._props.hoprPolkadot.api.tx.hopr
      .create(newAmount.toU8a(), this._props.counterparty)
      .signAndSend(this._props.hoprPolkadot.self, { nonce: await this._props.hoprPolkadot.nonce })

    this.initialised = true

    return this
  }

  onceOpen(): Promise<ChannelOpener> {
    this.initialised

    const eventIdentifier = Opened(this.channelId)

    return new Promise<ChannelOpener>(resolve => {
      this._props.hoprPolkadot.eventSubscriptions.once(eventIdentifier, () => resolve(this))
    })
  }

  // @TODO
  async onceFundedByCounterparty(handler?: EventHandler): Promise<void | ChannelOpener> {
    this.initialised

    if (handler == null) {
      return new Promise<ChannelOpener>(async resolve => {
        const unsubscribe = await this._props.hoprPolkadot.api.query.hopr.channels<ChannelEnum>(this.channelId, _ => {
          unsubscribe()
          resolve(this)
        })
      })
    }

    const unsubscribe = await this._props.hoprPolkadot.api.query.hopr.channels<ChannelEnum>(this.channelId, _ => {
      unsubscribe()
    })
  }

  async setActive(signature: Signature): Promise<ChannelOpener> {
    this.initialised

    await Promise.all([
      this._props.hoprPolkadot.api.tx.hopr
        .setActive(this._props.counterparty, signature)
        .signAndSend(this._props.hoprPolkadot.self, { nonce: await this._props.hoprPolkadot.nonce }),
      this._props.hoprPolkadot.db.put(ChannelKey(this.channelId), '')
    ])

    return this
  }
}

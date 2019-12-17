import { Balance, AccountId, Channel as ChannelEnum, Hash } from '../srml_types'
import { Signature } from '../types'
import { getId } from '../utils'
import { Channel as ChannelKey } from '../db_keys'
import { Opened, EventHandler } from '../events'
import HoprPolkadot from '..'

type ChannelOpenerProps = {
  hoprPolkadot: HoprPolkadot
  counterparty: AccountId
}

export class ChannelOpener {
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
    await this._props.hoprPolkadot.checkFreeBalance(newAmount)

    await this._props.hoprPolkadot.api.tx.hopr
      .create(newAmount.toU8a(), this._props.counterparty)
      .signAndSend(this._props.hoprPolkadot.self, { nonce: await this._props.hoprPolkadot.nonce })

    return this
  }

  onceOpen(): Promise<ChannelOpener> {
    const eventIdentifier = Opened(this.channelId)

    return new Promise<ChannelOpener>(resolve => {
      this._props.hoprPolkadot.eventSubscriptions.once(eventIdentifier, () => resolve(this))
    })
  }

  // @TODO
  async onceFundedByCounterparty(handler?: EventHandler): Promise<void | ChannelOpener> {
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
    await Promise.all([
      this._props.hoprPolkadot.api.tx.hopr
        .setActive(this._props.counterparty, signature)
        .signAndSend(this._props.hoprPolkadot.self, { nonce: await this._props.hoprPolkadot.nonce }),
      this._props.hoprPolkadot.db.put(ChannelKey(this.channelId), '')
    ])

    return this
  }
}

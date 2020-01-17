import { Balance, AccountId, Channel as ChannelEnum, Hash, Signature } from '../srml_types'
import { Channel as ChannelKey } from '../db_keys'
import { Opened, EventHandler } from '../events'
import { HoprPolkadotClass } from '..'

type ChannelOpenerProps = {
  hoprPolkadot: HoprPolkadotClass
  counterparty: AccountId
}

export class ChannelOpener {
  private constructor(private hoprPolkadot: HoprPolkadotClass, private counterparty: AccountId, private channelId: Hash) {}

  static async create(props: ChannelOpenerProps): Promise<ChannelOpener> {
    const channelId = await props.hoprPolkadot.utils.getId(
      props.hoprPolkadot.api.createType('AccountId', props.hoprPolkadot.self.publicKey),
      props.counterparty,
      props.hoprPolkadot.api
    )

    await props.hoprPolkadot.db
      .get(ChannelKey(props.counterparty))
      .then(_ => {
        throw Error('Channel must not exit.')
      })
      .catch(_ => {})

    return new ChannelOpener(props.hoprPolkadot, props.counterparty, channelId)
  }

  async increaseFunds(newAmount: Balance): Promise<ChannelOpener> {
    await this.hoprPolkadot.checkFreeBalance(newAmount)

    await this.hoprPolkadot.api.tx.hopr
      .create(newAmount.toU8a(), this.counterparty)
      .signAndSend(this.hoprPolkadot.self, { nonce: await this.hoprPolkadot.nonce })

    return this
  }

  onceOpen(): Promise<ChannelOpener> {
    const eventIdentifier = Opened(this.channelId)

    return new Promise<ChannelOpener>(resolve => {
      this.hoprPolkadot.eventSubscriptions.once(eventIdentifier, () => resolve(this))
    })
  }

  // @TODO
  async onceFundedByCounterparty(handler?: EventHandler): Promise<void | ChannelOpener> {
    if (handler == null) {
      return new Promise<ChannelOpener>(async resolve => {
        const unsubscribe = await this.hoprPolkadot.api.query.hopr.channels<ChannelEnum>(this.channelId, _ => {
          unsubscribe()
          resolve(this)
        })
      })
    }

    const unsubscribe = await this.hoprPolkadot.api.query.hopr.channels<ChannelEnum>(this.channelId, _ => {
      unsubscribe()
    })
  }

  async setActive(signature: Signature): Promise<ChannelOpener> {
    await Promise.all([
      this.hoprPolkadot.api.tx.hopr
        .setActive(this.counterparty, signature)
        .signAndSend(this.hoprPolkadot.self, { nonce: await this.hoprPolkadot.nonce }),
      this.hoprPolkadot.db.put(ChannelKey(this.channelId), '')
    ])

    return this
  }
}

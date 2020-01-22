import { Balance, AccountId, Channel as ChannelEnum, Hash, Signature } from '../srml_types'

import { Opened, EventHandler } from '../events'
import { HoprPolkadotClass } from '..'

export class ChannelOpener {
  private constructor(private hoprPolkadot: HoprPolkadotClass, private counterparty: AccountId, private channelId: Hash) {}

  static async create(hoprPolkadot: HoprPolkadotClass, counterparty: AccountId): Promise<ChannelOpener> {
    const channelId = await hoprPolkadot.utils.getId(
      hoprPolkadot.api.createType('AccountId', hoprPolkadot.self.publicKey),
      counterparty,
      hoprPolkadot.api
    )

    await hoprPolkadot.db
      .get(hoprPolkadot.dbKeys.Channel(counterparty))
      .then(_ => {
        throw Error('Channel must not exit.')
      })
      .catch(_ => {})

    return new ChannelOpener(hoprPolkadot, counterparty, channelId)
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
        .setActive(this.counterparty, signature.onChainSignature)
        .signAndSend(this.hoprPolkadot.self, { nonce: await this.hoprPolkadot.nonce }),
      this.hoprPolkadot.db.put(this.hoprPolkadot.dbKeys.Channel(this.channelId), '')
    ])

    return this
  }
}

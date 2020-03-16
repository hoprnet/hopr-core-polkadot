import type { Hash, Channel as ChannelEnum, PendingSettlement, AccountId, Moment } from '../srml_types'
import { PushedBackSettlement } from '../events'
import type { Event } from '@polkadot/types/interfaces'
import type HoprPolkadot from '..'
import { u8aToHex } from '@polkadot/util'

type ChannelSettlerProps = {
  hoprPolkadot: HoprPolkadot
  counterparty: AccountId
  channelId: Hash
  settlementWindow: Moment
}

export class ChannelSettler {
  private _end?: Moment

  unsubscribeChannelListener?: () => void

  get end(): Promise<Moment> {
    if (this._end) {
      return Promise.resolve<Moment>(this._end)
    }

    return new Promise<Moment>(async (resolve, reject) => {
      let channel
      try {
        channel = await this.hoprPolkadot.api.query.hopr.channels<ChannelEnum>(this.channelId)
      } catch (err) {
        return reject(err)
      }

      if (channel.isPendingSettlement) {
        this._end = channel.asPendingSettlement[1]
      } else {
        try {
          let unsubscribe: () => void
          await new Promise(async (resolve, reject) => {
            unsubscribe = await this.hoprPolkadot.api.query.hopr.channels<ChannelEnum>(
              this.channelId,
              (channel: ChannelEnum) => {
                console.log(`channel has changed.`, channel.toJSON())
                if (channel.isPendingSettlement) {
                  setImmediate(() => {
                    unsubscribe()
                    resolve()
                  })
                }
              }
            )
          })
        } catch (err) {
          return reject(`Channel state must be 'PendingSettlement', but is '${channel.type}'`)
        }
      }

      return resolve(this._end)
    })
  }

  private handlers: (() => void)[] = []
  private unsubscribePushback: (() => void) | undefined

  private constructor(public hoprPolkadot: HoprPolkadot, public counterparty: AccountId, public channelId: Hash, public settlementWindow: Moment) {}

  static async create(props: ChannelSettlerProps): Promise<ChannelSettler> {
    let channel = await props.hoprPolkadot.api.query.hopr.channels<ChannelEnum>(props.channelId)

    if (!(channel.isPendingSettlement || channel.isActive)) {
      throw Error(`Invalid state. Expected channel state to be either 'Active' or 'Pending'. Got '${channel.type}'.`)
    }

    return new ChannelSettler(props.hoprPolkadot, props.counterparty, props.channelId, props.settlementWindow)
  }

  async init(): Promise<ChannelSettler> {
    this.unsubscribePushback = this.unsubscribePushback || this.hoprPolkadot.eventSubscriptions.on(
      PushedBackSettlement(this.channelId),
      (event: Event) => {
        this._end = event.data[0] as Moment
      }
    )

    try {
      this.hoprPolkadot.api.tx.hopr
        .initiateSettlement(this.counterparty)
        .signAndSend(this.hoprPolkadot.self.onChainKeyPair, { nonce: await this.hoprPolkadot.nonce })
    } catch (err) {
      console.log(`Tried to settle channel ${u8aToHex(this.channelId)} but failed due to ${err.message}`)
    }
    
    return this
  }

  // optional
  // oncePushedBack(handler?: EventHandler): void | Promise<ChannelCloser> {
  //   Reflect.apply(checkInitialised, this, [])

  //   const eventIdentifier = PushedBackSettlement(this.props.channelId)

  //   if (isEventHandler(handler)) {
  //     this.props.eventRegistry.once(eventIdentifier, handler)
  //     return
  //   }

  //   return new Promise<ChannelCloser>(resolve => {
  //     this.props.eventRegistry.once(eventIdentifier, () => resolve(this))
  //   })
  // }

  async onceClosed(): Promise<void> {
    if (this.unsubscribeChannelListener == null) {
      this.unsubscribeChannelListener = await this.timeoutFactory()
    }

    return new Promise<void>(resolve => {
      this.handlers.push(resolve)
    })
  }

  async withdraw(): Promise<void> {
    await this.hoprPolkadot.api.tx.hopr
      .withdraw(this.counterparty)
      .signAndSend(this.hoprPolkadot.self.onChainKeyPair, { nonce: await this.hoprPolkadot.nonce })

    console.log('withdrawn')
  }

  private timeoutFactory(): Promise<() => void> {
    return new Promise<() => void>(async (resolve, reject) => {
      // make sure that we have `end` cached
      try {
        await this.end
      } catch (err) {
        return reject(err)
      }

      resolve(
        this.hoprPolkadot.api.query.timestamp.now<Moment>(async (moment: Moment) => {
          if (moment.gt(await this.end)) {
            while(this.handlers.length > 0) {
              (this.handlers.pop()!)()
            }
          }
        })
      )
    })
  }
}

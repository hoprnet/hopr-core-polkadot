import { Hash, Channel as ChannelEnum, PendingSettlement, AccountId, Moment } from '../srml_types'
import { PushedBackSettlement } from '../events'
import { Event } from '@polkadot/types/interfaces'
import HoprPolkadot from '..'

type ChannelSettlerProps = {
  hoprPolkadot: HoprPolkadot
  counterparty: AccountId
  channelId: Hash
  settlementWindow: Moment
}

export class ChannelSettler {
  private _end?: Moment

  timer?: () => void

  get end(): Promise<Moment> {
    if (this._end) {
      return Promise.resolve<Moment>(this._end)
    }

    return new Promise<Moment>(async (resolve, reject) => {
      let channel
      try {
        channel = await this.props.hoprPolkadot.api.query.hopr.channels<ChannelEnum>(this.props.channelId)
      } catch (err) {
        return reject(err)
      }

      if (channel.isPendingSettlement) {
        this._end = channel.asPendingSettlement[1]
      } else {
        try {
          await new Promise(async (resolve, reject) => {
            const unsub = await this.props.hoprPolkadot.api.query.hopr.channels<ChannelEnum>(
              this.props.channelId,
              (channel: ChannelEnum) => {
                console.log(`channel has changed. ${channel.toString()}`)
                if (channel.isPendingSettlement) {
                  setImmediate(() => {
                    unsub()
                    resolve()
                  })
                }
              }
            )
          })
        } catch (err) {
          return reject(`Channel state must be '${PendingSettlement.name}', but is '${channel.type}'`)
        }
      }

      return resolve(this._end)
    })
  }

  private handlers: (Function | undefined)[] = []

  private constructor(private props: ChannelSettlerProps) {}

  static async create(props: ChannelSettlerProps): Promise<ChannelSettler> {
    let channel = await props.hoprPolkadot.api.query.hopr.channels<ChannelEnum>(props.channelId)

    if (!(channel.isPendingSettlement || channel.isActive)) {
      throw Error(`Invalid state. Expected channel state to be either 'Active' or 'Pending'. Got '${channel.type}'.`)
    }

    return new ChannelSettler(props)
  }

  async init(): Promise<ChannelSettler> {
    this.props.hoprPolkadot.api.tx.hopr
      .initiateSettlement(this.props.counterparty)
      .signAndSend(this.props.hoprPolkadot.self.keyPair, { nonce: await this.props.hoprPolkadot.nonce })

    const unsubscribe = this.props.hoprPolkadot.eventSubscriptions.on(
      PushedBackSettlement(this.props.channelId),
      (event: Event) => {
        this._end = event.data[0] as Moment
      }
    )

    unsubscribe()
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
    if (this.timer == null) {
      this.timer = await this.timeoutFactory()
    }

    return new Promise<void>(resolve => {
      let index = this.handlers.push(() => {
        this.handlers.splice(index - 1, 1, undefined)
        this.cleanHandlers()
        return resolve()
      })
    })
  }

  async withdraw(): Promise<void> {
    await this.props.hoprPolkadot.api.tx.hopr
      .withdraw(this.props.counterparty)
      .signAndSend(this.props.hoprPolkadot.self.keyPair, { nonce: await this.props.hoprPolkadot.nonce })

    console.log('withdrawn')
  }

  private timeoutFactory(): Promise<() => void> {
    return new Promise<() => void>(async (resolve, reject) => {
      let end = await this.end
      resolve(
        this.props.hoprPolkadot.api.query.timestamp.now<Moment>(async (moment: Moment) => {
          if (moment.gt(await this.end)) {
            this.handlers.forEach(handler => handler != null && handler())
          }
        })
      )
    })
  }

  private cleanHandlers() {
    while (this.handlers.length > 0 && this.handlers[this.handlers.length - 1] === undefined) {
      this.handlers.pop()
    }
    if (this.handlers.length == 0 && this.timer != null) {
      this.timer()
    }
  }
}

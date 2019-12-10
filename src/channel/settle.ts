import { Hash, Channel as ChannelEnum, PendingSettlement, AccountId } from '../srml_types'
import { PushedBackSettlement } from '../events'
import { Event, Moment } from '@polkadot/types/interfaces'
import HoprPolkadot from '..'

type ChannelSettlerProps = {
  hoprPolkadot: HoprPolkadot
  counterparty: AccountId
  channelId: Hash
  settlementWindow: Moment
}

export class ChannelSettler {
  private _end?: Moment

  timer?: any

  get end(): Promise<Moment> {
    return new Promise<Moment>(async (resolve, reject) => {
      if (this._end == null) {
        let channel
        try {
          channel = await this.props.hoprPolkadot.api.query.hopr.channels<ChannelEnum>(this.props.channelId)
        } catch (err) {
          return reject(err)
        }

        // @ts-ignore
        if (channel.isPendingSettlement) {
          // @ts-ignore
          this._end = ((channel.asPendingSettlement as any) as PendingSettlement)[1]
        } else {
          return reject(`Channel state must be 'PendingSettlement', but is '${channel.type}'`)
        }
      }

      return resolve(this._end)
    })
  }

  private handlers: Function[] = []

  private constructor(private props: ChannelSettlerProps) {}

  static async create(props: ChannelSettlerProps): Promise<ChannelSettler> {
    let channel = await props.hoprPolkadot.api.query.hopr.channels<ChannelEnum>(props.channelId)

    // @ts-ignore
    if (!(channel.isPendingSettlement && channel.isActive)) {
      throw Error(`Invalid state. Expected channel state to be either 'Active' or 'Pending'. Got '${channel.type}'.`)
    }

    return new ChannelSettler(props).init()
  }

  async init(): Promise<ChannelSettler> {
    let now: Moment = await this.props.hoprPolkadot.api.query.timestamp.now<Moment>()

    await this.props.hoprPolkadot.api.tx.hopr
      .initiateSettlement(this.props.counterparty)
      .signAndSend(this.props.hoprPolkadot.self, { nonce: await this.props.hoprPolkadot.nonce })

    this.props.hoprPolkadot.eventSubscriptions.on(PushedBackSettlement(this.props.channelId), (event: Event) => {
      this._end = event.data[0] as Moment
    })

    this._end = this.props.hoprPolkadot.api.createType('u64', now.iadd(this.props.settlementWindow))

    this.timer = await this.timeoutFactory()
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

  onceClosed(): void | Promise<ChannelSettler> {
    return new Promise(resolve => {
      let index = this.handlers.push(() => {
        this.handlers.splice(index - 1, 1)
        return resolve()
      })
    })
  }

  private async timeoutFactory() {
    const unsub = await this.props.hoprPolkadot.api.query.timestamp.now<Moment>(async moment => {
      if (moment.gt(await this.end)) {
        this.handlers.forEach(handler => handler())
      }
      unsub()
      return
    })
  }
}

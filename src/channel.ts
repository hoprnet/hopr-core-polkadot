import {
  LotteryTicket,
  Balance,
  AccountId,
  Hash,
  State,
  Channel as ChannelEnum,
  Funded,
  Active,
  PendingSettlement,
  ChannelBalance
} from './srml_types'
import { SignedLotteryTicket, Signature } from './types'
import { sr25519Verify, sr25519Sign, blake2b } from '@polkadot/wasm-crypto'
import { isPartyA, getId } from './utils'
import { LevelUp } from 'levelup'
import { ApiPromise } from '@polkadot/api'
import { KeyringPair } from '@polkadot/keyring/types'
import { Nonce, Channel as ChannelKey } from './db_keys'
import { Opened, PushedBackSettlement, EventSignalling, EventHandler } from './events'
import { u64 } from '@polkadot/types'
import { Event } from '@polkadot/types/interfaces'

const NONCE_HASH_KEY = Uint8Array.from(new TextEncoder().encode('Nonce'))

export type ChannelProps = {
  self: KeyringPair
  counterparty: AccountId
  db: LevelUp
  api: ApiPromise
}

export class Channel {
  private _channel?: ChannelEnum
  private _settlementWindow?: u64
  private _channelId?: Hash

  constructor(public props: ChannelProps) {}

  get channelId(): Promise<Hash> {
    return new Promise(async (resolve, reject) => {
      if (this._channelId != null) {
        return resolve(this._channelId)
      }

      try {
        this._channelId = await getId(
          this.props.api,
          this.props.api.createType('AccountId', this.props.self.publicKey),
          this.props.counterparty
        )
      } catch (err) {
        return reject(err)
      }

      resolve(this._channelId)
    })
  }

  private get channel(): Promise<ChannelEnum> {
    return new Promise<ChannelEnum>(async (resolve, reject) => {
      if (this._channel != null) {
        return resolve(this._channel)
      }
      try {
        this._channel = new ChannelEnum(await this.props.db.get(ChannelKey(await this.channelId)))
      } catch (err) {
        return reject(err)
      }
      return resolve(this._channel)
    })
  }

  get settlementWindow(): Promise<u64> {
    return new Promise<u64>(async (resolve, reject) => {
      if (this._settlementWindow != null) {
        return resolve(this._settlementWindow)
      }
      try {
        this._settlementWindow = (await this.props.api.consts.hopr.pendingWindow) as u64
      } catch (err) {
        return reject(err)
      }
      return resolve(this._settlementWindow)
    })
  }

  get state(): Promise<string> {
    return this.channel.then(channel => channel.type)
  }

  get balance_a(): Promise<Balance> {
    return this.channel.then(channel => {
      switch (channel.type) {
        case 'Funded':
          return ((channel as any).asFunded as Funded).balance_a
        case 'Active':
          return ((channel as any).asActive as Active).balance_a
        case 'PendingSettlement':
          return (((channel as any).asPendingSettlement as PendingSettlement)[0] as ChannelBalance).balance_a
        default:
          throw Error(`Invalid state. Got '${channel.type}'`)
      }
    })
  }

  get balance(): Promise<Balance> {
    return this.channel.then(channel => {
      switch (channel.type) {
        case 'Funded':
          return ((channel as any).asFunded as Funded).balance
        case 'Active':
          return ((channel as any).asActive as Active).balance
        case 'PendingSettlement':
          return (((channel as any).asPendingSettlement as PendingSettlement)[0] as ChannelBalance).balance
        default:
          throw Error(`Invalid state. Got '${channel.type}'`)
      }
    })
  }

  get currentBalance(): Promise<Balance> {
    return new Promise(async resolve => {
      if (isPartyA(this.props.api.createType('AccountId', this.props.self.publicKey), this.props.counterparty)) {
        return resolve(this.balance_a)
      } else {
        return resolve(this.props.api.createType('Balance', (await this.balance).sub(await this.balance_a)))
      }
    })
  }

  get currentBalanceOfCounterparty(): Promise<Balance> {
    return new Promise(async resolve => {
      if (isPartyA(this.props.api.createType('AccountId', this.props.self.publicKey), this.props.counterparty)) {
        return resolve(this.props.api.createType('Balance', (await this.balance).sub(await this.balance_a)))
      } else {
        return resolve(this.balance_a)
      }
    })
  }

  async createTicket(
    secretKey: Uint8Array,
    amount: Balance,
    challenge: Hash,
    winProb: Hash
  ): Promise<SignedLotteryTicket> {
    const { epoch } = await this.props.api.query.hopr.state<State>(this.props.counterparty)

    const ticket = new LotteryTicket(this.props.api.registry, {
      channelId: getId(
        this.props.api,
        this.props.api.createType('AccountId', this.props.self.publicKey),
        this.props.counterparty
      ),
      epoch,
      challenge,
      amount,
      winProb
    })

    const signature = sr25519Sign(this.props.self.publicKey, secretKey, ticket.toU8a())

    return {
      lotteryTicket: ticket,
      signature
    }
  }

  async verifyTicket(signedTicket: SignedLotteryTicket): Promise<boolean> {
    if ((await this.currentBalanceOfCounterparty).add(signedTicket.lotteryTicket.amount).gt(await this.balance)) {
      return false
    }

    try {
      await this.testAndSetNonce(signedTicket.signature)
    } catch (_) {
      return false
    }

    return sr25519Verify(signedTicket.signature, signedTicket.lotteryTicket.toU8a(), this.props.counterparty.toU8a())
  }

  async submitTicket(signedTicket: SignedLotteryTicket) {}

  static async open(props: ChannelProps, amount: Balance, eventRegistry: EventSignalling): Promise<ChannelOpener> {
    let channelId = await getId(props.api, props.api.createType('AccountId', props.self.publicKey), props.counterparty)

    await props.db.get(ChannelKey(channelId)).then(_ => {
      throw Error('Channel must not exit.')
    }).catch(_ => {})

    const channelOpener = new ChannelOpener({
      ...props,
      eventRegistry,
      channelId,
      amount
    })
    
    return channelOpener.increaseFunds(amount)
  }

  async initiateSettlement(eventRegistry: EventSignalling): Promise<ChannelCloser> {
    return new ChannelCloser({
      ...this.props,
      channelId: await this.channelId,
      pendingWindow: this.settlementWindow,
      eventRegistry
    }).initiateSettlement()
  }

  private async testAndSetNonce(signature: Uint8Array): Promise<void> {
    const nonce = blake2b(signature, NONCE_HASH_KEY, 256)

    const key = Nonce(await this.channelId, this.props.api.createType('Hash', nonce))

    await this.props.db.get(key).then(_ => {
      throw Error('Nonces must not be used twice.')
    })
  }
}

type ChannelOpenerProps = ChannelProps & {
  eventRegistry: EventSignalling
  channelId: Hash
  amount: Balance
}

export class ChannelOpener {
  initialised: boolean = false

  constructor(private props: ChannelOpenerProps) {}

  async increaseFunds(newAmount: Balance): Promise<ChannelOpener> {
    await Reflect.apply(checkFreeBalance, this, [newAmount])

    if (isPartyA(this.props.api.createType('AccountId', this.props.self.publicKey), this.props.counterparty)) {
      this.props.amount.iadd(newAmount)
    } else {
      this.props.amount.isub(newAmount)
    }

    await this.props.api.tx.hopr.create(newAmount.toU8a(), this.props.counterparty).signAndSend(this.props.self)

    this.initialised = true

    return this
  }

  onceOpen(handler?: EventHandler): void | Promise<ChannelOpener> {
    Reflect.apply(checkInitialised, this, [])

    const eventIdentifier = Opened(this.props.channelId)

    if (isEventHandler(handler)) {
      this.props.eventRegistry.once(eventIdentifier, handler)
    }

    return new Promise<ChannelOpener>(resolve => {
      this.props.eventRegistry.once(eventIdentifier, () => resolve(this))
    })
  }

  // @TODO
  async onceFundedByCounterparty(handler?: EventHandler): Promise<void | ChannelOpener> {
    Reflect.apply(checkInitialised, this, [])

    if (isEventHandler(handler)) {
      const unsubscribe = await this.props.api.query.hopr.channels<ChannelEnum>(this.props.channelId, channel => {
        unsubscribe()
      })
    }

    return new Promise<ChannelOpener>(async resolve => {
      const unsubscribe = await this.props.api.query.hopr.channels<ChannelEnum>(this.props.channelId, channel => {
        unsubscribe()
        resolve(this)
      })
    })
  }

  async setActive(this: ChannelOpener & ChannelOpenerProps, signature: Signature): Promise<Channel> {
    Reflect.apply(checkInitialised, this, [])

    await Promise.all([
      this.api.tx.hopr.setActive(this.counterparty, signature).signAndSend(this.self),
      this.db.put(ChannelKey(this.channelId), '')
    ])

    return new Channel({
      api: this.api,
      db: this.db,
      self: this.self,
      counterparty: this.counterparty
    })
  }
}

type ChannelCloserProps = Pick<ChannelProps, 'api' | 'counterparty' | 'self'> & {
  pendingWindow: Promise<u64>
  eventRegistry: EventSignalling
  channelId: Hash
}

export class ChannelCloser {
  private _end?: u64

  initialised: boolean = false

  timer?: any

  get end(): Promise<u64> {
    return new Promise<u64>(async (resolve, reject) => {
      if (this._end != null) {
        return resolve(this._end)
      } else {
        const channel = await this.props.api.query.hopr.channels<ChannelEnum>(this.props.channelId)

        // @ts-ignore
        if (channel.isPendingSettlement) {
          // @ts-ignore
          return channel.asPendingSettlement
        } else {
          return reject(`Channel state must be 'PendingSettlement', but is '${channel.type}'`)
        }
      }
    })
  }

  private handlers: Function[] = []

  constructor(private props: ChannelCloserProps) {}

  async initiateSettlement(): Promise<ChannelCloser> {
    let now: u64 = await this.props.api.query.timestamp.now<u64>()

    await this.props.api.tx.hopr.initiateSettlement(this.props.counterparty).signAndSend(this.props.self)

    this.initialised = true

    this.props.eventRegistry.on(PushedBackSettlement(this.props.channelId), (event: Event) => {
      this._end = event.data[0] as u64
    })

    this._end = this.props.api.createType('u64', now.iadd(await this.props.pendingWindow))

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

  onceClosed(): void | Promise<ChannelCloser> {
    Reflect.apply(checkInitialised, this, [])

    return new Promise((resolve, reject) => {
      let index = this.handlers.push(() => {
        this.handlers.splice(index - 1, 1)
        return resolve()
      })
    })
  }

  private async timeoutFactory() {
    const unsub = await this.props.api.query.timestamp.now<u64>(async moment => {
      if (moment.gt(await this.end)) {
        this.handlers.forEach(handler => handler())
      }
      unsub()
      return
    })
  }
}

async function checkFreeBalance(this: { props: Pick<ChannelProps, 'api' | 'self'> }, amount: Balance): Promise<void> {
  this.props.api.query.balances
    .freeBalance<Balance>(this.props.api.createType('AccountId', this.props.self.publicKey))
    .then(balance => {
      if (balance.lt(amount)) throw Error('Insufficient balance. Free balance must be greater than requested balance.')
    })
}

function checkInitialised(this: { initialised: boolean }) {
  if (!this.initialised) throw Error('Cannot alter state unless module is not initialized')
}

function isEventHandler(handler?: EventHandler): handler is EventHandler {
  return handler != null
}

function submitTicket(this: Pick<ChannelProps, 'api'>, signedTicket: SignedLotteryTicket) {
  throw Error('not implemented')
  return this.api.tx.hopr.redeemTicket(signedTicket.signature)
}

function aggregateTickets() {
  throw Error('not implemented')
}

function submitAggregatedTickets() {
  throw Error('not implemented')
}

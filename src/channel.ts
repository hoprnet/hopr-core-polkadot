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
import { Nonce, Channel as ChannelKey } from './db_keys'
import { Opened, EventSignalling, EventHandler } from './events'
import { CodecArg } from '@polkadot/types/types'

const NONCE_HASH_KEY = Uint8Array.from(new TextEncoder().encode('Nonce'))

export type ChannelProps = {
  self: AccountId
  counterparty: AccountId
  db: LevelUp
  api: ApiPromise
}

export class Channel {
  private _channel?: ChannelEnum

  channelId: Hash

  constructor(public props: ChannelProps) {
    this.channelId = getId(this.props.self, this.props.counterparty)
  }

  private get channel(): Promise<ChannelEnum> {
    return new Promise<ChannelEnum>(async (resolve, reject) => {
      if (this._channel) {
        return resolve(this._channel)
      }
      try {
        this._channel = new ChannelEnum(await this.props.db.get(ChannelKey(this.channelId)))
      } catch (err) {
        return reject(err)
      }
      return resolve(this._channel)
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
      if (isPartyA(this.props.self, this.props.counterparty)) {
        return resolve(this.balance_a)
      } else {
        return resolve(new Balance((await this.balance).sub(await this.balance_a)))
      }
    })
  }

  get currentBalanceOfCounterparty(): Promise<Balance> {
    return new Promise(async resolve => {
      if (isPartyA(this.props.self, this.props.counterparty)) {
        return resolve(new Balance((await this.balance).sub(await this.balance_a)))
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
    const { epoch } = (await this.props.api.query.hopr.state(this.props.counterparty)) as State

    const ticket = new LotteryTicket({
      channelId: getId(this.props.self, this.props.counterparty),
      epoch,
      challenge,
      amount,
      winProb
    })

    const signature = sr25519Sign(this.props.self.toU8a(), secretKey, ticket.toU8a())

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

  async testAndSetNonce(signature: Uint8Array): Promise<void> {
    const nonce = blake2b(signature, NONCE_HASH_KEY, 256)

    const key = Nonce(this.channelId, new Hash(nonce))

    await this.props.db.get(key).then(_ => {
      throw Error('Nonces must not be used twice.')
    })
  }

  static async open(props: ChannelProps, amount: Balance, eventRegistry: EventSignalling): Promise<ChannelOpener> {
    let channelId = getId(props.self, props.counterparty)

    await Promise.all([
      props.db.get(ChannelKey(channelId)).then(_ => {
        throw Error('Channel must not exit.')
      }),
      Reflect.apply(checkFreeBalance, this, [])
    ])

    // @ts-ignore
    await api.tx.hopr.create(amount, counterparty).signAndSend(self)

    return new ChannelOpener({
      ...props,
      eventRegistry,
      channelId,
      amount
    })
  }
  async initiateSettlement(): Promise<void> {}
}

type ChannelOpenerProps = ChannelProps & {
  eventRegistry: EventSignalling
  channelId: Hash
  amount: Balance
}

class ChannelOpener {
  constructor(private props: ChannelOpenerProps) {}

  async increaseFunds(newAmount: Balance): Promise<ChannelOpener> {
    await Reflect.apply(checkFreeBalance, this, [newAmount])

    if (isPartyA(this.props.self, this.props.counterparty)) {
      this.props.amount.iadd(newAmount)
    } else {
      this.props.amount.isub(newAmount)
    }

    // @ts-ignore
    await this.props.api.tx.hopr.create(newAmount, this.props.counterparty).signAndSend(this.props.self)

    return this
  }

  onceFundedByCounterparty(handler: EventHandler): ChannelOpener {
    this.props.eventRegistry.on(Opened(this.props.channelId), handler)

    return this
  }

  async setActive(this: ChannelOpener & ChannelOpenerProps, signature: Signature): Promise<Channel> {
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

class ChannelCloser {
    // @TODO
}

async function checkFreeBalance(this: Pick<ChannelProps, 'api' | 'self'>, amount: Balance): Promise<void> {
  this.api.query.balances.freeBalance(this.self).then((balance: CodecArg) => {
    if ((balance as Balance).lt(amount))
      throw Error('Insufficient balance. Free balance must be greater than requested balance.')
  })
}

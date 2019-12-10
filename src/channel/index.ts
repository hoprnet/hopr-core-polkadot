import {
  LotteryTicket,
  State,
  Channel as ChannelEnum,
  Funded,
  Active,
  PendingSettlement,
  ChannelBalance
} from '../srml_types'
import { SignedLotteryTicket, Signature } from '../types'
import { sr25519Verify, sr25519Sign, blake2b } from '@polkadot/wasm-crypto'
import HoprPolkadot from '..'
import { isPartyA, getId } from '../utils'
import { Nonce, Channel as ChannelKey } from '../db_keys'
import { EventSignalling } from '../events'
import { Moment, Balance, AccountId, Hash } from '@polkadot/types/interfaces'
import { ChannelSettler } from './settle'
import { ChannelOpener } from './open'
export * from './settle'
export * from './open'

const NONCE_HASH_KEY = Uint8Array.from(new TextEncoder().encode('Nonce'))

export type ChannelProps = {
  hoprPolkadot: HoprPolkadot
  counterparty: AccountId
}

export class Channel {
  private _channel?: ChannelEnum
  private _settlementWindow?: Moment
  private _channelId?: Hash

  private constructor(public props: ChannelProps) {}

  get channelId(): Promise<Hash> {
    return new Promise(async (resolve, reject) => {
      if (this._channelId == null) {
        try {
          this._channelId = await getId(
            this.props.hoprPolkadot.api,
            this.props.hoprPolkadot.api.createType('AccountId', this.props.hoprPolkadot.self.publicKey),
            this.props.counterparty
          )
        } catch (err) {
          return reject(err)
        }
      }

      resolve(this._channelId)
    })
  }

  private get channel(): Promise<ChannelEnum> {
    return new Promise<ChannelEnum>(async (resolve, reject) => {
      if (this._channel == null) {
        try {
          this._channel = new ChannelEnum(await this.props.hoprPolkadot.db.get(ChannelKey(await this.channelId)))
        } catch (err) {
          return reject(err)
        }
      }

      return resolve(this._channel)
    })
  }

  get settlementWindow(): Promise<Moment> {
    return new Promise<Moment>(async (resolve, reject) => {
      if (this._settlementWindow == null) {
        try {
          this._settlementWindow = this.props.hoprPolkadot.api.consts.hopr.pendingWindow as Moment
        } catch (err) {
          return reject(err)
        }
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
      if (
        isPartyA(
          this.props.hoprPolkadot.api.createType('AccountId', this.props.hoprPolkadot.self.publicKey),
          this.props.counterparty
        )
      ) {
        return resolve(this.balance_a)
      } else {
        return resolve(
          this.props.hoprPolkadot.api.createType('Balance', (await this.balance).sub(await this.balance_a))
        )
      }
    })
  }

  get currentBalanceOfCounterparty(): Promise<Balance> {
    return new Promise(async resolve => {
      if (
        isPartyA(
          this.props.hoprPolkadot.api.createType('AccountId', this.props.hoprPolkadot.self.publicKey),
          this.props.counterparty
        )
      ) {
        return resolve(
          this.props.hoprPolkadot.api.createType('Balance', (await this.balance).sub(await this.balance_a))
        )
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
    const { epoch } = await this.props.hoprPolkadot.api.query.hopr.state<State>(this.props.counterparty)

    const ticket = new LotteryTicket(this.props.hoprPolkadot.api.registry, {
      channelId: await this.channelId,
      epoch,
      challenge,
      amount,
      winProb
    })

    const signature = sr25519Sign(this.props.hoprPolkadot.self.publicKey, secretKey, ticket.toU8a())

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

  async initiateSettlement(eventRegistry: EventSignalling): Promise<ChannelSettler> {
    return ChannelSettler.create({
      hoprPolkadot: this.props.hoprPolkadot,
      counterparty: this.props.counterparty,
      channelId: await this.channelId,
      settlementWindow: await this.settlementWindow
    })
  }

  static async fromDatabase(props: ChannelProps) {
    const channel = new Channel(props)

    let record
    try {
      record = await props.hoprPolkadot.db.get(ChannelKey(await channel.channelId))
    } catch (err) {
      throw Error(`Cannot find a database entry for channel '${(await channel.channelId).toString()}'`)
    }

    return channel
  }

  static async open(props: ChannelProps, amount: Balance, signature: Promise<Signature>) {
    const channelOpener = await ChannelOpener.create({
      hoprPolkadot: props.hoprPolkadot,
      counterparty: props.counterparty,
      amount
    })

    await (await (await channelOpener.increaseFunds(amount)).onceOpen()).setActive(await signature)

    const channel = new Channel(props)

    await props.hoprPolkadot.db.put(ChannelKey(await channel.channelId), '')

    return channel
  }

  private async testAndSetNonce(signature: Uint8Array): Promise<void> {
    const nonce = blake2b(signature, NONCE_HASH_KEY, 256)

    const key = Nonce(await this.channelId, this.props.hoprPolkadot.api.createType('Hash', nonce))

    await this.props.hoprPolkadot.db.get(key).then(_ => {
      throw Error('Nonces must not be used twice.')
    })
  }
}

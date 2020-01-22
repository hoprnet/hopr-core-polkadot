import { Hash, Ticket, State, Channel as ChannelEnum, SignedTicket, Balance } from '../srml_types'
import { blake2b, waitReady } from '@polkadot/wasm-crypto'
import { Moment, AccountId } from '@polkadot/types/interfaces'
import { ChannelSettler } from './settle'
import { createTypeUnsafe } from '@polkadot/types'

import { HoprPolkadotClass } from '..'
import BN from 'bn.js'

const NONCE_HASH_KEY = Uint8Array.from(new TextEncoder().encode('Nonce'))

const WIN_PROB = new BN(1)

import { ChannelClass as ChannelClassInterface } from '@hoprnet/hopr-core-connector-interface'

export class ChannelClass implements ChannelClassInterface {
  private _channel?: ChannelEnum
  private _settlementWindow?: Moment
  private _channelId?: Hash

  constructor(private hoprPolkadot: HoprPolkadotClass, private counterparty: AccountId, channel?: ChannelEnum) {
    if (channel != null) {
      this._channel = channel
    }
  }

  get channelId(): Promise<Hash> {
    if (this._channelId != null) {
      return Promise.resolve<Hash>(this._channelId)
    }

    return new Promise(async (resolve, reject) => {
      try {
        this._channelId = await this.hoprPolkadot.utils.getId(
          this.hoprPolkadot.api.createType('AccountId', this.hoprPolkadot.self.publicKey),
          this.counterparty,
          this.hoprPolkadot.api
        )
      } catch (err) {
        return reject(err)
      }

      resolve(this._channelId)
    })
  }

  private get channel(): Promise<ChannelEnum> {
    if (this._channel != null) {
      return Promise.resolve<ChannelEnum>(this._channel)
    }

    return new Promise<ChannelEnum>(async (resolve, reject) => {
      try {
        this._channel = createTypeUnsafe<ChannelEnum>(this.hoprPolkadot.api.registry, 'Channel', [
          await this.hoprPolkadot.db.get(this.hoprPolkadot.dbKeys.Channel(this.counterparty))
        ])
      } catch (err) {
        return reject(err)
      }

      return resolve(this._channel)
    })
  }

  get settlementWindow(): Promise<Moment> {
    if (this._settlementWindow != null) {
      return Promise.resolve<Moment>(this._settlementWindow)
    }

    return new Promise<Moment>(async (resolve, reject) => {
      try {
        this._settlementWindow = await this.hoprPolkadot.api.query.hopr.pendingWindow<Moment>()
      } catch (err) {
        return reject(err)
      }

      return resolve(this._settlementWindow)
    })
  }

  get state(): Promise<ChannelEnum> {
    return this.channel
  }

  get balance_a(): Promise<Balance> {
    return this.channel.then(channel => {
      switch (channel.type) {
        case 'Funded':
          return channel.asFunded.balance_a
        case 'Active':
          return channel.asActive.balance_a
        case 'PendingSettlement':
          return channel.asPendingSettlement[0].balance_a
        default:
          throw Error(`Invalid state. Got '${channel.type}'`)
      }
    })
  }

  get balance(): Promise<Balance> {
    return this.channel.then(channel => {
      switch (channel.type) {
        case 'Funded':
          return channel.asFunded.balance
        case 'Active':
          return channel.asActive.balance
        case 'PendingSettlement':
          return channel.asPendingSettlement[0].balance
        default:
          throw Error(`Invalid state. Got '${channel.type}'`)
      }
    })
  }

  get currentBalance(): Promise<Balance> {
    if (
      this.hoprPolkadot.utils.isPartyA(
        this.hoprPolkadot.api.createType('AccountId', this.hoprPolkadot.self.publicKey),
        this.counterparty
      )
    ) {
      return Promise.resolve<Balance>(this.balance_a)
    }

    return new Promise<Balance>(async resolve => {
      return resolve(this.hoprPolkadot.api.createType('Balance', (await this.balance).sub(await this.balance_a)))
    })
  }

  get currentBalanceOfCounterparty(): Promise<Balance> {
    if (
      !this.hoprPolkadot.utils.isPartyA(
        this.hoprPolkadot.api.createType('AccountId', this.hoprPolkadot.self.publicKey),
        this.counterparty
      )
    ) {
      return Promise.resolve<Balance>(this.balance_a)
    }
    return new Promise<Balance>(async resolve => {
      return resolve(this.hoprPolkadot.api.createType('Balance', (await this.balance).sub(await this.balance_a)))
    })
  }

  ticket = {
    channel: this as ChannelClass,
    async create(amount: Balance, challenge: Hash, privKey: Uint8Array, pubKey: Uint8Array): Promise<SignedTicket> {
      const { secret } = await this.channel.hoprPolkadot.api.query.hopr.state<State>(this.channel.counterparty)

      const winProb = createTypeUnsafe<Hash>(this.channel.hoprPolkadot.api.registry, 'Hash', [
        new BN(new Uint8Array(Hash.length).fill(0xff)).div(WIN_PROB).toArray('le', Hash.length)
      ])
      const channelId = await this.channel.channelId

      const ticket = createTypeUnsafe<Ticket>(this.channel.hoprPolkadot.api.registry, 'Ticket', [
        {
          channelId,
          epoch: new BN(0),
          challenge,
          onChainSecret: secret,
          amount,
          winProb
        }
      ])

      const signature = await this.channel.hoprPolkadot.utils.sign(ticket.toU8a(), privKey, pubKey)

      return new SignedTicket(signature, ticket)
    },
    async verify(signedTicket: SignedTicket): Promise<boolean> {
      if (
        (await this.channel.currentBalanceOfCounterparty).add(signedTicket.ticket.amount).gt(await this.channel.balance)
      ) {
        return false
      }

      try {
        await this.channel.testAndSetNonce(signedTicket.toU8a())
      } catch (_) {
        return false
      }

      return this.channel.hoprPolkadot.utils.verify(
        signedTicket.ticket.toU8a(),
        signedTicket.signature,
        this.channel.counterparty
      )
    },
    async submit(signedTicket: SignedTicket) {}
    // async aggregate(tickets: Ticket[]): Promise<Ticket> {
    //   throw Error('not implemented')
    //   return Promise.resolve(tickets[0])
    // }
  }

  async initiateSettlement(): Promise<void> {
    let channelSettler: ChannelSettler

    try {
      channelSettler = await ChannelSettler.create({
        hoprPolkadot: this.hoprPolkadot,
        counterparty: this.counterparty,
        channelId: await this.channelId,
        settlementWindow: await this.settlementWindow
      })
    } catch (err) {
      throw err
    }

    await Promise.all([channelSettler.onceClosed().then(() => channelSettler.withdraw()), channelSettler.init()])
  }

  async getPreviousChallenges(): Promise<Hash> {
    let pubKeys: Uint8Array[] = []

    return new Promise<Hash>(async (resolve, reject) => {
      this.hoprPolkadot.db
        .createReadStream({
          gt: this.hoprPolkadot.dbKeys.Challenge(
            await this.channelId,
            this.hoprPolkadot.api.createType('Hash', new Uint8Array(Hash.length).fill(0x00))
          ),
          lt: this.hoprPolkadot.dbKeys.Challenge(
            await this.channelId,
            this.hoprPolkadot.api.createType('Hash', new Uint8Array(Hash.length).fill(0x00))
          )
        })
        .on('error', reject)
        .on('data', ({ key, ownKeyHalf }) => {
          const [channelId, challenge] = this.hoprPolkadot.dbKeys.ChallengeKeyParse(key, this.hoprPolkadot.api)

          // BIG TODO !!
          // replace this by proper EC-arithmetic
          pubKeys.push(this.hoprPolkadot.utils.u8aXOR(false, challenge.toU8a(), ownKeyHalf.toU8a()))
        })
        .on('end', () => {
          if (pubKeys.length > 0) {
            return resolve(this.hoprPolkadot.api.createType('Hash', this.hoprPolkadot.utils.u8aXOR(false, ...pubKeys)))
          }

          resolve()
        })
    })
  }

  private async testAndSetNonce(signature: Uint8Array): Promise<void> {
    await waitReady()
    const nonce = blake2b(signature, NONCE_HASH_KEY, 32)

    const key = this.hoprPolkadot.dbKeys.Nonce(await this.channelId, this.hoprPolkadot.api.createType('Hash', nonce))

    await this.hoprPolkadot.db.get(Buffer.from(key)).then(
      () => {
        throw Error('Nonces must not be used twice.')
      },
      (err: any) => {
        if (err.notFound == null || !err.notFound) {
          throw err
        }
      }
    )
  }
}

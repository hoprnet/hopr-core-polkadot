import { Struct } from '@polkadot/types/codec'
import { createTypeUnsafe } from '@polkadot/types'

import BN from 'bn.js'

import { Channel as ChannelInstance } from '../channel'

import { Hash, TicketEpoch, Balance } from './base'
import { SignedTicket } from './signedTicket'
import { State } from './state'

import { sign, verify } from '../utils'

import { Types } from '@hoprnet/hopr-core-connector-interface'

const WIN_PROB = new BN(1)

class Ticket
  extends Struct.with({
    channelId: Hash,
    challenge: Hash,
    epoch: TicketEpoch,
    amount: Balance,
    winProb: Hash,
    onChainSecret: Hash
  })
  implements Types.Ticket {
  declare channelId: Hash
  declare challenge: Hash
  declare epoch: TicketEpoch
  declare amount: Balance
  declare winProb: Hash
  declare onChainSecret: Hash

  getEmbeddedFunds() {
    return this.amount.mul(new BN(this.winProb)).div(new BN(new Uint8Array(Hash.SIZE).fill(0xff)))
  }

  static get SIZE(): number {
    return Hash.SIZE + Hash.SIZE + TicketEpoch.SIZE + Balance.SIZE + Hash.SIZE + Hash.SIZE
  }

  static async create(
    channel: ChannelInstance,
    amount: Balance,
    challenge: Hash
  ): Promise<SignedTicket> {
    const { secret } = await channel.hoprPolkadot.api.query.hopr.states<State>(channel.counterparty)

    const winProb = channel.hoprPolkadot.api.createType(
      'Hash',
      new BN(new Uint8Array(Hash.SIZE).fill(0xff)).div(WIN_PROB).toArray('le', Hash.SIZE)
    )

    const channelId = await channel.channelId

    const ticket = createTypeUnsafe<Ticket>(channel.hoprPolkadot.api.registry, 'Ticket', [
      {
        channelId,
        epoch: new BN(0),
        challenge,
        onChainSecret: secret,
        amount,
        winProb
      }
    ])

    const signature = await sign(ticket.hash, channel.hoprPolkadot.self.privateKey, channel.hoprPolkadot.self.publicKey)

    return new SignedTicket(undefined, {
      signature,
      ticket
    })
  }

  static async verify(channel: ChannelInstance, signedTicket: SignedTicket): Promise<boolean> {
    if ((await channel.currentBalanceOfCounterparty).add(signedTicket.ticket.amount).gt(await channel.balance)) {
      return false
    }

    try {
      await channel.testAndSetNonce(signedTicket)
    } catch {
      return false
    }

    return verify(signedTicket.ticket.hash, signedTicket.signature, channel.offChainCounterparty)
  }

  static async submit(channel: ChannelInstance, signedTicket: SignedTicket) {}
  // async aggregate(tickets: Ticket[]): Promise<Ticket> {
  //   throw Error('not implemented')
  //   return Promise.resolve(tickets[0])
  // }
}

export { Ticket }

import { Hash, TicketEpoch, Balance } from '../srml_types'
import { Struct } from '@polkadot/types/codec'
import BN from 'bn.js'

import { Ticket as ITicket } from '@hoprnet/hopr-core-connector-interface'


export default class Ticket extends Struct.with({
    channelId: Hash,
    challenge: Hash,
    epoch: TicketEpoch,
    amount: Balance,
    winProb: Hash,
    onChainSecret: Hash
  }) implements ITicket {
    declare channelId: Hash
    declare challenge: Hash
    declare epoch: TicketEpoch
    declare amount: Balance
    declare winProb: Hash
    declare onChainSecret: Hash

    getEmbeddedFunds() {
        return this.amount.mul(new BN(this.winProb)).div(new BN(new Uint8Array(Hash.length).fill(0xFF)))
    }
  }
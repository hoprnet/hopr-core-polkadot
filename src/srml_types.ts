import { Null, u32, u64, u128, H256 } from '@polkadot/types'
import { Registry } from '@polkadot/types/types'
import { Struct, Enum, Tuple } from '@polkadot/types/codec'
import { u8aConcat } from '@polkadot/util'

import { TypeClasses } from '@hoprnet/hopr-core-connector-interface'

export class Balance extends u128 implements TypeClasses.Balance {}
export class Moment extends u64 implements TypeClasses.Moment{}
export class Hash extends H256 implements TypeClasses.Hash {}
export class Public extends H256 {}
export class AccountId extends Public implements TypeClasses.AccountId {}
export class TicketEpoch extends u32 {}

export class ChannelBalance extends Struct.with({
  balance: Balance,
  balance_a: Balance
}) {
  declare balance: Balance
  declare balance_a: Balance
}

export class Uninitialized extends Null {
  commonName: string = 'Uninitialized'
}

export class Funded extends ChannelBalance {
  commonName: string = 'Funded'

  toString(): string {
    return `{\n\tbalance: ${this.balance.toString()},\n\tbalance_a: ${this.balance_a.toString()}\n}`
  }
}

export class Active extends ChannelBalance {
  commonName: string = 'Active'

  toString(): string {
    return `{\n\tbalance: ${this.balance.toString()},\n\tbalance_a: ${this.balance_a.toString()}\n}`
  }
}

export class PendingSettlement extends Tuple.with([ChannelBalance, Moment]) {
  commonName: string = 'PendingSettlement'

  declare 0: ChannelBalance
  declare 1: Moment

  toString(): string {
    return `{\n\tbalance: ${this[0].balance.toString()},\n\tbalance_a: ${this[0].balance_a.toString()},\n\tmoment: ${this[1].toString()}\n}`
  }
}

export class Channel extends Enum.with({
  uninitialized: Uninitialized,
  funded: Funded,
  active: Active,
  pendingSettlement: PendingSettlement
}) implements TypeClasses.Channel {
  declare asUninitialized: Uninitialized
  declare asFunded: Funded
  declare asActive: Active
  declare asPendingSettlement: PendingSettlement

  declare isUninitialized: boolean
  declare isFunded: boolean
  declare isActive: boolean
  declare isPendingSettlement: boolean

  constructor(registry: Registry, value: Uninitialized | Funded | Active | PendingSettlement | Uint8Array) {
    if (value instanceof Uint8Array) {
      super(registry, value.subarray(1), value.subarray(0, 1)[0])
      return
    }

    switch (value.commonName) {
      case 'Uninitialized':
        super(registry, value, 0)
        break
      case 'Funded':
        super(registry, value, 1)
        break
      case 'Active':
        super(registry, value, 2)
        break
      case 'PendingSettlement':
        super(registry, value, 3)
        break
    }
  }

  toString(): string {
    let str = ''
    if (this.isUninitialized) {
      str += Uninitialized.name
    } else if (this.isFunded) {
      str += Funded.name
    } else if (this.isActive) {
      str += Active.name
    } else if (this.isPendingSettlement) {
      str += PendingSettlement.name
    }

    str += this.value.toString()
    return str
  }
}

export class Signature extends Uint8Array {}

export class SignedTicket implements TypeClasses.SignedTicket {
  constructor(public ticket: Ticket, public signature: Uint8Array) {}

  toU8a(): Uint8Array {
    return u8aConcat(this.ticket.toU8a(), this.signature)
  }
}

export class State extends Struct.with({
  epoch: TicketEpoch,
  secret: Hash,
  pubkey: Public
}) {
  declare secret: Hash
  declare pubkey: Public
  declare epoch: TicketEpoch
}

export class Ticket extends Struct.with({
  channelId: Hash,
  challenge: Hash,
  epoch: TicketEpoch,
  amount: Balance,
  winProb: Hash,
  onChainSecret: Hash
}) {
  declare channelId: Hash
  declare challenge: Hash
  declare epoch: TicketEpoch
  declare amount: Balance
  declare winProb: Hash
  declare onChainSecret: Hash
}

const SRMLTypes = {
  AccountId,
  Balance,
  Moment,
  Hash,
  Public,
  ChannelBalance,
  Channel,
  Funded,
  State,
  Ticket,
  TicketEpoch
}

const Types = {
  SignedTicket: SignedTicket,
  ...SRMLTypes
}

export { SRMLTypes, Types }

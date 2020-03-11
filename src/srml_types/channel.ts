import { Struct, Enum, Tuple } from '@polkadot/types/codec'
import type { Registry } from '@polkadot/types/types'
import { TypeRegistry } from '@polkadot/types'

import { Null } from '@polkadot/types'

import { Balance, Moment } from './base'

import type { Types } from '@hoprnet/hopr-core-connector-interface'
import type BN from 'bn.js'

type ChannelBalanceConstructor = {
  balance: number | BN,
  balance_a: number | BN
}

class ChannelBalance extends Struct.with({
  balance: Balance,
  balance_a: Balance
}) {
  declare balance: Balance
  declare balance_a: Balance

  static get SIZE(): number {
    return Balance.SIZE + Balance.SIZE
  }
}

class Uninitialized extends Null {
  commonName: string = 'Uninitialized'
}

class Funded extends ChannelBalance {
  commonName: string = 'Funded'

  toString(): string {
    return `{\n\tbalance: ${this.balance.toString()},\n\tbalance_a: ${this.balance_a.toString()}\n}`
  }
}

class Active extends ChannelBalance {
  commonName: string = 'Active'

  toString(): string {
    return `{\n\tbalance: ${this.balance.toString()},\n\tbalance_a: ${this.balance_a.toString()}\n}`
  }
}

class PendingSettlement extends Tuple.with([ChannelBalance, Moment]) {
  commonName: string = 'PendingSettlement'

  declare 0: ChannelBalance
  declare 1: Moment

  toString(): string {
    return `{\n\tbalance: ${this[0].balance.toString()},\n\tbalance_a: ${this[0].balance_a.toString()},\n\tmoment: ${this[1].toString()}\n}`
  }
}

class Channel
  extends Enum.with({
    Uninitialized,
    Funded,
    Active,
    PendingSettlement
  })
  implements Types.Channel {
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

  static createFunded(balance: ChannelBalanceConstructor | ChannelBalance): Channel {
    const registry = new TypeRegistry()
    return new Channel(registry, new Funded(registry, balance))
  }

  static createActive(balance: ChannelBalanceConstructor | ChannelBalance): Channel {
    const registry = new TypeRegistry()
    return new Channel(registry, new Active(registry, balance))
  }

  static createPending(moment: BN | Moment, balance: ChannelBalanceConstructor | ChannelBalance): Channel {
    const registry = new TypeRegistry()
    return new Channel(registry, new PendingSettlement(registry, [balance, moment]))
  }

  static get SIZE(): number {
    throw Error('not implemented')
    return 0
  }
}

export { ChannelBalance, Uninitialized, Funded, Active, PendingSettlement, Channel }

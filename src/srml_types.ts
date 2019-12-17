import { Null, u32, u64, u128, H256 } from '@polkadot/types'
import { Registry } from '@polkadot/types/types'
import { Struct, Enum, Tuple } from '@polkadot/types/codec'
import {
  Moment as IMoment,
  Balance as IBalance,
  Hash as IHash,
  AccountId as IAccountId
} from '@polkadot/types/interfaces'

export class Balance extends u128 implements IBalance {}
export class Moment extends u64 implements IMoment {}
export class Hash extends H256 implements IHash {}
export class Public extends H256 {}
export class AccountId extends Public implements IAccountId {}
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
}

export class Active extends ChannelBalance {
  commonName: string = 'Active'
}

export class PendingSettlement extends Tuple.with([ChannelBalance, Moment]) {
  commonName: string = 'PendingSettlement'

  declare 0: ChannelBalance
  declare 1: Moment
}

export class Channel extends Enum.with({
  uninitialized: Uninitialized,
  funded: Funded,
  active: Active,
  pendingSettlement: PendingSettlement
}) {
  declare asUninitialized: Uninitialized
  declare asFunded: Funded
  declare asActive: Active
  declare asPendingSettlement: PendingSettlement

  declare isUninitialized: boolean
  declare isFunded: boolean
  declare isActive: boolean
  declare isPendingSettlement: boolean

  constructor(
    registry: Registry,
    value: Uninitialized | Funded | Active | PendingSettlement | Uint8Array,
  ) {
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

export class LotteryTicket extends Struct.with({
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

export const Types = {
  Balance: Balance,
  Moment: Moment,
  Hash: Hash,
  Public: Public,
  ChannelBalance: ChannelBalance,
  Channel: Channel,
  Funded: Funded,
  ChannelId: Hash,
  PreImage: Hash,
  State: State,
  LotteryTicket: LotteryTicket
}

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

export class ChannelBalance extends Struct {
  constructor(registry: Registry, value: any) {
    super(
      registry,
      {
        balance: Balance,
        balance_a: Balance
      },
      value
    )
  }

  get balance(): Balance {
    return this.get('balance') as Balance
  }

  get balance_a(): Balance {
    return this.get('balance_a') as Balance
  }
}

export class Uninitialized extends Null {
  toRawType() {
    return 'Uninitialized'
  }
}

export class Funded extends ChannelBalance {
  toRawType() {
    return 'Funded'
  }
}

export class Active extends ChannelBalance {
  toRawType() {
    return 'Active'
  }
}

export class PendingSettlement extends Tuple.with([ChannelBalance, Moment]) {
  toRawType() {
    return 'PendingSettlement'
  }
}

export class Channel extends Enum {
  constructor(registry: Registry, value: Uninitialized | Funded | Active | PendingSettlement) {
    let index

    switch (value.toRawType()) {
      case 'Uninitialized':
        index = 0
        break
      case 'Funded':
        index = 1
        break
      case 'Active':
        index = 2
        break
      case 'PendingSettlement':
        index = 3
        break
    }

    super(
      registry,
      {
        uninitialized: Uninitialized,
        funded: Funded,
        active: Active,
        pendingSettlement: PendingSettlement
      },
      value,
      index
    )
  }

  toRawType() {
    return 'Channel'
  }
}

// .with({
//   Uninitialized,
//   Funded,
//   Active,
//   PendingSettlement
// }) {}

export class State extends Struct {
  constructor(registry: Registry, value: any) {
    super(
      registry,
      {
        epoch: TicketEpoch,
        secret: Hash,
        pubkey: Public
      },
      value
    )
  }

  get secret(): Hash {
    return this.get('secret') as Hash
  }

  get pubkey(): Public {
    return this.get('pubkey') as Public
  }

  get epoch(): TicketEpoch {
    return this.get('epoch') as TicketEpoch
  }
}

export class LotteryTicket extends Struct {
  constructor(registry: Registry, value: any) {
    super(
      registry,
      {
        channelId: Hash,
        challenge: Hash,
        epoch: TicketEpoch,
        amount: Balance,
        winProb: Hash
      },
      value
    )
  }

  get channelId(): Hash {
    return this.get('channelId') as Hash
  }

  get challenge(): Hash {
    return this.get('challenge') as Hash
  }

  get onChainSecret(): Hash {
    return this.get('onChainSecret') as Hash
  }

  get amount(): Balance {
    return this.get('amount') as Balance
  }

  get winProb(): Hash {
    return this.get('winProb') as Hash
  }
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

import { u32, u64, u128, H256 } from '@polkadot/types'

import { Types } from '@hoprnet/hopr-core-connector-interface'

import {
  AccountId as IAccountId,
  Balance as IBalance,
  Hash as IHash,
  Moment as IMoment
} from '@polkadot/types/interfaces'

class Balance extends u128 implements Types.Balance, IBalance {
  static get SIZE(): number {
    return 16
  }

  static get SYMBOL(): string {
    return `HOPR`
  }

  static get DECIMALS(): number {
    return 18
  }
}

class Moment extends u64 implements Types.Moment, IMoment {
  static get SIZE(): number {
    return 8
  }
}

class Hash extends H256 implements Types.Hash, IHash {
  static get SIZE(): number {
    return 32
  }
}

class Public extends H256 {
  static get SIZE(): number {
    return 32
  }
}

class AccountId extends Public implements Types.AccountId, IAccountId {
  static get SIZE(): number {
    return 32
  }
}

class TicketEpoch extends u32 implements Types.TicketEpoch {
  static get SIZE(): number {
    return 32
  }
}

class ChannelId extends H256 implements IHash {
  static get SIZE(): number {
    return 32
  }
}

class PreImage extends H256 implements IHash {
  static get SIZE(): number {
    return 32
  }
}

export { Balance, Moment, Hash, Public, AccountId, TicketEpoch, ChannelId, PreImage }

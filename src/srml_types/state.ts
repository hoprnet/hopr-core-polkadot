import { Struct } from '@polkadot/types/codec'

import { TicketEpoch, Hash, Public } from './base'

import type { Types } from '@hoprnet/hopr-core-connector-interface'

class State extends Struct.with({
  epoch: TicketEpoch,
  secret: Hash,
  pubkey: Public
}) implements Types.State {
  declare secret: Hash
  declare pubkey: Public
  declare epoch: TicketEpoch

  static get SIZE(): number {
    return Hash.SIZE + Public.SIZE + TicketEpoch.SIZE
  }
}

export { State }

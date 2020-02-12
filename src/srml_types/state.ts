import { Struct } from '@polkadot/types/codec'

import { TicketEpoch, Hash, Public } from './base'

class State extends Struct.with({
  epoch: TicketEpoch,
  secret: Hash,
  pubkey: Public
}) {
  declare secret: Hash
  declare pubkey: Public
  declare epoch: TicketEpoch

  static get SIZE(): number {
    return Hash.SIZE + Public.SIZE + TicketEpoch.SIZE
  }
}

export { State }

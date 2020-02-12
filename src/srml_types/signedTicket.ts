import secp256k1 from 'secp256k1'

import { TypeRegistry } from '@polkadot/types'
import { u8aConcat } from '@polkadot/util'

import { Types } from '@hoprnet/hopr-core-connector-interface'

import { Ticket } from './ticket'
import { Signature } from './signature'

import Utils from '../utils'

const utils = new Utils()

class SignedTicket extends Uint8Array implements Types.SignedTicket {
  constructor(
    arr?: Uint8Array,
    struct?: {
      signature: Signature
      ticket: Ticket
    }
  ) {
    if (arr != null && struct == null) {
      super(arr)
    } else if (arr == null && struct != null) {
      super(u8aConcat(struct.signature, struct.ticket.toU8a()))
    } else {
      throw Error(`Invalid constructor arguments.`)
    }
  }

  subarray(begin: number, end?: number): Uint8Array {
    return new Uint8Array(this.buffer, begin, end != null ? end - begin : undefined)
  }

  get ticket(): Ticket {
    const registry = new TypeRegistry()
    registry.register(Ticket)

    return new Ticket(registry, this.subarray(Signature.SIZE))
  }

  get signature(): Signature {
    return new Signature(this.subarray(0, Signature.SIZE))
  }

  static get SIZE() {
    return Signature.SIZE + Ticket.SIZE
  }

  get signer(): Promise<Uint8Array> {
    return new Promise<Uint8Array>(async (resolve, reject) => {
      try {
        resolve(
          secp256k1.recover(
            Buffer.from(await utils.hash(this.ticket.toU8a())),
            Buffer.from(this.signature.signature),
            this.signature.recovery
          )
        )
      } catch (err) {
        reject(err)
      }
    })
  }
}

export { SignedTicket }

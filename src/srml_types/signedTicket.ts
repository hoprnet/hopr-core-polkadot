import secp256k1 from 'secp256k1'

import { TypeRegistry } from '@polkadot/types'
import { u8aConcat } from '@polkadot/util'

import { Types } from '@hoprnet/hopr-core-connector-interface'

import { Ticket } from './ticket'
import { Signature } from './signature'

import { hash } from '../utils'

class SignedTicket extends Uint8Array implements Types.SignedTicket {
  constructor(
    arr?: {
      bytes: Uint8Array
      offset: number
    },
    struct?: {
      signature: Signature
      ticket: Ticket
    }
  ) {
    if (arr != null && struct == null) {
      super(arr.bytes, arr.offset, SignedTicket.SIZE)
    } else if (arr == null && struct != null) {
      const ticket = struct.ticket.toU8a()
      if (ticket.length == Ticket.SIZE) {
        super(u8aConcat(struct.signature, ticket))
      } else if (ticket.length < Ticket.SIZE) {
        super(u8aConcat(struct.signature, ticket, new Uint8Array(Ticket.SIZE - ticket.length)))
      } else {
        throw Error(`Ticket is too big by ${ticket.length - Ticket.SIZE} elements.`)
      }
    } else {
      throw Error(`Invalid constructor arguments.`)
    }
  }

  subarray(begin?: number, end?: number): Uint8Array {
    return new Uint8Array(
      this.buffer,
      (begin != null ? begin : 0) + this.byteOffset,
      end != null && begin != null ? end - begin : undefined
    )
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
            Buffer.from(await hash(this.ticket.toU8a())),
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

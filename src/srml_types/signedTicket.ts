import secp256k1 from 'secp256k1'

import { TypeRegistry } from '@polkadot/types'
import { u8aConcat } from '@polkadot/util'
import { hash } from '../utils'

import type { Types } from '@hoprnet/hopr-core-connector-interface'

import { Ticket } from './ticket'
import { Signature } from './signature'

class SignedTicket extends Uint8Array implements Types.SignedTicket<Ticket, Signature> {
  private _ticket?: Ticket
  private _signature?: Signature

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

  static create(
    arr?: {
      bytes: Uint8Array
      offset: number
    },
    struct?: {
      signature: Signature
      ticket: Ticket
    }
  ): SignedTicket {
    return new SignedTicket(arr, struct)
  }

  subarray(begin: number = 0, end: number = SignedTicket.SIZE): Uint8Array {
    return new Uint8Array(this.buffer, begin + this.byteOffset, end - begin)
  }

  get ticket(): Ticket {
    const registry = new TypeRegistry()
    registry.register(Ticket)

    if (this._ticket == null) {
      this._ticket = new Ticket(registry, this.subarray(Signature.SIZE, Signature.SIZE + Ticket.SIZE))
    }

    return this._ticket
  }

  get signature(): Signature {
    if (this._signature == null) {
      this._signature = new Signature({
        bytes: this.buffer,
        offset: this.byteOffset
      })
    }

    return this._signature
  }

  static get SIZE() {
    return Signature.SIZE + Ticket.SIZE
  }

  get signer(): Promise<Uint8Array> {
    return new Promise<Uint8Array>(async (resolve, reject) => {
      try {
        resolve(secp256k1.ecdsaRecover(
          this.signature.signature,
          this.signature.recovery,
          await hash(u8aConcat(this.signature.sr25519PublicKey, this.ticket.hash))
        ))
      } catch (err) {
        reject(err)
      }
    })
  }
}

export { SignedTicket }

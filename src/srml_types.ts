import { Null, u32, u64, u128, H256, TypeRegistry } from '@polkadot/types'
import { Registry } from '@polkadot/types/types'
import {
  AccountId as IAccountId,
  Balance as IBalance,
  Hash as IHash,
  Moment as IMoment
} from '@polkadot/types/interfaces'
import { Struct, Enum, Tuple } from '@polkadot/types/codec'
import { u8aConcat } from '@polkadot/util'
import BN from 'bn.js'
import secp256k1 from 'secp256k1'

import { Types } from '@hoprnet/hopr-core-connector-interface'
import { Channel as ConcreteChannelInstance } from './channel'

import { createTypeUnsafe } from '@polkadot/types'

const WIN_PROB = new BN(1)

const SECP256K1_SIGNATURE_LENGTH = 64
const SECP256K1_SIGNATURE_RECOVERY_LENGTH = 1
const SR25519_PUBLIC_KEY_LENGTH = 32
const SR25519_SIGNATURE_LENGTH = 64

export class Balance extends u128 implements Types.Balance, IBalance {
  static get SIZE(): number {
    return 16
  }
}
export class Moment extends u64 implements Types.Moment, IMoment {
  static get SIZE(): number {
    return 8
  }
}
export class Hash extends H256 implements Types.Hash, IHash {
  static get SIZE(): number {
    return 32
  }
}
export class Public extends H256 {
  static get SIZE(): number {
    return 32
  }
}
export class AccountId extends Public implements Types.AccountId, IAccountId {
  static get SIZE(): number {
    return 32
  }
}
export class TicketEpoch extends u32 implements Types.TicketEpoch {
  static get SIZE(): number {
    return 32
  }
}
export class ChannelId extends H256 implements IHash {
  static get SIZE(): number {
    return 32
  }
}
export class PreImage extends H256 implements IHash {
  static get SIZE(): number {
    return 32
  }
}

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

export class Channel
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

  static get SIZE(): number {
    throw Error('not implemented')
    return 0
  }
}

export class Signature extends Uint8Array implements Types.Signature {
  constructor(
    arr?: Uint8Array,
    signatures?: {
      secp256k1Signature: Uint8Array
      secp256k1Recovery: number
      sr25519PublicKey: Uint8Array
      sr25519Signature: Uint8Array
    }
  ) {
    if (arr == null && signatures != null) {
      super(
        u8aConcat(
          signatures.secp256k1Signature,
          new Uint8Array([signatures.secp256k1Recovery]),
          signatures.sr25519PublicKey,
          signatures.sr25519Signature
        )
      )
    } else if (arr != null && signatures == null) {
      super(arr)
    } else {
      throw Error('Invalid constructor arguments.')
    }
  }

  get secp256k1Signature(): Uint8Array {
    return this.subarray(0, SECP256K1_SIGNATURE_LENGTH)
  }

  get secp256k1Recovery(): Uint8Array {
    return this.subarray(SECP256K1_SIGNATURE_LENGTH, SECP256K1_SIGNATURE_LENGTH + SECP256K1_SIGNATURE_RECOVERY_LENGTH)
  }

  get sr25519PublicKey(): Uint8Array {
    return this.subarray(
      SECP256K1_SIGNATURE_LENGTH + SECP256K1_SIGNATURE_RECOVERY_LENGTH,
      SECP256K1_SIGNATURE_LENGTH + SECP256K1_SIGNATURE_RECOVERY_LENGTH + SR25519_PUBLIC_KEY_LENGTH
    )
  }

  get sr25519Signature() {
    return this.subarray(SECP256K1_SIGNATURE_LENGTH + SECP256K1_SIGNATURE_RECOVERY_LENGTH + SR25519_PUBLIC_KEY_LENGTH)
  }

  get signature() {
    return this.secp256k1Signature
  }

  get recovery() {
    return this.secp256k1Recovery[0]
  }

  get onChainSignature() {
    return this.sr25519Signature
  }

  subarray(begin: number, end?: number) {
    return new Uint8Array(this.buffer, begin, end != null ? end - begin : undefined)
  }

  static get SIZE() {
    return (
      SECP256K1_SIGNATURE_LENGTH +
      SECP256K1_SIGNATURE_RECOVERY_LENGTH +
      SR25519_PUBLIC_KEY_LENGTH +
      SR25519_SIGNATURE_LENGTH
    )
  }
}

export class SignedTicket extends Uint8Array implements Types.SignedTicket {
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
      throw Error('Invalid constructor arguments.')
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

  get signer() {
    return secp256k1.recover(Buffer.from(this.ticket.toU8a()), Buffer.from(this.signature.signature), this.signature.recovery)
  }

  // toU8a(): Uint8Array {
  //   return u8aConcat(this.signature.onChainSignature, this.ticket.toU8a())
  // }
}

export class Ticket
  extends Struct.with({
    channelId: Hash,
    challenge: Hash,
    epoch: TicketEpoch,
    amount: Balance,
    winProb: Hash,
    onChainSecret: Hash
  })
  implements Types.Ticket {
  declare channelId: Hash
  declare challenge: Hash
  declare epoch: TicketEpoch
  declare amount: Balance
  declare winProb: Hash
  declare onChainSecret: Hash

  getEmbeddedFunds() {
    return this.amount.mul(new BN(this.winProb)).div(new BN(new Uint8Array(Hash.length).fill(0xff)))
  }

  static get SIZE(): number {
    return Hash.SIZE + Hash.SIZE + TicketEpoch.SIZE + Balance.SIZE + Hash.SIZE + Hash.SIZE
  }

  static async create(channel: ConcreteChannelInstance, amount: Balance, challenge: Hash, privKey: Uint8Array, pubKey: Uint8Array): Promise<SignedTicket> {
      const { secret } = await channel.hoprPolkadot.api.query.hopr.state<State>(channel.counterparty)

      const winProb = createTypeUnsafe<Hash>(channel.hoprPolkadot.api.registry, 'Hash', [
        new BN(new Uint8Array(Hash.length).fill(0xff)).div(WIN_PROB).toArray('le', Hash.length)
      ])
      const channelId = await channel.channelId

      const ticket = createTypeUnsafe<Ticket>(channel.hoprPolkadot.api.registry, 'Ticket', [
        {
          channelId,
          epoch: new BN(0),
          challenge,
          onChainSecret: secret,
          amount,
          winProb
        }
      ])

      const signature = await channel.hoprPolkadot.utils.sign(ticket.toU8a(), privKey, pubKey)

      return new SignedTicket(undefined, {
        signature,
        ticket
      })
    }

  static async verify(channel: ConcreteChannelInstance, signedTicket: SignedTicket): Promise<boolean> {
      if (
        (await channel.currentBalanceOfCounterparty).add(signedTicket.ticket.amount).gt(await channel.balance)
      ) {
        return false
      }

      try {
        await channel.testAndSetNonce(signedTicket)
      } catch (_) {
        return false
      }

      return channel.hoprPolkadot.utils.verify(
        signedTicket.ticket.toU8a(),
        signedTicket.signature,
        channel.counterparty
      )
    }
  static async submit(channel: ConcreteChannelInstance, signedTicket: SignedTicket) {}
    // async aggregate(tickets: Ticket[]): Promise<Ticket> {
    //   throw Error('not implemented')
    //   return Promise.resolve(tickets[0])
    // }
}

export class State extends Struct.with({
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

const SRMLTypes = {
  AccountId,
  Balance,
  ChannelId,
  PreImage,
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
  Signature: Signature,
  ...SRMLTypes
}

export { SRMLTypes, Types }

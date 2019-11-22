import { AccountId, Hash } from './srml_types'
import { Tuple } from '@polkadot/types'
import { blake2b } from '@polkadot/wasm-crypto'

const ID_HASH_KEY: Uint8Array = Uint8Array.from(new TextEncoder().encode('ChannelId'))

const BYTESIZE: number = 256

class AccountIdTuple extends Tuple.with([AccountId, AccountId]) {}

export function isPartyA(self: AccountId, counterparty: AccountId) {
  return self < counterparty
}

export function getId(self: AccountId, counterparty: AccountId) {
  if (isPartyA(self, counterparty)) {
    return new Hash(blake2b(new AccountIdTuple(self, counterparty).toU8a(), ID_HASH_KEY, BYTESIZE))
  } else {
    return new Hash(blake2b(new AccountIdTuple(counterparty, self).toU8a(), ID_HASH_KEY, BYTESIZE))
  }
}

export function compareArray(a: Uint8Array, b: Uint8Array) {
  return a.length == b.length && a.every((value, index) => value == b[index])
}

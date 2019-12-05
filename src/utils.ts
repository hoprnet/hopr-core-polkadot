import { AccountId, Hash } from './srml_types'
import { ApiPromise } from '@polkadot/api'
import { u8aConcat } from '@polkadot/util'
import { blake2b } from '@polkadot/wasm-crypto'

const ID_HASH_KEY: Uint8Array = Uint8Array.from(new TextEncoder().encode('ChannelId'))

const BYTESIZE: number = 256

export function isPartyA(self: AccountId, counterparty: AccountId): boolean {
  return self < counterparty
}

export function getId(api: ApiPromise, self: AccountId, counterparty: AccountId): Hash {
  if (isPartyA(self, counterparty)) {
    return api.createType('Hash', blake2b(u8aConcat(self.toU8a(), counterparty.toU8a()), ID_HASH_KEY, BYTESIZE))
  } else {
    return api.createType('Hash', blake2b(u8aConcat(counterparty.toU8a(), self.toU8a()), ID_HASH_KEY, BYTESIZE))
  }
}

export function compareArray(a: Uint8Array, b: Uint8Array) {
  return a.length == b.length && a.every((value, index) => value == b[index])
}

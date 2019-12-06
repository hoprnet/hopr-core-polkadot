import { AccountId, Hash, Moment } from './srml_types'
import { ApiPromise } from '@polkadot/api'
import { BlockNumber } from '@polkadot/types/interfaces'
import { u8aConcat } from '@polkadot/util'
import { blake2b, waitReady } from '@polkadot/wasm-crypto'

const ID_HASH_KEY: Uint8Array = Uint8Array.from(new TextEncoder().encode('ChannelId'))

const BYTESIZE: number = 32 // bytes

export function isPartyA(self: AccountId, counterparty: AccountId): boolean {
  return self < counterparty
}

export async function getId(api: ApiPromise, self: AccountId, counterparty: AccountId): Promise<Hash> {
  await waitReady()
  if (isPartyA(self, counterparty)) {
    return api.createType('Hash', blake2b(u8aConcat(self.toU8a(), counterparty.toU8a()), ID_HASH_KEY, BYTESIZE))
  } else {
    return api.createType('Hash', blake2b(u8aConcat(counterparty.toU8a(), self.toU8a()), ID_HASH_KEY, BYTESIZE))
  }
}

export function compareArray(a: Uint8Array, b: Uint8Array) {
  return a.length == b.length && a.every((value, index) => value == b[index])
}

export function waitForNextBlock(api: ApiPromise): Promise<void> {
  return new Promise(async resolve => {
    const currentBlock = await api.query.timestamp.now()
    const unsub = await api.query.timestamp.now((block: Moment) => {
      if (block.gt(currentBlock)) {
        setImmediate(() => {
          unsub()
          resolve()
        })
      }
    })
  })
}

export function wait(miliseconds: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, miliseconds))
}

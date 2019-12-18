import { AccountId, Hash, Moment } from '../srml_types'
import { ApiPromise } from '@polkadot/api'
import { u8aConcat } from '@polkadot/util'
import { blake2b, waitReady } from '@polkadot/wasm-crypto'
import chalk from 'chalk'

// const ID_HASH_KEY: Uint8Array = Uint8Array.from(new TextEncoder().encode('ChannelId'))

const BYTESIZE: number = 32 // bytes

export function isPartyA(self: AccountId, counterparty: AccountId): boolean {
  return self < counterparty
}

export async function getId(api: ApiPromise, self: AccountId, counterparty: AccountId): Promise<Hash> {
  await waitReady()
  if (isPartyA(self, counterparty)) {
    return api.createType('Hash', blake2b(u8aConcat(self, counterparty), new Uint8Array(), BYTESIZE))
  } else {
    return api.createType('Hash', blake2b(u8aConcat(counterparty, self), new Uint8Array(), BYTESIZE))
  }
}

export function compareArray(a: Uint8Array, b: Uint8Array) {
  return a.length == b.length && a.every((value, index) => value == b[index])
}

export function waitForNextBlock(api: ApiPromise): Promise<void> {
  return waitUntil(api, 'block')
}

export function waitUntil(
  api: ApiPromise,
  forWhat: string,
  until?: (api: ApiPromise, timestamp?: Moment) => Promise<boolean>,
  maxBlocks?: number
): Promise<void> {
  return new Promise<void>(async (resolve, reject) => {
    const currentBlock = await api.query.timestamp.now<Moment>()
    let i: number = 0
    const unsub = await api.query.timestamp.now<Moment>(async (timestamp: Moment) => {
      if (timestamp.gt(currentBlock)) {
        i++
        if (until == null || (await until(api, timestamp)) == true || (maxBlocks != null && i >= maxBlocks)) {
          setImmediate(() => {
            console.log(`waiting done for ${chalk.green(forWhat)}`)
            unsub()
            if (until != null && maxBlocks != null && i>= maxBlocks) {
              reject()
            } else {
              resolve()
            }
          })
        } else {
          console.log(`Waiting for ${chalk.green(forWhat)} ... current timestamp ${chalk.green(timestamp.toString())}`)
        }
      }
    })
  })
}

export function wait(miliseconds: number): Promise<void> {
  return new Promise<void>(resolve => setTimeout(resolve, miliseconds))
}

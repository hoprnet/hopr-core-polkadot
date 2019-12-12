import { Hash } from './srml_types'

const encoder = new TextEncoder()
const PREFIX: Uint8Array = encoder.encode('payments-')
const SEPERATOR: Uint8Array = encoder.encode('-')

export function Channel(channelId: Hash): Uint8Array {
  const subPrefix = encoder.encode('channel-')

  return allocationHelper([
    [PREFIX.length, PREFIX],
    [subPrefix.length, subPrefix],
    [channelId.length, channelId]
  ])
}

export function Challenge(channelId: Hash, challenge: Hash): Uint8Array {
  const subPrefix = encoder.encode('challenge-')

  return allocationHelper([
    [PREFIX.length, PREFIX],
    [subPrefix.length, subPrefix],
    [channelId.length, channelId],
    [SEPERATOR.length, SEPERATOR],
    [challenge.length, challenge]
  ])
}

export function Nonce(channelId: Hash, nonce: Hash): Uint8Array {
  const subPrefix = encoder.encode('nonce-')

  return allocationHelper([
    [PREFIX.length, PREFIX],
    [subPrefix.length, subPrefix],
    [channelId.length, channelId],
    [SEPERATOR.length, SEPERATOR],
    [nonce.length, nonce]
  ])
}

export function OnChainSecret(): Uint8Array {
  const subPrefix = encoder.encode('onChainSecret')

  return allocationHelper([
    [PREFIX.length, PREFIX],
    [subPrefix.length, subPrefix]
  ])
}

type Config = [number, Uint8Array]

function allocationHelper(arr: Config[]) {
  const totalLength = arr.reduce((acc, current) => {
    return acc + current[0]
  }, 0)

  let result = new Uint8Array(totalLength)

  let offset = 0
  for (let [size, data] of arr) {
    result.set(data, offset)
    offset += size
  }

  return result
}

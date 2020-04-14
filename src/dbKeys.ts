import { Hash } from './srml_types'
import type { AccountId } from './srml_types'
import type { ApiPromise } from '@polkadot/api'

const encoder = new TextEncoder()
const PREFIX: Uint8Array = encoder.encode('payments-')
const SEPERATOR: Uint8Array = encoder.encode('-')

const channelSubPrefix = encoder.encode('channel-')
const challengeSubPrefix = encoder.encode('challenge-')

export function Channel(counterparty: AccountId): Uint8Array {
  return allocationHelper([
    [PREFIX.length, PREFIX],
    [channelSubPrefix.length, channelSubPrefix],
    [counterparty.length, counterparty],
  ])
}

export function ChannelKeyParse(arr: Uint8Array, api: ApiPromise): AccountId {
  return api.createType('AccountId', arr.slice(PREFIX.length + channelSubPrefix.length))
}

export function Challenge(channelId: Hash, challenge: Hash): Uint8Array {
  return allocationHelper([
    [PREFIX.length, PREFIX],
    [challengeSubPrefix.length, challengeSubPrefix],
    [channelId.length, channelId],
    [SEPERATOR.length, SEPERATOR],
    [challenge.length, challenge],
  ])
}

export function ChallengeKeyParse(arr: Uint8Array, api: ApiPromise): [Hash, Hash] {
  return [
    api.createType(
      'Hash',
      arr.slice(PREFIX.length + channelSubPrefix.length, PREFIX.length + channelSubPrefix.length + Hash.SIZE)
    ),
    api.createType(
      'Hash',
      arr.slice(
        PREFIX.length + channelSubPrefix.length + Hash.SIZE + SEPERATOR.length,
        PREFIX.length + channelSubPrefix.length + Hash.SIZE + SEPERATOR.length + Hash.SIZE
      )
    ),
  ]
}

export function ChannelId(signatureHash: Hash): Uint8Array {
  const subPrefix = encoder.encode('channelId-')

  return allocationHelper([
    [PREFIX.length, PREFIX],
    [subPrefix.length, subPrefix],
    [signatureHash.length, signatureHash],
  ])
}

export function Nonce(channelId: Hash, nonce: Hash): Uint8Array {
  const subPrefix = encoder.encode('nonce-')

  return allocationHelper([
    [PREFIX.length, PREFIX],
    [subPrefix.length, subPrefix],
    [channelId.length, channelId],
    [SEPERATOR.length, SEPERATOR],
    [nonce.length, nonce],
  ])
}

export function OnChainSecret(): Uint8Array {
  const subPrefix = encoder.encode('onChainSecret')

  return allocationHelper([
    [PREFIX.length, PREFIX],
    [subPrefix.length, subPrefix],
  ])
}

export function Ticket(channelId: Hash, challenge: Hash): Uint8Array {
  const subPrefix = encoder.encode('ticket-')

  return allocationHelper([
    [PREFIX.length, PREFIX],
    [subPrefix.length, subPrefix],
    [channelId.length, channelId],
    [SEPERATOR.length, SEPERATOR],
    [challenge.length, challenge],
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

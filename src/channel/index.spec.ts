import assert from 'assert'
import Memdown from 'memdown'
import Utils from '../utils'
import {
  AccountId,
  Active,
  Channel as ChannelEnum,
  Balance,
  ChannelBalance,
  ChannelId,
  Hash,
  State,
  Ticket
} from '../srml_types'
import { TypeRegistry, createType } from '@polkadot/types'
import HoprPolkadot, { Channel } from '..'
import { randomBytes } from 'crypto'
import secp256k1 from 'secp256k1'
import BN from 'bn.js'
import { createTypeUnsafe } from '@polkadot/types'
import LevelUp from 'levelup'
import DbKeys from '../dbKeys'
import Keyring from '@polkadot/keyring'
import { waitReady } from '@polkadot/wasm-crypto'

describe('test ticket generation and verification', function() {
  it('should create a valid ticket', async function() {
    const registry = new TypeRegistry()

    registry.register({ AccountId, Active, Balance, Channel: ChannelEnum, ChannelId, Ticket })

    const privKey = randomBytes(32)
    const pubKey = secp256k1.publicKeyCreate(privKey)

    await waitReady()

    const hoprPolkadot = ({
      utils: new Utils(),
      db: new LevelUp(Memdown()),
      api: {
        query: {
          hopr: {
            state: () =>
              Promise.resolve({
                epoch: new BN(0),
                secret: createTypeUnsafe(registry, 'Hash', [new Uint8Array(32)])
              } as State)
          }
        },
        registry,
        createType: (type: any, ...params: any[]) => createType(registry, type, ...params)
      },
      self: {
        publicKey: pubKey,
        keyPair: new Keyring({ type: 'sr25519' }).addFromSeed(privKey, undefined, 'sr25519')

      },
      dbKeys: new DbKeys()
    } as unknown) as HoprPolkadot

    const counterparty = new AccountId(hoprPolkadot.api.registry, pubKey)

    hoprPolkadot.db.put(
      hoprPolkadot.dbKeys.Channel(
        createTypeUnsafe<AccountId>(hoprPolkadot.api.registry, 'AccountId', [counterparty])
      ),
      Buffer.from(
        createTypeUnsafe<ChannelEnum>(hoprPolkadot.api.registry, 'Channel', [
          createTypeUnsafe<Active>(hoprPolkadot.api.registry, 'Active', [
            new ChannelBalance(hoprPolkadot.api.registry, {
              balance: new BN(123),
              balance_a: new BN(122)
            })
          ]),
          2
        ]).toU8a()
      )
    )

    const channel = new Channel(hoprPolkadot, new AccountId(registry, pubKey))

    const preImage = randomBytes(32)
    const hash = await hoprPolkadot.utils.hash(preImage)

    const ticket = await channel.ticket.create(channel, new Balance(registry, 1), new Hash(registry, hash), privKey, pubKey)

    assert(await channel.ticket.verify(channel, ticket))
  })
})

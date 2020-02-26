import assert from 'assert'
import Memdown from 'memdown'
import * as Utils from '../utils'
import {
  AccountId,
  Active,
  Channel as ChannelEnum,
  Balance,
  ChannelBalance,
  ChannelId,
  Hash,
  SignedChannel,
  State,
  Ticket,
  Funded
} from '../srml_types'
import { TypeRegistry, createType } from '@polkadot/types'
import HoprPolkadot, { Types } from '..'
import { randomBytes } from 'crypto'
import secp256k1 from 'secp256k1'
import BN from 'bn.js'
import { createTypeUnsafe } from '@polkadot/types'
import LevelUp from 'levelup'
import DbKeys from '../dbKeys'
import Keyring from '@polkadot/keyring'
import { waitReady } from '@polkadot/wasm-crypto'
import { Channel } from '.'

const TEN_SECONDS = 10 * 1000

describe('test ticket generation and verification', function() {
  this.timeout(TEN_SECONDS)
  const registry = new TypeRegistry()

  registry.register({ AccountId, Active, Balance, Channel: ChannelEnum, ChannelId, Ticket })

  let hoprPolkadot: HoprPolkadot
  let counterpartysHoprPolkadot: HoprPolkadot
  const channels = new Map<string, ChannelEnum>()
  function onChainChannels(channelId: Hash): Promise<ChannelEnum | void> {
    return Promise.resolve(channels.get(channelId.toHex()))
  }

  beforeEach(async function() {
    this.timeout(TEN_SECONDS)

    await waitReady()

    channels.clear()

    const privKey = randomBytes(32)
    const pubKey = secp256k1.publicKeyCreate(privKey)
    const keyPair = new Keyring({ type: 'sr25519' }).addFromSeed(privKey, undefined, 'sr25519')

    hoprPolkadot = ({
      utils: Utils,
      db: new LevelUp(Memdown()),
      accountBalance: Promise.resolve(new Balance(registry, new BN(1234567))),
      eventSubscriptions: {
        once: (_: any, handler: any) => setTimeout(handler)
      },
      api: {
        tx: {
          hopr: {
            create: function() {
              const signAndSend = () => Promise.resolve()

              return { signAndSend }
            },
            setActive: function() {
              const signAndSend = () => Promise.resolve()

              return { signAndSend }
            }
          }
        },
        query: {
          hopr: {
            state: () =>
              Promise.resolve({
                epoch: new BN(0),
                secret: createTypeUnsafe(registry, 'Hash', [new Uint8Array(32)])
              } as State),
            channels: onChainChannels
          }
        },
        registry,
        createType: (type: any, ...params: any[]) => createType(registry, type, ...params)
      },
      nonce: Promise.resolve(0),
      self: {
        publicKey: pubKey,
        privateKey: privKey,
        keyPair
      },
      dbKeys: new DbKeys()
    } as unknown) as HoprPolkadot

    const counterpartysPrivKey = randomBytes(32)
    const counterpartysPubKey = secp256k1.publicKeyCreate(privKey)

    counterpartysHoprPolkadot = ({
      utils: Utils,
      db: new LevelUp(Memdown()),
      eventSubscriptions: {
        once: (_: any, handler: any) => setTimeout(handler)
      },
      accountBalance: Promise.resolve(new Balance(registry, new BN(1234567))),
      api: {
        tx: {
          hopr: {
            create: function() {
              const signAndSend = () => Promise.resolve()

              return { signAndSend }
            },
            setActive: function() {
              const signAndSend = () => Promise.resolve()

              return { signAndSend }
            }
          }
        },
        query: {
          hopr: {
            state: () =>
              Promise.resolve({
                epoch: new BN(0),
                secret: createTypeUnsafe(registry, 'Hash', [new Uint8Array(32)])
              } as State),
            channels: onChainChannels
          }
        },
        registry,
        createType: (type: any, ...params: any[]) => createType(registry, type, ...params)
      },
      nonce: Promise.resolve(0),
      self: {
        publicKey: counterpartysPubKey,
        privateKey: counterpartysPrivKey,
        keyPair: new Keyring({ type: 'sr25519' }).addFromSeed(counterpartysPrivKey, undefined, 'sr25519')
      },
      dbKeys: new DbKeys()
    } as unknown) as HoprPolkadot
  })

  it('should create a valid ticket', async function() {
    this.timeout(TEN_SECONDS)

    const channelEnum = new ChannelEnum(
      registry,
      new Funded(
        registry,
        new ChannelBalance(registry, {
          balance: new BN(123),
          balance_a: new BN(122)
        })
      )
    )

    const channelId = await hoprPolkadot.utils.getId(
      hoprPolkadot.api.createType('AccountId', hoprPolkadot.self.keyPair.publicKey),
      hoprPolkadot.api.createType('AccountId', counterpartysHoprPolkadot.self.keyPair.publicKey),
      hoprPolkadot.api
    )

    channels.set(channelId.toHex(), channelEnum)

    const signedChannel = new SignedChannel(undefined, {
      channel: channelEnum,
      signature: await hoprPolkadot.utils.sign(
        channelEnum.toU8a(),
        counterpartysHoprPolkadot.self.privateKey,
        counterpartysHoprPolkadot.self.publicKey
      )
    })

    hoprPolkadot.db.put(
      Buffer.from(hoprPolkadot.dbKeys.Channel(
        createTypeUnsafe<AccountId>(hoprPolkadot.api.registry, 'AccountId', [
          counterpartysHoprPolkadot.self.keyPair.publicKey
        ])
      )),
      Buffer.from(signedChannel)
    )

    const channel = await Channel.create(
      hoprPolkadot,
      counterpartysHoprPolkadot.self.publicKey,
      () =>
        Promise.resolve(
          counterpartysHoprPolkadot.api.createType('AccountId', counterpartysHoprPolkadot.self.keyPair.publicKey)
        ),
      signedChannel.channel.asFunded
    )

    const preImage = randomBytes(32)
    const hash = await hoprPolkadot.utils.hash(preImage)

    const ticket = await channel.ticket.create(
      channel,
      new Balance(registry, 1),
      new Hash(registry, hash),
      hoprPolkadot.self.privateKey,
      hoprPolkadot.self.publicKey
    )

    assert.deepEqual(await ticket.signer, hoprPolkadot.self.publicKey, `Check that signer is recoverable`)

    signedChannel.signature = await counterpartysHoprPolkadot.utils.sign(
      channelEnum.toU8a(),
      hoprPolkadot.self.privateKey,
      hoprPolkadot.self.publicKey
    )

    assert.deepEqual(signedChannel.signer, hoprPolkadot.self.publicKey, `Check that signer is recoverable.`)

    counterpartysHoprPolkadot.db.put(
      Buffer.from(
      hoprPolkadot.dbKeys.Channel(
        createTypeUnsafe<AccountId>(hoprPolkadot.api.registry, 'AccountId', [hoprPolkadot.self.keyPair.publicKey])
      )),
      Buffer.from(signedChannel)
    )

    const counterpartysChannel = await Channel.create(
      counterpartysHoprPolkadot,
      hoprPolkadot.self.publicKey,
      () => Promise.resolve(hoprPolkadot.api.createType('AccountId', hoprPolkadot.self.keyPair.publicKey)),
      signedChannel.channel.asFunded,
      () => Promise.resolve(signedChannel)
    )

    assert(await counterpartysChannel.ticket.verify(counterpartysChannel, ticket))
  })

  // it('should open a channel and create a valid ticket', async function() {
  //   const channelEnum = new ChannelEnum(
  //     registry,
  //     new Funded(
  //       registry,
  //       new ChannelBalance(registry, {
  //         balance: new BN(123),
  //         balance_a: new BN(122)
  //       })
  //     )
  //   )

  //   const signPromise = Channel.handleOpeningRequest(
  //     counterpartysHoprPolkadot,
  //     new SignedChannel(hoprPolkadot, undefined, {
  //       channel: channelEnum,
  //       signature: await hoprPolkadot.utils.sign(
  //         channelEnum.toU8a(),
  //         hoprPolkadot.self.privateKey,
  //         hoprPolkadot.self.publicKey
  //       )
  //     }).toU8a()
  //   )

  //   const channel = await Channel.create(
  //     hoprPolkadot,
  //     counterpartysHoprPolkadot.self.publicKey,
  //     () => Promise.resolve(counterpartysHoprPolkadot.self.keyPair.publicKey),
  //     channelEnum.asFunded,
  //     () => signPromise.then((arr: Uint8Array) => new SignedChannel(counterpartysHoprPolkadot, arr))
  //   )

  //   const preImage = randomBytes(32)
  //   const hash = await hoprPolkadot.utils.hash(preImage)

  //   const ticket = await channel.ticket.create(
  //     channel,
  //     new Balance(registry, 1),
  //     new Hash(registry, hash),
  //     hoprPolkadot.self.privateKey,
  //     hoprPolkadot.self.publicKey
  //   )

  //   const counterpartysChannel = await Channel.create(counterpartysHoprPolkadot, hoprPolkadot.self.publicKey, () =>
  //     Promise.resolve(hoprPolkadot.self.keyPair.publicKey)
  //   )

  //   assert(await counterpartysChannel.ticket.verify(counterpartysChannel, ticket))
  // })
})

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
import HoprPolkadot from '..'
import { randomBytes } from 'crypto'
import secp256k1 from 'secp256k1'
import BN from 'bn.js'
import { createTypeUnsafe } from '@polkadot/types'
import LevelUp from 'levelup'
import * as DbKeys from '../dbKeys'
import Keyring from '@polkadot/keyring'
import { waitReady } from '@polkadot/wasm-crypto'
import { Channel } from '.'
import pipe from 'it-pipe'
import { ChannelOpener } from './open'

const TEN_SECONDS = 10 * 1000

describe('test ticket generation and verification', function() {
  this.timeout(TEN_SECONDS)
  const registry = new TypeRegistry()

  registry.register({ AccountId, Active, Balance, Channel: ChannelEnum, ChannelId, Ticket })

  let hoprPolkadot: HoprPolkadot
  let counterpartysHoprPolkadot: HoprPolkadot
  const channels = new Map<string, ChannelEnum>()
  const preChannels = new Map<string, ChannelEnum>()

  function onChainChannels(
    channelId: Hash,
    fn?: (channel: ChannelEnum) => void
  ): Promise<ChannelEnum | (() => void) | undefined> {
    if (fn != null) {
      let found = preChannels.get(channelId.toHex())
      if (found == null) {
        return Promise.reject(`Could not find channel ${channelId.toHex()}`)
      }

      // @TODO this is very hacky
      setImmediate(fn, found)

      return Promise.resolve(() => {})
    }
    return Promise.resolve(channels.get(channelId.toHex()))
  }

  function generateNode(): HoprPolkadot {
    const privKey = randomBytes(32)
    const pubKey = secp256k1.publicKeyCreate(privKey)
    const keyPair = new Keyring({ type: 'sr25519' }).addFromSeed(privKey, undefined, 'sr25519')

    const hoprPolkadot = ({
      utils: {
        ...Utils,
        waitForNextBlock() {
          Promise.resolve()
        }
      },
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
            states: () =>
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
      dbKeys: DbKeys,
      channel: Channel
    } as unknown) as HoprPolkadot

    return hoprPolkadot
  }

  beforeEach(async function() {
    this.timeout(TEN_SECONDS)

    await waitReady()

    channels.clear()
    preChannels.clear()

    hoprPolkadot = generateNode()

    counterpartysHoprPolkadot = generateNode()
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
      hoprPolkadot.api.createType('AccountId', counterpartysHoprPolkadot.self.keyPair.publicKey)
    )

    const signedChannel = await SignedChannel.create(counterpartysHoprPolkadot, channelEnum)

    preChannels.set(channelId.toHex(), channelEnum)

    const channel = await Channel.create(
      hoprPolkadot,
      counterpartysHoprPolkadot.self.publicKey,
      () =>
        Promise.resolve(
          counterpartysHoprPolkadot.api.createType('AccountId', counterpartysHoprPolkadot.self.keyPair.publicKey)
        ),
      signedChannel.channel.asFunded,
      async () => {
        const result = await pipe(
          [(await SignedChannel.create(hoprPolkadot, channelEnum)).subarray()],
          ChannelOpener.handleOpeningRequest(counterpartysHoprPolkadot),
          async (source: AsyncIterable<any>) => {
            let result: Uint8Array
            for await (const msg of source) {
              if (result! == null) {
                result = msg.slice()
                return result
              } else {
                continue
              }
            }
          }
        )

        return new SignedChannel({
          bytes: result.buffer,
          offset: result.byteOffset
        })
      }
    )

    channels.set(channelId.toHex(), channelEnum)

    const preImage = randomBytes(32)
    const hash = await hoprPolkadot.utils.hash(preImage)

    const ticket = await channel.ticket.create(channel, new Balance(registry, 1), new Hash(registry, hash))

    assert(Utils.u8aEquals(await ticket.signer, hoprPolkadot.self.publicKey), `Check that signer is recoverable`)

    const signedChannelCounterparty = await SignedChannel.create(hoprPolkadot, channelEnum)

    assert(
      Utils.u8aEquals(signedChannelCounterparty.signer, hoprPolkadot.self.publicKey),
      `Check that signer is recoverable.`
    )

    counterpartysHoprPolkadot.db.put(
      Buffer.from(
        hoprPolkadot.dbKeys.Channel(
          createTypeUnsafe<AccountId>(hoprPolkadot.api.registry, 'AccountId', [hoprPolkadot.self.keyPair.publicKey])
        )
      ),
      Buffer.from(signedChannelCounterparty)
    )

    const dbChannels = (await counterpartysHoprPolkadot.channel.getAll(
      counterpartysHoprPolkadot,
      async (arg: any) => arg,
      async (arg: any) => Promise.all(arg)
    )) as Channel[]

    assert(
      Utils.u8aEquals(dbChannels[0].counterparty.toU8a(), hoprPolkadot.self.keyPair.publicKey),
      `Channel record should make it into the database and its db-key should lead to the AccountId of the counterparty.`
    )

    const counterpartysChannel = await Channel.create(
      counterpartysHoprPolkadot,
      hoprPolkadot.self.publicKey,
      () => Promise.resolve(hoprPolkadot.api.createType('AccountId', hoprPolkadot.self.keyPair.publicKey)),
      signedChannel.channel.asFunded,
      () => Promise.resolve(signedChannelCounterparty)
    )

    assert(
      await hoprPolkadot.channel.isOpen(
        hoprPolkadot,
        hoprPolkadot.api.createType('AccountId', counterpartysHoprPolkadot.self.keyPair.publicKey),
        channelId
      ),
      `Checks that party A considers the channel open.`
    )
    assert(
      await counterpartysHoprPolkadot.channel.isOpen(
        counterpartysHoprPolkadot,
        counterpartysHoprPolkadot.api.createType('AccountId', hoprPolkadot.self.keyPair.publicKey),
        channelId
      ),
      `Checks that party B considers the channel open.`
    )

    await channel.testAndSetNonce(new Uint8Array(1).fill(0xff)), `Should be able to set nonce.`

    assert.rejects(() => channel.testAndSetNonce(new Uint8Array(1).fill(0xff)), `Should reject when trying to set nonce twice.`)

    assert(await counterpartysChannel.ticket.verify(counterpartysChannel, ticket))
  })
})

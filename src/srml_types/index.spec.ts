import assert from 'assert'

import { Channel, ChannelBalance } from './channel'
import { TypeRegistry } from '@polkadot/types'
import { Moment, Balance } from './base'
import BN from 'bn.js'
import { HoprPolkadotClass } from '../'
import { randomBytes } from 'crypto'
import { waitReady } from '@polkadot/wasm-crypto'
import Keyring from '@polkadot/keyring'
import secp256k1 from 'secp256k1'
import { SignedChannel } from './signedChannel'

const PRIVATE_KEY_LENGTH = 32

describe('check whether we can construct types', function() {
  const registry = new TypeRegistry()

  registry.register({
    Moment,
    Balance
  })
  it('should create a channel instance', function() {
    const balance = new BN(12345)
    const balance_a = new BN(1234)

    const channelBalance = new ChannelBalance(registry, {
      balance,
      balance_a
    })

    assert(
      channelBalance.balance.eq(balance) && channelBalance.balance_a.eq(balance_a),
      'Check that values are correctly set'
    )

    const fundedChannel = Channel.createFunded({
      balance,
      balance_a
    })

    assert(
      fundedChannel.asFunded.balance.eq(balance) && fundedChannel.asFunded.balance_a.eq(balance_a),
      'Check that values are correctly set'
    )

    const fundedChannelWithChannelBalance = Channel.createFunded(channelBalance)

    assert(
      fundedChannelWithChannelBalance.asFunded.balance.eq(balance) &&
        fundedChannelWithChannelBalance.asFunded.balance_a.eq(balance_a),
      'Check that values are correctly set when using a channelBalane instance'
    )

    const activeChannel = Channel.createActive({
      balance,
      balance_a
    })

    assert(
      activeChannel.asActive.balance.eq(balance) && activeChannel.asActive.balance_a.eq(balance_a),
      'Check that values are correctly set'
    )

    const activeChannelWithChannelBalance = Channel.createActive(channelBalance)

    assert(
      activeChannelWithChannelBalance.asActive.balance.eq(balance) &&
        activeChannelWithChannelBalance.asActive.balance_a.eq(balance_a),
      'Check that values are correctly set when using a channelBalane instance'
    )

    const pendingChannel = Channel.createPending(new BN(1001), {
      balance,
      balance_a
    })

    assert(
      pendingChannel.asPendingSettlement[0].balance.eq(balance) &&
        pendingChannel.asPendingSettlement[0].balance_a.eq(balance_a),
      'Check that values are correctly set'
    )

    const pendingChannelWithMomentAndChannelBalance = Channel.createPending(
      new Moment(registry, new BN(1001)),
      channelBalance
    )

    assert(
      pendingChannelWithMomentAndChannelBalance.asPendingSettlement[0].balance.eq(balance) &&
        pendingChannelWithMomentAndChannelBalance.asPendingSettlement[0].balance_a.eq(balance_a),
      'Check that values are correctly set when using a channelBalane instance and a moment instance'
    )
  })

  it('should generate a signedChannel', async function() {
    await waitReady()

    const generateNode = (): HoprPolkadotClass => {
      const privateKey = randomBytes(PRIVATE_KEY_LENGTH)
      return ({
        self: {
          privateKey,
          publicKey: secp256k1.publicKeyCreate(privateKey),
          keyPair: new Keyring({ type: 'sr25519' }).addFromSeed(privateKey, undefined, 'sr25519')
        }
      } as unknown) as HoprPolkadotClass
    }

    const [Alice, Bob] = [generateNode(), generateNode()]

    const channel = Channel.createFunded({
      balance: new BN(12345),
      balance_a: new BN(123)
    })

    const arr = new Uint8Array(SignedChannel.SIZE)

    const signedChannel = await SignedChannel.create(Alice, channel, {
      bytes: arr.buffer,
      offset: arr.byteOffset
    })

    assert(await signedChannel.verify(Alice))

    const signedChannelNormal = await SignedChannel.create(Alice, channel)

    const signedChannelWithExisting = await SignedChannel.create(Alice, channel, {
      bytes: signedChannelNormal.buffer,
      offset: signedChannelNormal.byteOffset
    })

    assert(await signedChannelWithExisting.verify(Alice))
  })
})

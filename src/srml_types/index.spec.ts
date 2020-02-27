import assert from 'assert'

import { Channel, ChannelBalance } from './channel'
import { TypeRegistry } from '@polkadot/types'
import { Moment, Balance } from './base'
import BN from 'bn.js'

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

    const fundedChannel = Channel.createFunded(channelBalance)

    assert(
      fundedChannel.asFunded.balance.eq(balance) && fundedChannel.asFunded.balance_a.eq(balance_a),
      'Check that values are correctly set'
    )

    const activeChannel = Channel.createActive(channelBalance)

    assert(
      activeChannel.asActive.balance.eq(balance) && activeChannel.asActive.balance_a.eq(balance_a),
      'Check that values are correctly set'
    )

    const moment = new Moment(registry, new BN(1001))
    const pendingChannel = Channel.createPending(moment, channelBalance)

    assert(
        pendingChannel.asPendingSettlement[0].balance.eq(balance) && pendingChannel.asPendingSettlement[0].balance_a.eq(balance_a),
        'Check that values are correctly set'
      )
  })
})

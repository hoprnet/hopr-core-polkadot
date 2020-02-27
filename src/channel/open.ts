import { Balance, AccountId, Channel as ChannelEnum, Hash, SignedChannel } from '../srml_types'

import { Opened, EventHandler } from '../events'
import HoprPolkadot from '..'
import { u8aToHex } from '../utils'
import chalk from 'chalk'

class ChannelOpener {
  private constructor(private hoprPolkadot: HoprPolkadot, private counterparty: AccountId, public channelId: Hash) {}

  static handleOpeningRequest(
    hoprPolkadot: HoprPolkadot
  ): (source: AsyncIterable<Uint8Array>) => AsyncIterator<Uint8Array> {
    return (source: AsyncIterable<Uint8Array>) => {
      return (async function*() {
        for await (const msg of source) {
          const signedChannelArray = msg.slice()
          const signedChannel = new SignedChannel({
            bytes: signedChannelArray.buffer,
            offset: signedChannelArray.byteOffset
          })

          const counterparty = hoprPolkadot.api.createType('AccountId', signedChannel.signature.sr25519PublicKey)

          const channelId = await hoprPolkadot.utils.getId(
            counterparty,
            hoprPolkadot.api.createType('AccountId', hoprPolkadot.self.keyPair.publicKey),
            hoprPolkadot.api
          )

          let channelOpener = await ChannelOpener.create(hoprPolkadot, counterparty, channelId)

          channelOpener
            .onceOpen()
            .then(() =>
              hoprPolkadot.db.put(u8aToHex(hoprPolkadot.dbKeys.Channel(counterparty)), Buffer.from(signedChannel))
            )

          if (
            hoprPolkadot.utils.isPartyA(
              hoprPolkadot.api.createType('AccountId', hoprPolkadot.self.keyPair.publicKey),
              counterparty
            )
          ) {
            await channelOpener.increaseFunds(signedChannel.channel.asFunded.balance_a)
          } else {
            await channelOpener.increaseFunds(
              hoprPolkadot.api.createType(
                'Balance',
                signedChannel.channel.asFunded.balance.sub(signedChannel.channel.asFunded.balance_a.toBn())
              )
            )

            await hoprPolkadot.db.put(u8aToHex(hoprPolkadot.dbKeys.Channel(counterparty)), Buffer.from(signedChannel))
          }

          yield (
            await SignedChannel.create(hoprPolkadot, signedChannel.channel, {
              bytes: signedChannel.buffer,
              offset: signedChannel.byteOffset
            })
          ).subarray()
        }
      })()
    }
  }

  static async create(hoprPolkadot: HoprPolkadot, counterparty: AccountId, channelId: Hash): Promise<ChannelOpener> {
    return new ChannelOpener(hoprPolkadot, counterparty, channelId)
  }

  async increaseFunds(newAmount: Balance): Promise<ChannelOpener> {
    if ((await this.hoprPolkadot.accountBalance).lt(newAmount)) {
      throw Error('Insufficient funds.')
    }

    await this.hoprPolkadot.api.tx.hopr
      .create(newAmount.toU8a(), this.counterparty)
      .signAndSend(this.hoprPolkadot.self.keyPair, { nonce: await this.hoprPolkadot.nonce })

    return this
  }

  onceOpen(): Promise<ChannelOpener> {
    const eventIdentifier = Opened(this.channelId)

    return new Promise<ChannelOpener>(resolve => {
      this.hoprPolkadot.eventSubscriptions.once(eventIdentifier, () => {
        resolve(this)
      })
    })
  }

  async onceFundedByCounterparty(handler?: EventHandler): Promise<void | ChannelOpener> {
    if (handler == null) {
      return new Promise<ChannelOpener>(async resolve => {
        const unsubscribe = await this.hoprPolkadot.api.query.hopr.channels<ChannelEnum>(this.channelId, _ => {
          unsubscribe()
          resolve(this)
        })
      })
    }

    // TODO specify else

    const unsubscribe = await this.hoprPolkadot.api.query.hopr.channels<ChannelEnum>(this.channelId, _ => {
      unsubscribe()
    })
  }

  async setActive(signedChannel: SignedChannel): Promise<ChannelOpener> {
    try {
      await this.hoprPolkadot.api.tx.hopr
        .setActive(this.counterparty, signedChannel.signature.onChainSignature)
        .signAndSend(this.hoprPolkadot.self.keyPair, { nonce: await this.hoprPolkadot.nonce })
    } catch (err) {
      console.log(err)
    }

    return this
  }
}

export { ChannelOpener }

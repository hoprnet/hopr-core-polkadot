import type { Balance, AccountId, Channel as ChannelEnum, Hash } from '../srml_types'
import { SignedChannel } from '../srml_types'
import { Opened, EventHandler } from '../events'
import type HoprPolkadot from '..'
import { u8aToHex, getId } from '../utils'
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

          const channelId = await getId(
            counterparty,
            hoprPolkadot.api.createType('AccountId', hoprPolkadot.self.onChainKeyPair.publicKey),
          )

          let channelOpener = await ChannelOpener.create(hoprPolkadot, counterparty, channelId)

          channelOpener
            .onceOpen()
            .then(() =>
              hoprPolkadot.db.put(u8aToHex(hoprPolkadot.dbKeys.Channel(counterparty)), Buffer.from(signedChannel))
            )

          if (
            hoprPolkadot.utils.isPartyA(
              hoprPolkadot.api.createType('AccountId', hoprPolkadot.self.onChainKeyPair.publicKey),
              counterparty
            )
          ) {
            console.log(chalk.green(`Funding self`, signedChannel.channel.asFunded.balance_a.toString()))
            await channelOpener.increaseFunds(signedChannel.channel.asFunded.balance_a)
          } else {
            console.log(
              chalk.green(
                `Funding counterparty`,
                hoprPolkadot.api.createType(
                  'Balance',
                  signedChannel.channel.asFunded.balance.sub(signedChannel.channel.asFunded.balance_a.toBn())
                )
              )
            )
            await channelOpener.increaseFunds(
              hoprPolkadot.api.createType(
                'Balance',
                signedChannel.channel.asFunded.balance.sub(signedChannel.channel.asFunded.balance_a.toBn())
              )
            )
          }

          await hoprPolkadot.db.put(Buffer.from(hoprPolkadot.dbKeys.Channel(counterparty)), Buffer.from(signedChannel))

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
      .signAndSend(this.hoprPolkadot.self.onChainKeyPair, { nonce: await this.hoprPolkadot.nonce })

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

  async onceFundedByCounterparty(channel: ChannelEnum, handler?: EventHandler): Promise<void | ChannelOpener> {
    if (handler == null) {
      let unsubscribe: () => void

      return new Promise<ChannelOpener>(async resolve => {
        unsubscribe = await this.hoprPolkadot.api.query.hopr.channels<ChannelEnum>(
          this.channelId,
          (currentChannel: ChannelEnum) => {
            if (currentChannel.isFunded && currentChannel.eq(channel)) {
              unsubscribe()
              resolve(this)
            }
          }
        )
      })
    }

    // @TODO implement else

    const unsubscribe = await this.hoprPolkadot.api.query.hopr.channels<ChannelEnum>(this.channelId, _ => {
      unsubscribe()
    })
  }

  async setActive(signedChannel: SignedChannel): Promise<ChannelOpener> {
    try {
      await this.hoprPolkadot.api.tx.hopr
        .setActive(this.counterparty, signedChannel.signature.onChainSignature)
        .signAndSend(this.hoprPolkadot.self.onChainKeyPair, { nonce: await this.hoprPolkadot.nonce })
    } catch (err) {
      console.log(err)
    }

    return this
  }
}

export { ChannelOpener }

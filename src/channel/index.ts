import { Hash, Ticket, State, Channel as ChannelEnum, SignedTicket, Signature, Balance } from '../srml_types'
import { sr25519Verify, sr25519Sign, blake2b } from '@polkadot/wasm-crypto'
import { Nonce, Channel as ChannelKey, ChannelKeyParse, Challenge as ChallengeKey, ChallengeKeyParse } from '../db_keys'
import { Moment, AccountId } from '@polkadot/types/interfaces'
import { ChannelSettler } from './settle'
import { ChannelOpener } from './open'
import { createTypeUnsafe } from '@polkadot/types'
import { getId, isPartyA, u8aXOR } from '../utils'

import { HoprPolkadotClass } from '..'

const NONCE_HASH_KEY = Uint8Array.from(new TextEncoder().encode('Nonce'))

import { ChannelClass as ChannelClassInterface } from '@hoprnet/hopr-core-connector-interface'

export type ChannelProps = {
  hoprPolkadot: HoprPolkadotClass
  counterparty: AccountId
}

export class ChannelClass implements ChannelClassInterface {
  private _channel?: ChannelEnum
  private _settlementWindow?: Moment
  private _channelId?: Hash

  constructor(public props: ChannelProps, channel?: ChannelEnum) {}

  get channelId(): Promise<Hash> {
    if (this._channelId != null) {
      return Promise.resolve<Hash>(this._channelId)
    }

    return new Promise(async (resolve, reject) => {
      try {
        this._channelId = await getId(
          this.props.hoprPolkadot.api.createType('AccountId', this.props.hoprPolkadot.self.publicKey),
          this.props.counterparty,
          this.props.hoprPolkadot.api
        )
      } catch (err) {
        return reject(err)
      }

      resolve(this._channelId)
    })
  }

  private get channel(): Promise<ChannelEnum> {
    if (this._channel != null) {
      return Promise.resolve<ChannelEnum>(this._channel)
    }

    return new Promise<ChannelEnum>(async (resolve, reject) => {
      try {
        this._channel = createTypeUnsafe<ChannelEnum>(this.props.hoprPolkadot.api.registry, 'Channel', [
          await this.props.hoprPolkadot.db.get(ChannelKey(await this.channelId))
        ])
      } catch (err) {
        return reject(err)
      }

      return resolve(this._channel)
    })
  }

  get settlementWindow(): Promise<Moment> {
    if (this._settlementWindow != null) {
      return Promise.resolve<Moment>(this._settlementWindow)
    }

    return new Promise<Moment>(async (resolve, reject) => {
      try {
        this._settlementWindow = await this.props.hoprPolkadot.api.query.hopr.pendingWindow<Moment>()
      } catch (err) {
        return reject(err)
      }

      return resolve(this._settlementWindow)
    })
  }

  get state(): Promise<ChannelEnum> {
    return this.channel
  }

  get balance_a(): Promise<Balance> {
    return this.channel.then(channel => {
      switch (channel.type) {
        case 'Funded':
          return channel.asFunded.balance_a
        case 'Active':
          return channel.asActive.balance_a
        case 'PendingSettlement':
          return channel.asPendingSettlement[0].balance_a
        default:
          throw Error(`Invalid state. Got '${channel.type}'`)
      }
    })
  }

  get balance(): Promise<Balance> {
    return this.channel.then(channel => {
      switch (channel.type) {
        case 'Funded':
          return channel.asFunded.balance
        case 'Active':
          return channel.asActive.balance
        case 'PendingSettlement':
          return channel.asPendingSettlement[0].balance
        default:
          throw Error(`Invalid state. Got '${channel.type}'`)
      }
    })
  }

  get currentBalance(): Promise<Balance> {
    if (
      isPartyA(
        this.props.hoprPolkadot.api.createType('AccountId', this.props.hoprPolkadot.self.publicKey),
        this.props.counterparty
      )
    ) {
      return Promise.resolve<Balance>(this.balance_a)
    }

    return new Promise<Balance>(async resolve => {
      return resolve(this.props.hoprPolkadot.api.createType('Balance', (await this.balance).sub(await this.balance_a)))
    })
  }

  get currentBalanceOfCounterparty(): Promise<Balance> {
    if (
      !isPartyA(
        this.props.hoprPolkadot.api.createType('AccountId', this.props.hoprPolkadot.self.publicKey),
        this.props.counterparty
      )
    ) {
      return Promise.resolve<Balance>(this.balance_a)
    }
    return new Promise<Balance>(async resolve => {
      return resolve(this.props.hoprPolkadot.api.createType('Balance', (await this.balance).sub(await this.balance_a)))
    })
  }

  async createTicket(secretKey: Uint8Array, amount: Balance, challenge: Hash, winProb: Hash): Promise<SignedTicket> {
    const { epoch } = await this.props.hoprPolkadot.api.query.hopr.state<State>(this.props.counterparty)

    const ticket = new Ticket(this.props.hoprPolkadot.api.registry, {
      channelId: await this.channelId,
      epoch,
      challenge,
      amount,
      winProb
    })

    const signature = sr25519Sign(this.props.hoprPolkadot.self.publicKey, secretKey, ticket.toU8a())

    return new SignedTicket(ticket, signature)
  }

  async verifyTicket(signedTicket: SignedTicket): Promise<boolean> {
    if ((await this.currentBalanceOfCounterparty).add(signedTicket.ticket.amount).gt(await this.balance)) {
      return false
    }

    try {
      await this.testAndSetNonce(signedTicket.toU8a())
    } catch (_) {
      return false
    }

    return sr25519Verify(signedTicket.signature, signedTicket.ticket.toU8a(), this.props.counterparty.toU8a())
  }

  async submitTicket(signedTicket: SignedTicket) {}

  async initiateSettlement(): Promise<void> {
    let channelSettler: ChannelSettler

    try {
      channelSettler = await ChannelSettler.create({
        hoprPolkadot: this.props.hoprPolkadot,
        counterparty: this.props.counterparty,
        channelId: await this.channelId,
        settlementWindow: await this.settlementWindow
      })
    } catch (err) {
      throw err
    }

    await Promise.all([channelSettler.onceClosed().then(() => channelSettler.withdraw()), channelSettler.init()])
  }

  async getPreviousChallenges(): Promise<Hash> {
    let pubKeys: Uint8Array[] = []

    return new Promise<Hash>(async (resolve, reject) => {
      this.props.hoprPolkadot.db
        .createReadStream({
          gt: ChallengeKey(
            await this.channelId,
            this.props.hoprPolkadot.api.createType('Hash', new Uint8Array(Hash.length).fill(0x00))
          ),
          lt: ChallengeKey(
            await this.channelId,
            this.props.hoprPolkadot.api.createType('Hash', new Uint8Array(Hash.length).fill(0x00))
          )
        })
        .on('error', reject)
        .on('data', ({ key, ownKeyHalf }) => {
          const [channelId, challenge] = ChallengeKeyParse(key, this.props.hoprPolkadot.api)

          // BIG TODO !!
          // replace this by proper EC-arithmetic
          pubKeys.push(u8aXOR(false, challenge.toU8a(), ownKeyHalf.toU8a()))
        })
        .on('end', () => {
          if (pubKeys.length > 0) {
            return resolve(this.props.hoprPolkadot.api.createType('Hash', u8aXOR(false, ...pubKeys)))
          }

          resolve()
        })
    })
  }

  private async testAndSetNonce(signature: Uint8Array): Promise<void> {
    const nonce = blake2b(signature, NONCE_HASH_KEY, 256)

    const key = Nonce(await this.channelId, this.props.hoprPolkadot.api.createType('Hash', nonce))

    await this.props.hoprPolkadot.db.get(key).then(_ => {
      throw Error('Nonces must not be used twice.')
    })
  }
}

const Channel = {
  create(props: ChannelProps): Promise<ChannelEnum> {
    return new ChannelClass(props).state
  },

  async open(amount: Balance, signature: Promise<Uint8Array>, props: ChannelProps): Promise<ChannelClass> {
    const channelOpener = await ChannelOpener.create({
      hoprPolkadot: props.hoprPolkadot,
      counterparty: props.counterparty
    })

    await channelOpener.increaseFunds(amount)
    await Promise.all([
      /* prettier-ignore */
      channelOpener.onceOpen(),
      channelOpener.setActive(await signature)
    ])

    const channel = new ChannelClass(props)

    await props.hoprPolkadot.db.put(ChannelKey(await channel.channelId), '')

    return channel
  },

  getAllChannels<T, R>(
    onData: (channel: ChannelClass) => T,
    onEnd: (promises: Promise<T>[]) => R,
    hoprPolkadot: HoprPolkadotClass
  ): Promise<R> {
    const promises: Promise<T>[] = []
    return new Promise<R>((resolve, reject) => {
      hoprPolkadot.db
        .createReadStream({
          gt: ChannelKey(hoprPolkadot.api.createType('Hash', new Uint8Array(Hash.length).fill(0x00))),
          lt: ChannelKey(hoprPolkadot.api.createType('Hash', new Uint8Array(Hash.length).fill(0xff)))
        })
        .on('error', err => reject(err))
        .on('data', ({ key, value }) => {
          const channel: ChannelEnum = createTypeUnsafe<ChannelEnum>(hoprPolkadot.api.registry, 'Channel', [value])

          promises.push(
            Promise.resolve(
              onData(
                new ChannelClass({
                  counterparty: ChannelKeyParse(key, hoprPolkadot.api),
                  hoprPolkadot
                })
              )
            )
          )
        })
        .on('end', () => resolve(onEnd(promises)))
    })
  },

  async closeChannels(hoprPolkadot: HoprPolkadotClass): Promise<Balance> {
    return this.getAllChannels(
      (channel: ChannelClass) => {
        channel.initiateSettlement()
      },
      async (promises: Promise<void>[]) => {
        return Promise.all(promises).then(() => hoprPolkadot.api.createType('Balance', 0))
      },
      hoprPolkadot
    )
  }
}

export default Channel

// async setState(channelId, newState) {
//   // console.log(chalk.blue(this.node.peerInfo.id.toB58String()), newState)

//   let record = {}
//   try {
//       record = await this.state(channelId)
//   } catch (err) {
//       if (!err.notFound) throw err
//   }

//   Object.assign(record, newState)

//   // if (!record.counterparty && record.state != this.TransactionRecordState.PRE_OPENED) throw Error(`no counterparty '${JSON.stringify(record)}'`)

//   // if (!record.restoreTransaction && record.state != this.TransactionRecordState.PRE_OPENED)
//   //     throw Error(`no restore transaction '${JSON.stringify(record)}'`)

//   if (record.restoreTransaction) record.restoreTransaction = record.restoreTransaction.toBuffer()
//   if (record.lastTransaction) record.lastTransaction = record.lastTransaction.toBuffer()

//   return this.node.db.put(this.State(channelId), TransactionRecord.encode(record))
// }

//   /**
//    * Computes the delta of funds that were received with the given transaction in relation to the
//    * initial balance.
//    *
//    * @param {Buffer} newValue the transaction upon which the delta funds is computed
//    * @param {Buffer} currentValue the currentValue of the payment channel.
//    * @param {PeerId} counterparty peerId of the counterparty that is used to decide which side of
//    * payment channel we are, i. e. party A or party B.
//    */
//   getEmbeddedMoney(newValue, currentValue, counterparty) {
//     currentValue = new BN(currentValue)
//     newValue = new BN(newValue)

//     const self = pubKeyToEthereumAddress(this.node.peerInfo.id.pubKey.marshal())
//     const otherParty = pubKeyToEthereumAddress(counterparty.pubKey.marshal())

//     if (isPartyA(self, otherParty)) {
//         return newValue.isub(currentValue)
//     } else {
//         return currentValue.isub(newValue)
//     }
// }

// async state(channelId, encodedRecord) {
//   if (!encodedRecord) {
//       try {
//           encodedRecord = await this.node.db.get(this.State(channelId))
//       } catch (err) {
//           if (err.notFound) {
//               err = Error(`Couldn't find any record for channel ${chalk.yellow(channelId.toString('hex'))}`)

//               err.notFound = true
//           }

//           throw err
//       }
//   }

//   const record = TransactionRecord.decode(encodedRecord)

//   if (record.restoreTransaction) record.restoreTransaction = Transaction.fromBuffer(record.restoreTransaction)
//   if (record.lastTransaction) record.lastTransaction = Transaction.fromBuffer(record.lastTransaction)

//   return record
// }

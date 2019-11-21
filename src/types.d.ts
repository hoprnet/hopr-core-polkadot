import BN from 'bn.js'
import { Event } from '@polkadot/types/interfaces'
import { LotteryTicket } from './srml_types'

export type Signature = Uint8Array

export type SignedLotteryTicket = {
  lotteryTicket: LotteryTicket
  signature: Signature
}

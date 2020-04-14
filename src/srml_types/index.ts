import { AccountId, Balance, ChannelId, PreImage, Moment, Hash, Public, TicketEpoch } from './base'
import { ChannelBalance, Channel, Funded, Active, PendingSettlement } from './channel'
import { State } from './state'
import { Ticket } from './ticket'

import { Signature } from './signature'
import { SignedTicket } from './signedTicket'
import { SignedChannel } from './signedChannel'

const SRMLTypes = {
  AccountId,
  Balance,
  ChannelId,
  PreImage,
  Moment,
  Hash,
  Public,
  ChannelBalance,
  Channel,
  Funded,
  State,
  Ticket,
  TicketEpoch,
}

const Types = {
  NativeBalance: Balance,
  SignedChannel,
  SignedTicket,
  Signature,
  ...SRMLTypes,
}

export {
  SRMLTypes,
  Types,
  SignedChannel,
  SignedTicket,
  Signature,
  AccountId,
  Balance,
  Balance as NativeBalance,
  ChannelId,
  PreImage,
  Moment,
  Hash,
  Public,
  ChannelBalance,
  Channel,
  Active,
  Funded,
  PendingSettlement,
  Ticket,
  State,
}

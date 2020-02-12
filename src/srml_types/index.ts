import { AccountId, Balance, ChannelId, PreImage, Moment, Hash, Public, TicketEpoch } from './base'
import { ChannelBalance, Channel, Funded } from './channel'
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
  TicketEpoch
}

const Types = {
  SignedChannel,
  SignedTicket,
  Signature,
  ...SRMLTypes
}

export {
  SRMLTypes,
  Types,
  SignedChannel,
  SignedTicket,
  Signature,
  AccountId,
  Balance,
  ChannelId,
  PreImage,
  Moment,
  Hash,
  Public,
  ChannelBalance,
  Channel,
  Ticket
}

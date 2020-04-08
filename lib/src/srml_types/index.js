"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const base_1 = require("./base");
exports.AccountId = base_1.AccountId;
exports.Balance = base_1.Balance;
exports.ChannelId = base_1.ChannelId;
exports.PreImage = base_1.PreImage;
exports.Moment = base_1.Moment;
exports.Hash = base_1.Hash;
exports.Public = base_1.Public;
const channel_1 = require("./channel");
exports.ChannelBalance = channel_1.ChannelBalance;
exports.Channel = channel_1.Channel;
exports.Funded = channel_1.Funded;
exports.Active = channel_1.Active;
exports.PendingSettlement = channel_1.PendingSettlement;
const state_1 = require("./state");
exports.State = state_1.State;
const ticket_1 = require("./ticket");
exports.Ticket = ticket_1.Ticket;
const signature_1 = require("./signature");
exports.Signature = signature_1.Signature;
const signedTicket_1 = require("./signedTicket");
exports.SignedTicket = signedTicket_1.SignedTicket;
const signedChannel_1 = require("./signedChannel");
exports.SignedChannel = signedChannel_1.SignedChannel;
const SRMLTypes = {
    AccountId: base_1.AccountId,
    Balance: base_1.Balance,
    ChannelId: base_1.ChannelId,
    PreImage: base_1.PreImage,
    Moment: base_1.Moment,
    Hash: base_1.Hash,
    Public: base_1.Public,
    ChannelBalance: channel_1.ChannelBalance,
    Channel: channel_1.Channel,
    Funded: channel_1.Funded,
    State: state_1.State,
    Ticket: ticket_1.Ticket,
    TicketEpoch: base_1.TicketEpoch
};
exports.SRMLTypes = SRMLTypes;
const Types = {
    SignedChannel: signedChannel_1.SignedChannel,
    SignedTicket: signedTicket_1.SignedTicket,
    Signature: signature_1.Signature,
    ...SRMLTypes
};
exports.Types = Types;
//# sourceMappingURL=index.js.map
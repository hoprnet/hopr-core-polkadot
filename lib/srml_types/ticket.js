"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const codec_1 = require("@polkadot/types/codec");
const types_1 = require("@polkadot/types");
const bn_js_1 = __importDefault(require("bn.js"));
const base_1 = require("./base");
const signedTicket_1 = require("./signedTicket");
const utils_1 = require("../utils");
const WIN_PROB = new bn_js_1.default(1);
class Ticket extends codec_1.Struct.with({
    channelId: base_1.Hash,
    challenge: base_1.Hash,
    epoch: base_1.TicketEpoch,
    amount: base_1.Balance,
    winProb: base_1.Hash,
    onChainSecret: base_1.Hash,
}) {
    getEmbeddedFunds() {
        return this.amount.mul(new bn_js_1.default(this.winProb)).div(new bn_js_1.default(new Uint8Array(base_1.Hash.SIZE).fill(0xff)));
    }
    static get SIZE() {
        return base_1.Hash.SIZE + base_1.Hash.SIZE + base_1.TicketEpoch.SIZE + base_1.Balance.SIZE + base_1.Hash.SIZE + base_1.Hash.SIZE;
    }
    static async create(channel, amount, challenge) {
        const { secret } = await channel.coreConnector.api.query.hopr.states(channel.counterparty);
        const winProb = channel.coreConnector.api.createType('Hash', new bn_js_1.default(new Uint8Array(base_1.Hash.SIZE).fill(0xff)).div(WIN_PROB).toArray('le', base_1.Hash.SIZE));
        const channelId = await channel.channelId;
        const ticket = types_1.createTypeUnsafe(channel.coreConnector.api.registry, 'Ticket', [
            {
                channelId,
                epoch: new bn_js_1.default(0),
                challenge,
                onChainSecret: secret,
                amount,
                winProb,
            },
        ]);
        const signature = await utils_1.sign(ticket.hash, channel.coreConnector.self.privateKey, channel.coreConnector.self.publicKey);
        return new signedTicket_1.SignedTicket(undefined, {
            signature,
            ticket,
        });
    }
    static async verify(channel, signedTicket) {
        if ((await channel.currentBalanceOfCounterparty).add(signedTicket.ticket.amount).gt(await channel.balance)) {
            return false;
        }
        try {
            await channel.testAndSetNonce(signedTicket);
        }
        catch {
            return false;
        }
        return utils_1.verify(signedTicket.ticket.hash, signedTicket.signature, await channel.offChainCounterparty);
    }
    static async submit(channel, signedTicket) { }
}
exports.Ticket = Ticket;

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const codec_1 = require("@polkadot/types/codec");
const base_1 = require("./base");
class State extends codec_1.Struct.with({
    epoch: base_1.TicketEpoch,
    secret: base_1.Hash,
    pubkey: base_1.Public
}) {
    static get SIZE() {
        return base_1.Hash.SIZE + base_1.Public.SIZE + base_1.TicketEpoch.SIZE;
    }
}
exports.State = State;

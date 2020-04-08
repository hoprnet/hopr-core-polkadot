"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const secp256k1_1 = __importDefault(require("secp256k1"));
const types_1 = require("@polkadot/types");
const util_1 = require("@polkadot/util");
const ticket_1 = require("./ticket");
const signature_1 = require("./signature");
class SignedTicket extends Uint8Array {
    constructor(arr, struct) {
        if (arr != null && struct == null) {
            super(arr.bytes, arr.offset, SignedTicket.SIZE);
        }
        else if (arr == null && struct != null) {
            const ticket = struct.ticket.toU8a();
            if (ticket.length == ticket_1.Ticket.SIZE) {
                super(util_1.u8aConcat(struct.signature, ticket));
            }
            else if (ticket.length < ticket_1.Ticket.SIZE) {
                super(util_1.u8aConcat(struct.signature, ticket, new Uint8Array(ticket_1.Ticket.SIZE - ticket.length)));
            }
            else {
                throw Error(`Ticket is too big by ${ticket.length - ticket_1.Ticket.SIZE} elements.`);
            }
        }
        else {
            throw Error(`Invalid constructor arguments.`);
        }
    }
    subarray(begin = 0, end) {
        return new Uint8Array(this.buffer, this.byteOffset + begin, end != null ? end - begin : undefined);
    }
    get ticket() {
        const registry = new types_1.TypeRegistry();
        registry.register(ticket_1.Ticket);
        if (this._ticket == null) {
            this._ticket = new ticket_1.Ticket(registry, this.subarray(signature_1.Signature.SIZE, signature_1.Signature.SIZE + ticket_1.Ticket.SIZE));
        }
        return this._ticket;
    }
    get signature() {
        if (this._signature == null) {
            this._signature = new signature_1.Signature({
                bytes: this.buffer,
                offset: this.byteOffset
            });
        }
        return this._signature;
    }
    static get SIZE() {
        return signature_1.Signature.SIZE + ticket_1.Ticket.SIZE;
    }
    get signer() {
        let signer;
        try {
            signer = secp256k1_1.default.ecdsaRecover(this.signature.signature, 
            // @ts-ignore
            this.signature.recovery, this.signature.sr25519PublicKey);
            return Promise.resolve(signer);
        }
        catch (err) {
            return Promise.reject(err);
        }
    }
}
exports.SignedTicket = SignedTicket;
//# sourceMappingURL=signedTicket.js.map
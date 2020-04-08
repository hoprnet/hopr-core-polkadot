import type { Types } from '@hoprnet/hopr-core-connector-interface';
import { Ticket } from './ticket';
import { Signature } from './signature';
declare class SignedTicket extends Uint8Array implements Types.SignedTicket<Ticket, Signature> {
    private _ticket?;
    private _signature?;
    constructor(arr?: {
        bytes: Uint8Array;
        offset: number;
    }, struct?: {
        signature: Signature;
        ticket: Ticket;
    });
    static create(arr?: {
        bytes: Uint8Array;
        offset: number;
    }, struct?: {
        signature: Signature;
        ticket: Ticket;
    }): SignedTicket;
    subarray(begin?: number, end?: number): Uint8Array;
    get ticket(): Ticket;
    get signature(): Signature;
    static get SIZE(): number;
    get signer(): Promise<Uint8Array>;
}
export { SignedTicket };

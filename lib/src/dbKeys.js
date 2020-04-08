"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const srml_types_1 = require("./srml_types");
const encoder = new TextEncoder();
const PREFIX = encoder.encode('payments-');
const SEPERATOR = encoder.encode('-');
const channelSubPrefix = encoder.encode('channel-');
const challengeSubPrefix = encoder.encode('challenge-');
class DbKeys {
    Channel(counterparty) {
        return allocationHelper([
            [PREFIX.length, PREFIX],
            [channelSubPrefix.length, channelSubPrefix],
            [counterparty.length, counterparty]
        ]);
    }
    ChannelKeyParse(arr, api) {
        return api.createType('AccountId', arr.slice(PREFIX.length + channelSubPrefix.length));
    }
    Challenge(channelId, challenge) {
        return allocationHelper([
            [PREFIX.length, PREFIX],
            [challengeSubPrefix.length, challengeSubPrefix],
            [channelId.length, channelId],
            [SEPERATOR.length, SEPERATOR],
            [challenge.length, challenge]
        ]);
    }
    ChallengeKeyParse(arr, api) {
        return [
            api.createType('Hash', arr.slice(PREFIX.length + channelSubPrefix.length, PREFIX.length + channelSubPrefix.length + srml_types_1.Hash.SIZE)),
            api.createType('Hash', arr.slice(PREFIX.length + channelSubPrefix.length + srml_types_1.Hash.SIZE + SEPERATOR.length, PREFIX.length + channelSubPrefix.length + srml_types_1.Hash.SIZE + SEPERATOR.length + srml_types_1.Hash.SIZE))
        ];
    }
    ChannelId(signatureHash) {
        const subPrefix = encoder.encode('channelId-');
        return allocationHelper([
            [PREFIX.length, PREFIX],
            [subPrefix.length, subPrefix],
            [signatureHash.length, signatureHash]
        ]);
    }
    Nonce(channelId, nonce) {
        const subPrefix = encoder.encode('nonce-');
        return allocationHelper([
            [PREFIX.length, PREFIX],
            [subPrefix.length, subPrefix],
            [channelId.length, channelId],
            [SEPERATOR.length, SEPERATOR],
            [nonce.length, nonce]
        ]);
    }
    OnChainSecret() {
        const subPrefix = encoder.encode('onChainSecret');
        return allocationHelper([
            [PREFIX.length, PREFIX],
            [subPrefix.length, subPrefix]
        ]);
    }
    Ticket(channelId, challenge) {
        const subPrefix = encoder.encode('ticket-');
        return allocationHelper([
            [PREFIX.length, PREFIX],
            [subPrefix.length, subPrefix],
            [channelId.length, channelId],
            [SEPERATOR.length, SEPERATOR],
            [challenge.length, challenge]
        ]);
    }
}
exports.default = DbKeys;
function allocationHelper(arr) {
    const totalLength = arr.reduce((acc, current) => {
        return acc + current[0];
    }, 0);
    let result = new Uint8Array(totalLength);
    let offset = 0;
    for (let [size, data] of arr) {
        result.set(data, offset);
        offset += size;
    }
    return result;
}
//# sourceMappingURL=dbKeys.js.map
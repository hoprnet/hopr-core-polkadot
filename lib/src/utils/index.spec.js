"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const assert_1 = __importDefault(require("assert"));
const crypto_1 = require("crypto");
const secp256k1_1 = __importDefault(require("secp256k1"));
const _1 = require(".");
describe('test utils', function () {
    it('should hash values', async function () {
        const testMsg = new Uint8Array([0, 0, 0, 0]);
        assert_1.default.deepEqual(await _1.hash(testMsg), 
        /* prettier-ignore */
        new Uint8Array([17, 218, 109, 31, 118, 29, 223, 155, 219, 76, 157, 110, 83, 3, 235, 212, 31, 97, 133, 141, 10, 86, 71, 161, 167, 191, 224, 137, 191, 146, 27, 233]));
    });
    it('should sign and verify messages', async function () {
        const secp256k1PrivKey = crypto_1.randomBytes(32);
        const secp256k1PubKey = secp256k1_1.default.publicKeyCreate(secp256k1PrivKey);
        const message = crypto_1.randomBytes(23);
        const signature = await _1.sign(message, secp256k1PrivKey, secp256k1PubKey);
        assert_1.default(await _1.verify(message, signature, secp256k1PubKey), `check that signature is verifiable`);
        message[0] ^= 0xff;
        assert_1.default(!(await _1.verify(message, signature, secp256k1PubKey)), `check that manipulated message is not verifiable`);
    });
});
//# sourceMappingURL=index.spec.js.map
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const api_1 = require("@polkadot/api");
const config_1 = require("../config");
const keyring_1 = __importDefault(require("@polkadot/keyring"));
const wasm_crypto_1 = require("@polkadot/wasm-crypto");
const srml_types_1 = require("../srml_types");
const utils_1 = require("../utils");
async function main() {
    const [api] = await Promise.all([
        api_1.ApiPromise.create({
            provider: new api_1.WsProvider(config_1.DEFAULT_URI),
            types: srml_types_1.SRMLTypes
        }),
        wasm_crypto_1.waitReady()
    ]);
    let nonce = 0;
    const keyPairs = [];
    const promises = [];
    for (let i = 0; i < config_1.DEMO_ACCOUNTS.length; i++) {
        keyPairs.push(new keyring_1.default({ type: 'sr25519' }).addFromSeed(utils_1.stringToU8a(config_1.DEMO_ACCOUNTS[i]), undefined, 'sr25519'));
        if (i == 0) {
            nonce = (await api.query.system.accountNonce(keyPairs[0].publicKey)).toNumber();
        }
        promises.push(api.tx.sudo
            .sudo(api.tx.balances.setBalance(keyPairs[0].publicKey, api.createType('Balance', 12345678), api.createType('Balance', 0)))
            .signAndSend(keyPairs[0], { nonce: nonce + i }));
    }
    try {
        await Promise.all(promises);
    }
    catch (err) {
        console.log(err);
    }
    api.disconnect();
}
main();

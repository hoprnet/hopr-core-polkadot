"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const srml_types_1 = require("../srml_types");
const util_1 = require("@polkadot/util");
const keyring_1 = __importDefault(require("@polkadot/keyring"));
const wasm_crypto_1 = require("@polkadot/wasm-crypto");
const secp256k1_1 = __importDefault(require("secp256k1"));
const chalk_1 = __importDefault(require("chalk"));
const types_1 = require("@polkadot/types");
exports.BYTESIZE = 32; // bytes
/**
 * Performs an on-chain hash to the given argument.
 * @param arg argument to hash
 */
async function hash(arg) {
    await wasm_crypto_1.waitReady();
    return wasm_crypto_1.blake2b(arg, new Uint8Array(), exports.BYTESIZE);
}
exports.hash = hash;
/**
 * Creates an AccountId from a given public key.
 * @param pubkey public key
 * @param api Polkadot API
 */
async function pubKeyToAccountId(pubkey) {
    const registry = new types_1.TypeRegistry();
    registry.register(srml_types_1.AccountId);
    return types_1.createTypeUnsafe(registry, 'AccountId', [pubkey]);
}
exports.pubKeyToAccountId = pubKeyToAccountId;
/**
 * Decides whether `self` takes the role of party A.
 * @param self AccountId of ourself
 * @param counterparty AccountId of the counterparty
 */
function isPartyA(initiator, counterparty) {
    return initiator < counterparty;
}
exports.isPartyA = isPartyA;
/**
 * Computes the Id of channel between `self` and `counterparty`.
 * @param api the Polkadot API
 * @param self AccountId of ourself
 * @param counterparty AccountId of the counterparty
 */
async function getId(self, counterparty) {
    const registry = new types_1.TypeRegistry();
    registry.register(srml_types_1.Hash);
    if (isPartyA(self, counterparty)) {
        return types_1.createTypeUnsafe(registry, 'Hash', [await hash(util_1.u8aConcat(self, counterparty))]);
    }
    else {
        return types_1.createTypeUnsafe(registry, 'Hash', [await hash(util_1.u8aConcat(counterparty, self))]);
    }
}
exports.getId = getId;
/**
 * Wait until some on-chain event takes place and gives up after `maxBlocks`
 * in case there were no such events.
 * @param api the Polkadot API
 * @param forWhat name of the event that should happen
 * @param until performs a truth test on the requested event
 * @param maxBlocks maximum amount of blocks to wait
 */
function waitUntil(api, forWhat, until, maxBlocks) {
    let unsubscribe;
    return new Promise(async (resolve, reject) => {
        const currentBlock = await api.query.timestamp.now();
        let i = 0;
        unsubscribe = await api.query.timestamp.now(async (timestamp) => {
            if (timestamp.gt(currentBlock)) {
                i++;
                console.log(`Waiting for ${chalk_1.default.green(forWhat)} ... current timestamp ${chalk_1.default.green(timestamp.toString())}`);
                if (until == null || until(api, timestamp) == true || (maxBlocks != null && i >= maxBlocks)) {
                    setImmediate(() => {
                        console.log(`waiting done for ${chalk_1.default.green(forWhat)}`);
                        unsubscribe();
                        if (until != null && maxBlocks != null && i >= maxBlocks) {
                            reject();
                        }
                        else {
                            resolve();
                        }
                    });
                }
            }
        });
    });
}
exports.waitUntil = waitUntil;
/**
 * Waits for the next block.
 * @param api the Polkadot API
 */
function waitForNextBlock(api) {
    return waitUntil(api, 'block');
}
exports.waitForNextBlock = waitForNextBlock;
/**
 * Pauses the thread for some time.
 * @param miliseconds how long to wait
 */
function wait(miliseconds) {
    return new Promise((resolve) => setTimeout(resolve, miliseconds));
}
exports.wait = wait;
/**
 * Signs a message by using the native signature scheme.
 * @param msg message to sign
 * @param privKey private key
 * @param pubKey public key
 */
async function sign(msg, privKey, pubKey) {
    await wasm_crypto_1.waitReady();
    if (privKey.length != 32) {
        throw Error(`invalid argument. Expected a ${Uint8Array.name} of size 32 bytes but got only ${privKey.length}`);
    }
    const keyPair = new keyring_1.default({ type: 'sr25519' }).addFromSeed(privKey);
    const signature = secp256k1_1.default.ecdsaSign(await hash(util_1.u8aConcat(keyPair.publicKey, msg)), privKey);
    return new srml_types_1.Signature(undefined, {
        secp256k1Signature: signature.signature,
        secp256k1Recovery: signature.recid,
        sr25519PublicKey: keyPair.publicKey,
        sr25519Signature: keyPair.sign(msg),
    });
}
exports.sign = sign;
/**
 * Verifies a signature by using the native signature algorithm.
 * @param msg message that has been signed
 * @param signature signature to verify
 * @param accountId public key of the signer
 */
async function verify(msg, signature, pubKey) {
    await wasm_crypto_1.waitReady();
    if (!secp256k1_1.default
        .ecdsaRecover(signature.secp256k1Signature, signature.secp256k1Recovery[0], await hash(util_1.u8aConcat(signature.sr25519PublicKey, msg)))
        .every((value, index) => value == pubKey[index])) {
        // console.log(
        //   `is`,
        //   (
        //     await pubKeyToAccountId(
        //       secp256k1.ecdsaRecover(
        //         signature.secp256k1Signature,
        //         signature.secp256k1Recovery[0],
        //         signature.sr25519PublicKey
        //       )
        //     )
        //   ).toU8a(),
        //   `but should be`,
        //   pubKey
        // )
        throw Error('invalid secp256k1 signature.');
    }
    return new keyring_1.default({ type: 'sr25519' })
        .addFromAddress(signature.sr25519PublicKey)
        .verify(msg, signature.sr25519Signature);
}
exports.verify = verify;
/**
 * Apply an XOR on a list of arrays.
 *
 * @param inPlace if `true` overwrite first Array with result
 * @param list arrays to XOR
 */
function u8aXOR(inPlace = false, ...list) {
    if (!list.every((array) => array.length == list[0].length)) {
        throw Error(`Uint8Array must not have different sizes`);
    }
    const result = inPlace ? list[0] : new Uint8Array(list[0].length);
    if (list.length == 2) {
        for (let index = 0; index < list[0].length; index++) {
            result[index] = list[0][index] ^ list[1][index];
        }
    }
    else {
        for (let index = 0; index < list[0].length; index++) {
            result[index] = list.reduce((acc, array) => acc ^ array[index], 0);
        }
    }
    return result;
}
exports.u8aXOR = u8aXOR;
/**
 * Checks if the contents of the given Uint8Arrays are equal. Returns once at least
 * one different entry is found.
 * @param a first array
 * @param b second array
 * @param arrays additional arrays
 */
function u8aEquals(a, b, ...arrays) {
    if (arrays == null) {
        const aLength = a.length;
        const bLength = b.length;
        if (aLength != bLength) {
            return false;
        }
        for (let i = 0; i < aLength; i++) {
            if (a[i] != b[i]) {
                return false;
            }
        }
    }
    else {
        arrays.push(a, b);
        const firstLength = arrays[0].length;
        for (let i = 1; i < arrays.length; i++) {
            if (firstLength != arrays[i].length) {
                return false;
            }
        }
        for (let i = 0; i < arrays.length; i++) {
            for (let j = i + 1; j < arrays.length; j++) {
                for (let k = 0; k < firstLength; k++) {
                    if (arrays[i][k] != arrays[j][k]) {
                        return false;
                    }
                }
            }
        }
    }
    return true;
}
exports.u8aEquals = u8aEquals;
/**
 * Converts a string to a Uint8Array and optionally adds some padding to match
 * the desired size.
 * @notice Throws an error in case a length was provided and the result does not fit.
 * @param str string to convert
 * @param length desired length of the Uint8Array
 */
function stringToU8a(str, length) {
    if (length != null && length <= 0) {
        return new Uint8Array([]);
    }
    if (str.startsWith('0x')) {
        str = str.slice(2);
    }
    let strLength = str.length;
    if ((strLength & 1) == 1) {
        str = '0' + str;
        strLength++;
    }
    if (length != null && str.length >> 1 > length) {
        throw Error('Input argument has too many hex decimals.');
    }
    if (length != null && str.length >> 1 < length) {
        str = str.padStart(length << 1, '0');
        strLength = length << 1;
    }
    const arr = new Uint8Array(strLength >> 1);
    for (let i = 0; i < strLength; i += 2) {
        const strSlice = str.slice(i, i + 2).match(/[0-9a-fA-F]{2}/g);
        if (strSlice == null || strSlice.length != 1) {
            throw Error(`Got unknown character '${str.slice(i, i + 2)}'`);
        }
        arr[i >> 1] = parseInt(strSlice[0], 16);
    }
    return arr;
}
exports.stringToU8a = stringToU8a;
const ALPHABET = '0123456789abcdef';
/**
 * Converts a Uint8Array to a hex string.
 * @notice Mainly used for debugging.
 * @param arr Uint8Array
 * @param prefixed if `true` add a `0x` in the beginning
 */
function u8aToHex(arr, prefixed = true) {
    const arrLength = arr.length;
    let result = prefixed ? '0x' : '';
    for (let i = 0; i < arrLength; i++) {
        result += ALPHABET[arr[i] >> 4];
        result += ALPHABET[arr[i] & 15];
    }
    return result;
}
exports.u8aToHex = u8aToHex;
// @TODO proper intgration of decimals
function convertUnit(amount, sourceUnit, targetUnit) {
    return amount;
}
exports.convertUnit = convertUnit;

import { AccountId, Hash, Moment, Signature } from '../srml_types';
import { ApiPromise } from '@polkadot/api';
import BN from 'bn.js';
export declare const BYTESIZE: number;
/**
 * Performs an on-chain hash to the given argument.
 * @param arg argument to hash
 */
export declare function hash(arg: Uint8Array): Promise<Uint8Array>;
/**
 * Creates an AccountId from a given public key.
 * @param pubkey public key
 * @param api Polkadot API
 */
export declare function pubKeyToAccountId(pubkey: Uint8Array): Promise<AccountId>;
/**
 * Decides whether `self` takes the role of party A.
 * @param self AccountId of ourself
 * @param counterparty AccountId of the counterparty
 */
export declare function isPartyA(self: AccountId, counterparty: AccountId): boolean;
/**
 * Computes the Id of channel between `self` and `counterparty`.
 * @param api the Polkadot API
 * @param self AccountId of ourself
 * @param counterparty AccountId of the counterparty
 */
export declare function getId(self: AccountId, counterparty: AccountId, api: ApiPromise): Promise<Hash>;
/**
 * Checks whether the content of both arrays is the same.
 * @param a first array
 * @param b second array
 */
export declare function compareArray(a: Uint8Array, b: Uint8Array): boolean;
/**
 * Wait until some on-chain event takes place and gives up after `maxBlocks`
 * in case there were no such events.
 * @param api the Polkadot API
 * @param forWhat name of the event that should happen
 * @param until performs a truth test on the requested event
 * @param maxBlocks maximum amount of blocks to wait
 */
export declare function waitUntil(api: ApiPromise, forWhat: string, until?: (api: ApiPromise, timestamp?: Moment) => boolean, maxBlocks?: number): Promise<void>;
/**
 * Waits for the next block.
 * @param api the Polkadot API
 */
export declare function waitForNextBlock(api: ApiPromise): Promise<void>;
/**
 * Pauses the thread for some time.
 * @param miliseconds how long to wait
 */
export declare function wait(miliseconds: number): Promise<void>;
/**
 * Signs a message by using the native signature scheme.
 * @param msg message to sign
 * @param privKey private key
 * @param pubKey public key
 */
export declare function sign(msg: Uint8Array, privKey: Uint8Array, pubKey: Uint8Array): Promise<Signature>;
/**
 * Verifies a signature by using the native signature algorithm.
 * @param msg message that has been signed
 * @param signature signature to verify
 * @param accountId public key of the signer
 */
export declare function verify(msg: Uint8Array, signature: Signature, pubKey: Uint8Array): Promise<boolean>;
/**
 * Apply an XOR on a list of arrays.
 *
 * @param inPlace if `true` overwrite first Array with result
 * @param list arrays to XOR
 */
export declare function u8aXOR(inPlace?: boolean, ...list: Uint8Array[]): Uint8Array;
/**
 * Checks if the contents of the given Uint8Arrays are equal. Returns once at least
 * one different entry is found.
 * @param a first array
 * @param b second array
 * @param arrays additional arrays
 */
export declare function u8aEquals(a: Uint8Array, b: Uint8Array, ...arrays: Uint8Array[]): boolean;
/**
 * Converts a string to a Uint8Array and optionally adds some padding to match
 * the desired size.
 * @notice Throws an error in case a length was provided and the result does not fit.
 * @param str string to convert
 * @param length desired length of the Uint8Array
 */
export declare function stringToU8a(str: string, length?: number): Uint8Array;
export declare function convertUnit(amount: BN, sourceUnit: string, targetUnit: string): BN;

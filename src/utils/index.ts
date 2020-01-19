import { AccountId, Hash, Moment } from '../srml_types'
import { ApiPromise } from '@polkadot/api'
import { u8aConcat } from '@polkadot/util'
import { sr25519KeypairFromSeed, sr25519Sign, sr25519Verify, blake2b, waitReady } from '@polkadot/wasm-crypto'
import secp256k1 from 'secp256k1'
import chalk from 'chalk'
import { Utils as IUtils } from '@hoprnet/hopr-core-connector-interface'

// const ID_HASH_KEY: Uint8Array = Uint8Array.from(new TextEncoder().encode('ChannelId'))

const BYTESIZE: number = 32 // bytes

export default class Utils implements IUtils {
  /**
   * Performs an on-chain hash to the given argument.
   * @param arg argument to hash
   */
  async hash(arg: Uint8Array): Promise<Uint8Array> {
    await waitReady()
    return blake2b(arg, new Uint8Array(), BYTESIZE)
  }

  /**
   * Creates an AccountId from a given public key.
   * @param pubkey public key
   * @param api Polkadot API
   */
  async pubKeyToAccountId(pubkey: Uint8Array, api: ApiPromise): Promise<AccountId> {
    return api.createType('AccountId', pubkey)
  }

  /**
   * Decides whether `self` takes the role of party A.
   * @param self AccountId of ourself
   * @param counterparty AccountId of the counterparty
   */
  isPartyA(self: AccountId, counterparty: AccountId): boolean {
    return self < counterparty
  }

  /**
   * Computes the Id of channel between `self` and `counterparty`.
   * @param api the Polkadot API
   * @param self AccountId of ourself
   * @param counterparty AccountId of the counterparty
   */
  async getId(self: AccountId, counterparty: AccountId, api: ApiPromise): Promise<Hash> {
    if (this.isPartyA(self, counterparty)) {
      return api.createType('Hash', await this.hash(u8aConcat(self, counterparty)))
    } else {
      return api.createType('Hash', await this.hash(u8aConcat(counterparty, self)))
    }
  }
  /**
   * Checks whether the content of both arrays is the same.
   * @param a first array
   * @param b second array
   */
  compareArray(a: Uint8Array, b: Uint8Array) {
    return a.length == b.length && a.every((value, index) => value == b[index])
  }

  /**
   * Waits for the next block.
   * @param api the Polkadot API
   */
  waitForNextBlock(api: ApiPromise): Promise<void> {
    return this.waitUntil(api, 'block')
  }

  /**
   * Wait until some on-chain event takes place and gives up after `maxBlocks`
   * in case there were no such events.
   * @param api the Polkadot API
   * @param forWhat name of the event that should happen
   * @param until performs a truth test on the requested event
   * @param maxBlocks maximum amount of blocks to wait
   */
  waitUntil(
    api: ApiPromise,
    forWhat: string,
    until?: (api: ApiPromise, timestamp?: Moment) => boolean,
    maxBlocks?: number
  ): Promise<void> {
    return new Promise<void>(async (resolve, reject) => {
      const currentBlock = await api.query.timestamp.now<Moment>()
      let i: number = 0
      const unsub = await api.query.timestamp.now<Moment>(async (timestamp: Moment) => {
        if (timestamp.gt(currentBlock)) {
          i++

          console.log(`Waiting for ${chalk.green(forWhat)} ... current timestamp ${chalk.green(timestamp.toString())}`)

          if (until == null || until(api, timestamp) == true || (maxBlocks != null && i >= maxBlocks)) {
            setImmediate(() => {
              console.log(`waiting done for ${chalk.green(forWhat)}`)
              unsub()
              if (until != null && maxBlocks != null && i >= maxBlocks) {
                reject()
              } else {
                resolve()
              }
            })
          }
        }
      })
    })
  }

  /**
   * Pauses the thread for some time.
   * @param miliseconds how long to wait
   */
  wait(miliseconds: number): Promise<void> {
    return new Promise<void>(resolve => setTimeout(resolve, miliseconds))
  }

  /**
   * Signs a message by using the native signature scheme.
   * @param msg message to sign
   * @param privKey private key
   * @param pubKey public key
   */
  async sign(
    msg: Uint8Array,
    privKey: Uint8Array,
    pubKey: Uint8Array
  ): Promise<{
    signature: Uint8Array
    recovery: number
  }> {
    await waitReady()

    if (privKey.length != 32) {
      throw Error(`invalid argument. Expected a ${Uint8Array.name} of size 32 bytes but got only ${privKey.length}`)
    }

    const keyPair = sr25519KeypairFromSeed(privKey)

    const schnorrkelPrivKey = keyPair.subarray(0, 64)
    const schnorrkelPubKey = keyPair.subarray(64, 96)

    const signature = secp256k1.sign(Buffer.from(schnorrkelPubKey.slice(0, 32)), Buffer.from(privKey))

    const schnorrkelSignature = sr25519Sign(schnorrkelPubKey, schnorrkelPrivKey, msg)

    return {
      signature: u8aConcat(signature.signature, schnorrkelPubKey, schnorrkelSignature),
      recovery: signature.recovery
    }
  }

  /**
   * Verifies a signature by using the native signature algorithm.
   * @param msg message that has been signed
   * @param signature signature to verify
   * @param pubKey public key of the signer
   */
  async verify(
    msg: Uint8Array,
    signature: { signature: Uint8Array; recovery: number },
    pubKey: Uint8Array
  ): Promise<boolean> {
    if (signature.signature.length != 32 + 64 + 64) {
      throw Error(
        `Invalid signature.signature array. Expected a ${Uint8Array.name} of ${32 + 64 + 64} bytes length but got ${
          signature.signature.length
        }`
      )
    }
    await waitReady()

    const secp256k1Signature = signature.signature.subarray(0, 64)
    const schnorrkelPubKey = signature.signature.subarray(64, 96)

    if (
      !secp256k1
        .recover(Buffer.from(schnorrkelPubKey), Buffer.from(secp256k1Signature), signature.recovery)
        .equals(Buffer.from(pubKey))
    ) {
      throw Error('invalid secp256k1 signature.')
    }

    const schnorrkelSignature = signature.signature.subarray(96, 160)

    return sr25519Verify(schnorrkelSignature, msg, schnorrkelPubKey)
  }

  /**
   * Apply an XOR on a list of arrays.
   *
   * @param inPlace if `true` overwrite first Array with result
   * @param list arrays to XOR
   */
  u8aXOR(inPlace: boolean = false, ...list: Uint8Array[]): Uint8Array {
    if (!list.every(array => array.length == list[0].length)) {
      throw Error(`Uint8Array must not have different sizes`)
    }

    const result = inPlace ? list[0] : new Uint8Array(list[0].length)

    if (list.length == 2) {
      for (let index = 0; index < list[0].length; index++) {
        result[index] = list[0][index] ^ list[1][index]
      }
    } else {
      for (let index = 0; index < list[0].length; index++) {
        result[index] = list.reduce((acc: number, array: Uint8Array) => acc ^ array[index], 0)
      }
    }

    return result
  }
}

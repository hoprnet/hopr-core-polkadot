import { AccountId, Hash, Moment, Signature } from '../srml_types'
import { ApiPromise } from '@polkadot/api'
import { u8aConcat } from '@polkadot/util'
import KeyRing from '@polkadot/keyring'
import { blake2b, waitReady } from '@polkadot/wasm-crypto'
import secp256k1 from 'secp256k1'
import chalk from 'chalk'
import { Utils as IUtils } from '@hoprnet/hopr-core-connector-interface'
import { createTypeUnsafe, TypeRegistry } from '@polkadot/types'

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
  async pubKeyToAccountId(pubkey: Uint8Array): Promise<AccountId> {
    const registry = new TypeRegistry()
    registry.register(AccountId)

    return createTypeUnsafe<AccountId>(registry, 'AccountId', [pubkey])
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
    const registry = new TypeRegistry()
    registry.register(Hash)

    if (this.isPartyA(self, counterparty)) {
      return createTypeUnsafe<Hash>(registry, 'Hash', [await this.hash(u8aConcat(self, counterparty))])
    } else {
      return createTypeUnsafe<Hash>(registry, 'Hash', [await this.hash(u8aConcat(counterparty, self))])
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
  async sign(msg: Uint8Array, privKey: Uint8Array, pubKey: Uint8Array): Promise<Signature> {
    await waitReady()

    if (privKey.length != 32) {
      throw Error(`invalid argument. Expected a ${Uint8Array.name} of size 32 bytes but got only ${privKey.length}`)
    }

    const keyPair = new KeyRing({ type: 'sr25519' }).addFromSeed(privKey)

    // console.log(u8aToHex(keyPair.publicKey))

    const signature = secp256k1.sign(Buffer.from(keyPair.publicKey), Buffer.from(privKey))

    return new Signature(undefined, {
      secp256k1Signature: signature.signature,
      secp256k1Recovery: signature.recovery,
      sr25519PublicKey: keyPair.publicKey,
      sr25519Signature: keyPair.sign(msg)
    })
  }

  /**
   * Verifies a signature by using the native signature algorithm.
   * @param msg message that has been signed
   * @param signature signature to verify
   * @param accountId public key of the signer
   */
  async verify(msg: Uint8Array, signature: Signature, accountId: AccountId): Promise<boolean> {
    await waitReady()

    if (
      !(
        await this.pubKeyToAccountId(
          secp256k1.recover(
            Buffer.from(signature.sr25519PublicKey),
            Buffer.from(signature.secp256k1Signature),
            signature.secp256k1Recovery[0]
          )
        )
      ).every((value: number, index: number) => value == accountId[index])
    ) {
      throw Error('invalid secp256k1 signature.')
    }

    return new KeyRing({ type: 'sr25519' })
      .addFromAddress(signature.sr25519PublicKey)
      .verify(msg, signature.sr25519Signature)
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

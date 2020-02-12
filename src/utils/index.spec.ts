import assert from 'assert'
import { randomBytes } from 'crypto'
import secp256k1 from 'secp256k1'

import { hash, sign, verify } from '.'

describe('test utils', function() {
  it('should hash values', async function() {
    const testMsg = new Uint8Array([0, 0, 0, 0])
    assert.deepEqual(
      await hash(testMsg),
      /* prettier-ignore */
      new Uint8Array([17,218,109,31,118,29,223,155,219,76,157,110,83,3,235,212,31,97,133,141,10,86,71,161,167,191,224,137,191,146,27,233])
    )
  })
  it('should sign and verify messages', async function() {
    const secp256k1PrivKey = randomBytes(32)
    const secp256k1PubKey = secp256k1.publicKeyCreate(secp256k1PrivKey)
    const message = randomBytes(23)
    const signature = await sign(message, secp256k1PrivKey, secp256k1PubKey)
    assert(await verify(message, signature, secp256k1PubKey), `check that signature is verifiable`)

    message[0] ^= 0xff
    assert(!(await verify(message, signature, secp256k1PubKey)), `check that manipulated message is not verifiable`)
  })
})

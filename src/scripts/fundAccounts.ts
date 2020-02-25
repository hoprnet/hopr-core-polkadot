import { ApiPromise, WsProvider } from '@polkadot/api'

import { DEMO_ACCOUNTS, DEFAULT_URI } from '../config'
import Keyring from '@polkadot/keyring'
import { KeyringPair } from '@polkadot/keyring/types'
import { waitReady } from '@polkadot/wasm-crypto'
import { SRMLTypes } from '../srml_types'

import { stringToU8a } from '../utils'

async function main() {
  const [api] = await Promise.all([
    ApiPromise.create({
      provider: new WsProvider(DEFAULT_URI),
      types: SRMLTypes
    }),
    waitReady()
  ])

  let nonce: number = 0

  const keyPairs: KeyringPair[] = []
  const promises: Promise<any>[] = []

  for (let i = 0; i < DEMO_ACCOUNTS.length; i++) {
    keyPairs.push(new Keyring({ type: 'sr25519' }).addFromSeed(stringToU8a(DEMO_ACCOUNTS[i]), undefined, 'sr25519'))

    if (i == 0) {
      nonce = (await api.query.system.accountNonce(keyPairs[0].publicKey)).toNumber()
    }

    promises.push(
      api.tx.sudo
        .sudo(
          api.tx.balances.setBalance(
            keyPairs[0].publicKey,
            api.createType('Balance', 12345678),
            api.createType('Balance', 0)
          )
        )
        .signAndSend(keyPairs[0], { nonce: nonce + i })
    )
  }

  try {
    await Promise.all(promises)
  } catch (err) {
    console.log(err)
  }

  api.disconnect()
}

main()

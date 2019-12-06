import HoprPolkadot from '.'

import { spawn, ChildProcess } from 'child_process'
import { existsSync } from 'fs'
import { resolve } from 'path'

import { cryptoWaitReady } from '@polkadot/util-crypto'
import { Keyring } from '@polkadot/api'
import { KeyringPair } from '@polkadot/keyring/types'

import { waitForNextBlock, wait, getId } from './utils'

import LevelUp from 'levelup'
import Memdown from 'memdown'

import config from './config.json'

const TWENTY_MINUTES = 20 * 60 * 60 * 1000
const FORTY_SECONDS = 40 * 1000

describe('Hopr Polkadot', async function() {
  const path: string = resolve(__dirname, config.polkadotBasepath)
  const binaryPath: string = resolve(path, 'target/debug')

  let keys: Keyring

  let Alice: KeyringPair
  let Bob: KeyringPair

  let polkadotNode: ChildProcess

  let hoprAlice: HoprPolkadot, hoprBob: HoprPolkadot

  before(async function() {
    this.timeout(TWENTY_MINUTES)

    if (!existsSync(path)) {
      throw Error(`Unable to find Polkadot runtime in '${path}'.`)
    }

    if (!existsSync(binaryPath)) {
      await new Promise((resolve, reject) => {
        const cargoBuild = spawn('cargo', ['build', '--release'], { cwd: path })

        cargoBuild.on('error', data => reject(data.toString()))

        cargoBuild.stdout.on('data', data => console.log(data.toString()))
        cargoBuild.on('exit', () => resolve())
      })
    }

    await cryptoWaitReady()

    keys = new Keyring({ type: 'sr25519' })
    Alice = keys.createFromUri('//Alice')
    Bob = keys.createFromUri('//Alice')
  })

  beforeEach(async function() {
    this.timeout(TWENTY_MINUTES)

    await new Promise((resolve, reject) => {
      const purgeChain = spawn(`${binaryPath}/hopr-polkadot`, ['purge-chain', '--dev', '-y'], { cwd: binaryPath })

      purgeChain.on('error', data => reject(data.toString()))

      purgeChain.stdout.on('data', data => console.log(data.toString()))
      purgeChain.on('exit', () => resolve())
    })

    polkadotNode = spawn('cargo', ['run', '--', '--dev', '--no-mdns', '--no-telemetry'], {
      stdio: 'inherit',
      cwd: path
    })

    polkadotNode.stdout?.on('data', data => console.log(data.toString()))

    await wait(10 * 1000)
    ;[hoprAlice, hoprBob] = await Promise.all([
      HoprPolkadot.create(LevelUp(Memdown()), Alice),
      HoprPolkadot.create(LevelUp(Memdown()), Bob)
    ])

    await Promise.all([
      /* prettier-ignore */
      hoprAlice.start(),
      hoprBob.start()
    ])

    await Promise.all([
      /* prettier-ignore */
      hoprAlice.initOnchainValues()
      // hoprBob.initOnchainValues()
    ])

    await waitForNextBlock(hoprAlice.api)

    // console.log(Alice.publicKey)
    // console.log(await hoprAlice.api.query.hopr.states(Alice.publicKey))
  })

  afterEach(() => {
    polkadotNode.kill()
  })

  after(() => {
    hoprAlice.stop()
  })

  it('should connect', async function() {
    this.timeout(TWENTY_MINUTES)
    
    const channelOpener = await hoprAlice.openChannel(
      hoprAlice.api.createType('Balance', 1),
      hoprAlice.api.createType('AccountId', Bob.publicKey)
    )
    const channelId = await getId(
      hoprAlice.api,
      hoprAlice.api.createType('AccountId', Alice.publicKey),
      hoprAlice.api.createType('AccountId', Bob.publicKey)
    )

    await waitForNextBlock(hoprAlice.api)

    const channel = await hoprAlice.api.query.hopr.channels(channelId)
    console.log(channel)
  })
})

import HoprPolkadot from '.'

import { spawn, ChildProcess } from 'child_process'
import { existsSync } from 'fs'
import { resolve } from 'path'

import { hexToU8a } from '@polkadot/util'
import { cryptoWaitReady } from '@polkadot/util-crypto'
import { Keyring } from '@polkadot/api'

import LevelUp from 'levelup'
import Memdown from 'memdown'

import config from './config.json'

const TWENTY_MINUTES = 20 * 60 * 60 * 1000
const TEN_SECONDS = 10 * 1000

describe('Hopr Polkadot', async function() {
  const path: string = resolve(__dirname, config.polkadotBasepath)
  const binaryPath: string = resolve(path, 'target/debug')

  const seed = hexToU8a('0x9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60')

  let polkadotNode: ChildProcess

  let hopr: HoprPolkadot

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
  })

  beforeEach(async function() {
    this.timeout(TEN_SECONDS)

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

    await new Promise(resolve => setTimeout(resolve, 5000))

    polkadotNode.stdout?.on('data', data => console.log(data.toString()))

    hopr = await HoprPolkadot.create(LevelUp(Memdown()), new Keyring().addFromSeed(seed))

  })

  afterEach(() => {
    polkadotNode.kill()
  })

  it('should connect', async () => {
    console.log('')
  })
})

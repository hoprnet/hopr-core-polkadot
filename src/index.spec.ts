import HoprPolkadot, { HoprPolkadotClass } from '.'

import { spawn, ChildProcess } from 'child_process'
import { existsSync } from 'fs'
import { resolve } from 'path'

import { cryptoWaitReady } from '@polkadot/util-crypto'
import { Keyring } from '@polkadot/api'
import { KeyringPair } from '@polkadot/keyring/types'
import { createTypeUnsafe } from '@polkadot/types'

import { Channel as ChannelEnum, Funded, ChannelBalance, Moment } from './srml_types'

import UtilsClass from './utils'
const Utils = new UtilsClass()

import LevelUp from 'levelup'
import Memdown from 'memdown'

import chalk from 'chalk'

import secp256k1 from 'secp256k1'
import { randomBytes } from 'crypto'

import config from './config.json'

const TWENTY_MINUTES = 20 * 60 * 60 * 1000
const FORTY_SECONDS = 40 * 1000

// @TODO: Fix new accounts
describe('Hopr Polkadot', async function() {
  const path: string = resolve(__dirname, config.polkadotBasepath)
  const binaryPath: string = resolve(path, 'target/debug')

  let keys: Keyring

  let Alice: KeyringPair
  let Bob: KeyringPair

  let polkadotNode: ChildProcess

  let hoprAlice: HoprPolkadotClass, hoprBob: HoprPolkadotClass

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
    Bob = keys.createFromUri('//Bob')
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

    await Utils.wait(14 * 1000)
    ;[hoprAlice, hoprBob] = await Promise.all([
      HoprPolkadot.create(LevelUp(Memdown()), Alice),
      HoprPolkadot.create(LevelUp(Memdown()), Bob)
    ])

    await Promise.all([
      /* prettier-ignore */
      hoprAlice.start(),
      hoprBob.start()
    ])

    const [first, second, third] = [await hoprAlice.nonce, await hoprAlice.nonce, await hoprAlice.nonce]

    await Promise.all([
      /* prettier-ignore */
      hoprAlice.initOnchainValues(first),
      hoprBob.initOnchainValues(),
      hoprAlice.api.tx.sudo
        .sudo(
          hoprAlice.api.tx.balances.setBalance(
            Alice.publicKey,
            hoprAlice.api.createType('Balance', 1234567),
            hoprAlice.api.createType('Balance', 0)
          )
        )
        .signAndSend(Alice, { nonce: second }),
      hoprAlice.api.tx.sudo
        .sudo(
          hoprAlice.api.tx.balances.setBalance(
            Bob.publicKey,
            hoprAlice.api.createType('Balance', 1234567),
            hoprAlice.api.createType('Balance', 0)
          )
        )
        .signAndSend(Alice, { nonce: third })
    ])

    await Utils.waitForNextBlock(hoprAlice.api)

    await hoprAlice.api.tx.balances.transfer(Bob.publicKey, 123).signAndSend(Alice)

    console.log(
      `Alice's new balance '${chalk.green(
        (await hoprAlice.api.query.balances.freeBalance(Alice.publicKey)).toString()
      )}'`
    )
  })

  afterEach(() => {
    polkadotNode.kill()
    hoprAlice.stop()
    hoprBob.stop()
  })

  it('should connect', async function() {
    this.timeout(TWENTY_MINUTES)

    const balance = hoprAlice.api.createType('Balance', 12345)

    const channelEnum = createTypeUnsafe<ChannelEnum>(hoprAlice.api.registry, 'Channel', [
      createTypeUnsafe<Funded>(hoprAlice.api.registry, 'Funded', [
        createTypeUnsafe<ChannelBalance>(hoprAlice.api.registry, 'ChannelBalance', [
          {
            balance,
            balanceA: balance
          }
        ])
      ])
    ])

    console.log(chalk.green('Opening channel'))

    const BobsKey = randomBytes(32)
    const BobsPubKey = secp256k1.publicKeyCreate(BobsKey)

    const channelOpener = await hoprAlice.channel.open(
      balance,
      hoprBob.utils.sign(channelEnum.toU8a(), BobsKey, BobsPubKey),
      await hoprBob.utils.pubKeyToAccountId(BobsPubKey)
    )

    console.log('channel opened')

    const channelId = await Utils.getId(
      hoprAlice.api.createType('AccountId', Alice.publicKey),
      hoprAlice.api.createType('AccountId', Bob.publicKey),
      hoprAlice.api
    )

    await Utils.waitForNextBlock(hoprAlice.api)

    let channel = await hoprAlice.api.query.hopr.channels<ChannelEnum>(channelId)
    console.log(channel.asActive.toString())

    await channelOpener.initiateSettlement()
    await Utils.waitForNextBlock(hoprAlice.api)

    channel = await hoprAlice.api.query.hopr.channels<ChannelEnum>(channelId)
    console.log(`Channel '${channel.toString()}`)
  })
})

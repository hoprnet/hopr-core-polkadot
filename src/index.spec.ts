require('dotenv').config()
import assert from 'assert'

import HoprPolkadot from '.'
import secp256k1 from 'secp256k1'

import { spawn, ChildProcess } from 'child_process'
import { existsSync } from 'fs'
import { resolve } from 'path'

import { cryptoWaitReady } from '@polkadot/util-crypto'
import { createTypeUnsafe } from '@polkadot/types'

import { Channel as ChannelEnum, Funded, ChannelBalance, State, SignedChannel } from './srml_types'

import UtilsClass from './utils'
const Utils = new UtilsClass()

import LevelUp from 'levelup'
import Memdown from 'memdown'

import chalk from 'chalk'
import config from './config.json'

const TWENTY_MINUTES = 20 * 60 * 60 * 1000
const FORTY_SECONDS = 40 * 1000

type KeyPair = {
  privateKey: Uint8Array
  publicKey: Uint8Array
}

// @TODO: Fix new accounts
describe('Hopr Polkadot', async function() {
  const path: string = resolve(__dirname, config.polkadotBasepath)
  const binaryPath: string = resolve(path, 'target/debug')

  let Alice: KeyPair
  let Bob: KeyPair

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

    if (process.env[`DEMO_ACCOUNT_0_PRIVATE_KEY`] == null) {
      throw Error(`Could not read private key from 'DEMO_ACCOUNT_0_PRIVATE_KEY'`)
    }
    const AlicesPrivateKey = Buffer.from(process.env[`DEMO_ACCOUNT_0_PRIVATE_KEY`].replace(/0x/, ''), 'hex')

    if (process.env[`DEMO_ACCOUNT_1_PRIVATE_KEY`] == null) {
      throw Error(`Could not read private key from 'DEMO_ACCOUNT_1_PRIVATE_KEY'`)
    }
    const BobsPrivateKey = Buffer.from(process.env[`DEMO_ACCOUNT_1_PRIVATE_KEY`].replace(/0x/, ''), 'hex')

    const AlicesPublicKey = secp256k1.publicKeyCreate(AlicesPrivateKey)
    const BobsPublicKey = secp256k1.publicKeyCreate(BobsPrivateKey)

    Bob = {
      privateKey: BobsPrivateKey,
      publicKey: BobsPublicKey
    }

    Alice = {
      privateKey: AlicesPrivateKey,
      publicKey: AlicesPublicKey
    }
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
            hoprAlice.self.keyPair.publicKey,
            hoprAlice.api.createType('Balance', 1234567),
            hoprAlice.api.createType('Balance', 0)
          )
        )
        .signAndSend(hoprAlice.self.keyPair, { nonce: second }),
      hoprAlice.api.tx.sudo
        .sudo(
          hoprAlice.api.tx.balances.setBalance(
            hoprBob.self.keyPair.publicKey,
            hoprAlice.api.createType('Balance', 1234567),
            hoprAlice.api.createType('Balance', 0)
          )
        )
        .signAndSend(hoprAlice.self.keyPair, { nonce: third })
    ])

    await Utils.waitForNextBlock(hoprAlice.api)
    await Utils.waitForNextBlock(hoprAlice.api)

    assert.deepEqual(
      hoprAlice.self.keyPair.publicKey.subarray(4, 32),
      (
        await hoprAlice.api.query.hopr.states<State>(
          hoprBob.api.createType('AccountId', hoprAlice.self.keyPair.publicKey)
        )
      ).pubkey
        .toU8a()
        .subarray(0, 28),
      `check that the Alice's pubkey has made its way into the on-chain logic`
    )

    assert.deepEqual(
      hoprBob.self.keyPair.publicKey.subarray(4, 32),
      (
        await hoprBob.api.query.hopr.states<State>(hoprBob.api.createType('AccountId', hoprBob.self.keyPair.publicKey))
      ).pubkey
        .toU8a()
        .subarray(0, 28),
      `check that the Bobs pubkey has made its way into the on-chain logic`
    )

    await hoprAlice.api.tx.balances
      .transfer(
        hoprAlice.api.createType('AccountId', hoprBob.self.keyPair.publicKey),
        hoprAlice.api.createType('Balance', 123).toU8a()
      )
      .signAndSend(hoprAlice.self.keyPair, { nonce: await hoprAlice.nonce })

    console.log(
      `Alice's new balance '${chalk.green(
        (await hoprAlice.api.query.balances.freeBalance(hoprAlice.self.keyPair.publicKey)).toString()
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
            balance_a: balance
          }
        ])
      ])
    ])

    console.log(chalk.green('Opening channel'))

    assert(
      await hoprAlice.utils.verify(
        channelEnum.toU8a(),
        await hoprBob.utils.sign(channelEnum.toU8a(), hoprBob.self.privateKey, hoprBob.self.publicKey),
        hoprBob.self.publicKey
      ),
      `check that we got a valid signature over the channel state`
    )

    const channelOpener = await hoprAlice.channel.create(
      hoprAlice,
      hoprBob.self.publicKey,
      () => Promise.resolve(hoprAlice.api.createType('AccountId', hoprBob.self.keyPair.publicKey)),
      channelEnum.asFunded,
      async () =>
        Promise.resolve(
          new SignedChannel(hoprAlice, undefined, {
            channel: channelEnum,
            signature: await hoprBob.utils.sign(channelEnum.toU8a(), hoprBob.self.privateKey, hoprBob.self.publicKey)
          })
        )
    )

    console.log(chalk.green('channel opened'))

    const channelId = await Utils.getId(
      hoprAlice.api.createType('AccountId', hoprAlice.self.keyPair.publicKey),
      hoprAlice.api.createType('AccountId', hoprBob.self.keyPair.publicKey),
      hoprAlice.api
    )

    await Utils.waitForNextBlock(hoprAlice.api)

    let channel = await hoprAlice.api.query.hopr.channels<ChannelEnum>(channelId)
    console.log(channel.asActive.toString())

    await channelOpener.initiateSettlement()
    await Utils.waitForNextBlock(hoprAlice.api)

    channel = await hoprAlice.api.query.hopr.channels<ChannelEnum>(channelId)

    assert(channel.type == 'Uninitialized', `Channel should be empty`)

    console.log(`Channel '${channel.toString()}'`)
  })
})

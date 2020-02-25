import assert from 'assert'

import HoprPolkadot from '.'
import secp256k1 from 'secp256k1'

import { spawn, ChildProcess } from 'child_process'
import { existsSync } from 'fs'
import { resolve } from 'path'

import { cryptoWaitReady } from '@polkadot/util-crypto'
import { createTypeUnsafe } from '@polkadot/types'

import { Channel as ChannelEnum, Funded, ChannelBalance, State, SignedChannel } from './srml_types'

import * as Utils from './utils'

import LevelUp from 'levelup'
import Memdown from 'memdown'

import chalk from 'chalk'
import { polkadotBasepath, DEMO_ACCOUNTS } from './config'

const TWENTY_MINUTES = 20 * 60 * 60 * 1000

type KeyPair = {
  privateKey: Uint8Array
  publicKey: Uint8Array
}

describe('Hopr Polkadot', async function() {
  const path: string = resolve(__dirname, polkadotBasepath)
  const target = 'debug'
  const binaryPath: string = resolve(path, `target/${target}`)

  let Alice: KeyPair
  let Bob: KeyPair

  let polkadotNode: ChildProcess

  let hoprAlice: HoprPolkadot
  let hoprBob: HoprPolkadot

  before(async () => {
    this.timeout(TWENTY_MINUTES)

    if (!existsSync(path)) {
      throw Error(`Unable to find Polkadot runtime in '${path}'.`)
    }

    await buildSubstrateModule(path, target)

    await cryptoWaitReady()

    const AlicesPrivateKey = Utils.stringToU8a(DEMO_ACCOUNTS[0])

    const BobsPrivateKey = Utils.stringToU8a(DEMO_ACCOUNTS[1])

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

    await resetChain(binaryPath)

    polkadotNode = spawn('cargo', ['run', '--', '--dev', '--no-mdns', '--no-telemetry'], {
      stdio: 'inherit',
      cwd: path
    })

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

    assert.doesNotReject(
      Promise.all([
        /* prettier-ignore */
        checkOnChainValues(hoprAlice),
        checkOnChainValues(hoprBob)
      ])
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
          new SignedChannel(undefined, {
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

function buildSubstrateModule(path: string, target: string = 'debug'): Promise<void> {
  return new Promise((resolve, reject) => {
    const cargoBuild = spawn('cargo', target == 'debug' ? ['build'] : ['build', `--${target}`], {
      cwd: path,
      stdio: 'inherit'
    })

    cargoBuild.on('error', data => reject(data.toString()))

    cargoBuild.on('close', () => resolve())
  })
}

function resetChain(binaryPath: string) {
  return new Promise((resolve, reject) => {
    const purgeChain = spawn(`${binaryPath}/hopr-polkadot`, ['purge-chain', '--dev', '-y'], {
      cwd: binaryPath,
      stdio: 'inherit'
    })

    purgeChain.on('error', data => reject(data.toString()))

    purgeChain.on('close', () => resolve())
  })
}

async function checkOnChainValues(hoprPolkadot: HoprPolkadot) {
  if (
    !Utils.u8aEquals(
      hoprPolkadot.self.keyPair.publicKey.subarray(4, 32),
      (
        await hoprPolkadot.api.query.hopr.states<State>(
          hoprPolkadot.api.createType('AccountId', hoprPolkadot.self.keyPair.publicKey)
        )
      ).pubkey
        .toU8a()
        .subarray(0, 28)
    )
  ) {
    throw Error(`Local values and on-chain values does not match.`)
  }
}

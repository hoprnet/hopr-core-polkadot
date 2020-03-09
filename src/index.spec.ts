import assert from 'assert'

import HoprPolkadot from '.'

import { spawn, ChildProcess } from 'child_process'
import { existsSync } from 'fs'
import { resolve } from 'path'

import { cryptoWaitReady } from '@polkadot/util-crypto'
import pipe from 'it-pipe'

import { Channel as ChannelEnum, State, SignedChannel } from './srml_types'

import * as Utils from './utils'

import LevelUp from 'levelup'
import Memdown from 'memdown'

import chalk from 'chalk'
import { polkadotBasepath, DEMO_ACCOUNTS } from './config'
import BN from 'bn.js'

type KeyPair = {
  privateKey: Uint8Array
  publicKey: Uint8Array
}

const TWENTY_MINUTES = 20 * 60 * 60 * 1000

describe('Hopr Polkadot', async function() {
  const path: string = resolve(__dirname, polkadotBasepath)
  const target = 'debug'
  const binaryPath: string = resolve(path, `target/${target}`)

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
      HoprPolkadot.create(LevelUp(Memdown()), Utils.stringToU8a(DEMO_ACCOUNTS[0])),
      HoprPolkadot.create(LevelUp(Memdown()), Utils.stringToU8a(DEMO_ACCOUNTS[1]))
    ])

    await Promise.all([
      /* prettier-ignore */
      hoprAlice.start(),
      hoprBob.start()
    ])

    const [first, second] = [await hoprAlice.nonce, await hoprAlice.nonce]

    await Promise.all([
      /* prettier-ignore */
      hoprAlice.api.tx.sudo
        .sudo(
          hoprAlice.api.tx.balances.setBalance(
            hoprAlice.self.keyPair.publicKey,
            hoprAlice.api.createType('Balance', 1234567),
            hoprAlice.api.createType('Balance', 0)
          )
        )
        .signAndSend(hoprAlice.self.keyPair, { nonce: first }),
      hoprAlice.api.tx.sudo
        .sudo(
          hoprAlice.api.tx.balances.setBalance(
            hoprBob.self.keyPair.publicKey,
            hoprAlice.api.createType('Balance', 1234567),
            hoprAlice.api.createType('Balance', 0)
          )
        )
        .signAndSend(hoprAlice.self.keyPair, { nonce: second })
    ])

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

  afterEach(async () => {
    polkadotNode.kill()
    await hoprAlice.stop()
    await hoprBob.stop()
  })

  it('should connect', async function() {
    this.timeout(TWENTY_MINUTES)

    const channelEnum = ChannelEnum.createFunded({
      balance: new BN(12345),
      balance_a: new BN(123)
    })

    console.log(chalk.green('Opening channel'))

    assert(
      await (await SignedChannel.create(hoprAlice, channelEnum)).verify(hoprAlice),
      `check that we got a valid signature over the channel state`
    )

    const channel = await hoprAlice.channel.create(
      hoprAlice,
      hoprBob.self.publicKey,
      () => Promise.resolve(hoprAlice.api.createType('AccountId', hoprBob.self.keyPair.publicKey)),
      channelEnum.asFunded,
      async () => {
        const result = await pipe(
          [(await SignedChannel.create(hoprAlice, channelEnum)).subarray()],
          hoprAlice.channel.handleOpeningRequest(hoprBob),
          async (source: AsyncIterable<any>) => {
            let result: Uint8Array
            for await (const msg of source) {
              if (result! == null) {
                result = msg.slice()
                return result
              } else {
                continue
              }
            }
          }
        )

        return new SignedChannel({
          bytes: result.buffer,
          offset: result.byteOffset
        })
      }
    )

    console.log(chalk.green('channel opened'))

    const channelId = await Utils.getId(
      hoprAlice.api.createType('AccountId', hoprAlice.self.keyPair.publicKey),
      hoprAlice.api.createType('AccountId', hoprBob.self.keyPair.publicKey),
      hoprAlice.api
    )

    await Utils.waitForNextBlock(hoprAlice.api)

    let onChainChannel = await hoprAlice.api.query.hopr.channels<ChannelEnum>(channelId)
    console.log(onChainChannel.toJSON())

    const ticket = await channel.ticket.create(
      channel,
      channel.hoprPolkadot.api.createType('Balance', new BN(12)),
      channel.hoprPolkadot.api.createType('Hash', new Uint8Array(32).fill(0x00))
    )

    console.log(chalk.green(`ticket`), ticket)

    await channel.initiateSettlement()
    await Utils.waitForNextBlock(hoprAlice.api)

    onChainChannel = await hoprAlice.api.query.hopr.channels<ChannelEnum>(channelId)

    assert(onChainChannel.type == 'Uninitialized', `Channel should be empty`)

    console.log(`Channel `, onChainChannel.toJSON())
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

// import HoprPolkadot from "../src"

import { spawn } from 'child_process'
import { existsSync } from 'fs'
import { resolve } from 'path'

import config from './config.json'

async function main() {
  const path = resolve(__dirname, config.polkadotBasepath)

  if (!existsSync(path)) {
    throw Error(`Unable to find Polkadot runtime in '${path}'.`)
  }

  const binaryPath = resolve(path, 'target/release')
  if (!existsSync(binaryPath)) {
    await new Promise((resolve, reject) => {
      const cargoBuild = spawn('cargo', ['build', '--release'], { cwd: path })

      cargoBuild.on('error', data => reject(data.toString()))

      cargoBuild.stdout.on('data', data => console.log(data.toString()))
      cargoBuild.on('exit', () => resolve())
    })
  }

  await new Promise((resolve, reject) => {
    const purgeChain = spawn(`${binaryPath}/hopr-polkadot`, ['purge-chain', '--dev', '-y'], { cwd: binaryPath })

    purgeChain.on('error', data => reject(data.toString()))

    purgeChain.stdout.on('data', data => console.log(data.toString()))
    purgeChain.on('exit', () => resolve())
  })

  spawn('cargo', ['run', '--', '--dev'], {
    stdio: 'inherit',
    cwd: path
  }).stdout?.on('data', data => console.log(data.toString()))
}

main()
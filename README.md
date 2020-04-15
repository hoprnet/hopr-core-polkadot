# HOPR net

HOPR is a privacy-preserving messaging protocol that incentivizes users to participate in the network. It provides privacy by relaying messages via several relay nodes to the recipient. Relay nodes are getting paid via payment channels for their services.

## hopr-core-polkadot

A connector between [`hopr-core`](https://github.com/hoprnet/hopr-core) and [`hopr-polkadot`](https://github.com/hoprnet/hopr-polkadot). Implements [`hopr-core-connector-interface`](https://github.com/hoprnet/hopr-core-connector-interface).

## Testing

### Get `hopr-core-polkadot`

```
git clone https://github.com/hoprnet/hopr-core-polkadot.git
cd hopr-core-polkadot
```

### Install `hopr-polkadot`

Make sure you have installed a recent version of `rust`, e.g. test it via 

```
rustc --version
// rustc 1.40.0 (73528e339 2019-12-16)
```

Follow the instruction stated in [`hopr-polkadot`](https://github.com/hoprnet/hopr-polkadot). **This also includes building Substrate 1.0**. Be aware that this might take some time.

Change `polkadotBasepath` in `src/config.ts` such that it points to the directory in which [`hopr-polkadot`](https://github.com/hoprnet/hopr-polkadot) is installed.

```ts
export const polkadotBasepath = "../../hopr-polkadot"
```

Once that is done, run:

```
npx mocha
//   Hopr Polkadot
// "/Users/****/Library/Application Support/hopr-polkadot/chains/dev/db" removed.
//
//      Finished dev [unoptimized + debuginfo] target(s) in 0.39s
//      Running `target/debug/hopr-polkadot --dev --no-mdns --no-telemetry`
// 2020-01-17 16:28:59 Substrate Node
// 2020-01-17 16:28:59   version 1.0.0-5e29413-x86_64-macos
// 2020-01-17 16:28:59 Chain specification: Development
// 2020-01-17 16:28:59 Node name: cowardly-observation-9409
// 2020-01-17 16:28:59 Roles: AUTHORITY
// 2020-01-17 16:28:59 Initializing Genesis block/state (state: 0x9d79…05a6, header-hash: 0xfff5…4e5b)
// 2020-01-17 16:29:00 Loaded block-time = 10 seconds from genesis on first-launch
// ...
// 2020-01-17 16:29:12 Accepted a new tcp connection from 127.0.0.1:61012.
// 2020-01-17 16:29:12 Accepted a new tcp connection from 127.0.0.1:61013.
// ...
// Event system.ExtrinsicSuccess - [ An extrinsic completed successfully.]
// Event system.ExtrinsicSuccess - [ An extrinsic completed successfully.]
// 2020-01-17 16:29:15 Idle (0 peers), best: #1 (0x403f…c380), finalized #0 (0xfff5…4e5b), ⬇ 0 ⬆ 0
// 2020-01-17 16:29:15 Libp2p => Random Kademlia query has yielded empty results
// ...
// Waiting for block ... current timestamp 1579274960
// Event system.ExtrinsicSuccess - [ An extrinsic completed successfully.]
// Event system.ExtrinsicSuccess - [ An extrinsic completed successfully.]
// waiting done for block
// Alice's new balance '1152921504606846976'
// Opening channel
// ...
```

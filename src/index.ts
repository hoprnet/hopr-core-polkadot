import { ApiPromise, WsProvider, Keyring } from '@polkadot/api'
import { blake2b } from '@polkadot/wasm-crypto'
import { LevelUp } from 'levelup'
import { EventSignalling } from './events'
import { Vec } from '@polkadot/types/codec'
import { Types, Balance, AccountId } from './srml_types'
import { Channel } from './channel'
import { cryptoWaitReady } from '@polkadot/util-crypto'

const POLKADOT_URI: string = 'ws://localhost:9944'

export type HoprPolkadotProps = {
  self: AccountId
  api: ApiPromise
  db: LevelUp
  keyring: Keyring
}

export default class HoprPolkadot {
  private started: boolean = false

  eventSubscriptions: EventSignalling

  constructor(private props: HoprPolkadotProps) {
    this.eventSubscriptions = new EventSignalling(this.props.api)
  }

  /**
   * Creates an uninitialised instance.
   *
   * @param db database instance
   */
  static async create(db: LevelUp, self: AccountId): Promise<HoprPolkadot> {
    const api = await ApiPromise.create({
      provider: new WsProvider(POLKADOT_URI),
      types: Types
    })

    return new HoprPolkadot({
      api,
      db,
      keyring: new Keyring({ type: 'sr25519' }),
      self
    })
  }

  async start(): Promise<void> {
    await Promise.all([
      // prettier-ignore
      this.props.api.isReady,
      cryptoWaitReady()
    ])

    this.props.keyring.addFromUri('//Alice', { name: 'Alice default' })

    // const alice = keyring.addFromUri("//Alice", { name: "Alice" });
    // const bob = keyring.addFromUri("//Bob", { name: "Bob" });

    // const unsub = await api.query.balances.freeBalance(
    //   alice.address,
    //   balance => {
    //     console.log(`Your account balance is ${balance}`);
    //   }
    // );

    // const unsubEventListener = api.query.system.events((events: any) => {
    //   console.log(`\nReceived ${events.length} events:`);

    //   // Loop through the Vec<EventRecord>
    //   events.forEach(record => {
    //     // Extract the phase, event and the event types
    //     const { event, phase } = record;
    //     const types = event.typeDef;

    //     // Show what we are busy with
    //     console.log(
    //       `\t${event.section}:${event.method}:: (phase=${phase.toString()})`
    //     );
    //     console.log(`\t\t${event.meta.documentation.toString()}`);

    //     // Loop through each of the parameters, displaying the type and data
    //     event.data.forEach((data, index) => {
    //       console.log(`\t\t\t${types[index].type}: ${data.toString()}`);
    //     });
    //   });
    // });

    // console.log(
    //   `Alice's balance before ${await api.query.balances.freeBalance(
    //     alice.address
    //   )}`
    // );

    // const result = await this.api.tx.sudo
    //   .sudo(this.api.tx.balances.setBalance(bob.address, 123450, 0))
    //   .signAndSend(alice);

    // let i = 0;

    this.started = true
  }

  async openChannel(amount: Balance, counterparty: AccountId) {
    if (!this.started) throw Error('Module is not yet fully initialised.')

    Channel.open(
      {
        ...this.props,
        counterparty
      },
      amount,
      this.eventSubscriptions
    )
  }
}

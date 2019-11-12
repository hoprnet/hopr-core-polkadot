import { ApiPromise } from "@polkadot/api";

export default class HoprPolkadot {
  constructor() {}

  static async create() {
    const api = await ApiPromise.create({
      types: {
        ChannelBalance: {
          balance: "Balance",
          balance_a: "Balance"
        },
        Channel: {
          _enum: {
            Uninitialized: null,
            Funded: "ChannelBalance<Balance>",
            Active: "ChannelBalance<Balance>",
            PendingSettlement: "ChannelBalance<Balance>, Moment"
          }
        },
        State: {
          secret: "Hash",
          pubkey: "Public"
        },
        LotteryTicket: {
          challenge: "Hash",
          on_chain_secret: "Hash",
          amount: "Balance",
          win_prob: "Hash"
        }
      }
    });
  }
}

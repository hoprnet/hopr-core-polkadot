"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const assert_1 = __importDefault(require("assert"));
const memdown_1 = __importDefault(require("memdown"));
const Utils = __importStar(require("../utils"));
const srml_types_1 = require("../srml_types");
const types_1 = require("@polkadot/types");
const crypto_1 = require("crypto");
const secp256k1_1 = __importDefault(require("secp256k1"));
const bn_js_1 = __importDefault(require("bn.js"));
const types_2 = require("@polkadot/types");
const levelup_1 = __importDefault(require("levelup"));
const dbKeys_1 = __importDefault(require("../dbKeys"));
const keyring_1 = __importDefault(require("@polkadot/keyring"));
const wasm_crypto_1 = require("@polkadot/wasm-crypto");
const _1 = require(".");
describe('test ticket generation and verification', function () {
    const registry = new types_1.TypeRegistry();
    registry.register({ AccountId: srml_types_1.AccountId, Active: srml_types_1.Active, Balance: srml_types_1.Balance, Channel: srml_types_1.Channel, ChannelId: srml_types_1.ChannelId, Ticket: srml_types_1.Ticket });
    let hoprPolkadot;
    let counterpartysHoprPolkadot;
    const channels = new Map();
    function onChainChannels(channelId) {
        return Promise.resolve(channels.get(channelId.toHex()));
    }
    beforeEach(async function () {
        await wasm_crypto_1.waitReady();
        channels.clear();
        const privKey = crypto_1.randomBytes(32);
        const pubKey = secp256k1_1.default.publicKeyCreate(privKey);
        const keyPair = new keyring_1.default({ type: 'sr25519' }).addFromSeed(privKey, undefined, 'sr25519');
        hoprPolkadot = {
            utils: Utils,
            db: new levelup_1.default(memdown_1.default()),
            accountBalance: Promise.resolve(new srml_types_1.Balance(registry, new bn_js_1.default(1234567))),
            eventSubscriptions: {
                once: (_, handler) => setTimeout(handler)
            },
            api: {
                tx: {
                    hopr: {
                        create: function () {
                            const signAndSend = () => Promise.resolve();
                            return { signAndSend };
                        },
                        setActive: function () {
                            const signAndSend = () => Promise.resolve();
                            return { signAndSend };
                        }
                    }
                },
                query: {
                    hopr: {
                        state: () => Promise.resolve({
                            epoch: new bn_js_1.default(0),
                            secret: types_2.createTypeUnsafe(registry, 'Hash', [new Uint8Array(32)])
                        }),
                        channels: onChainChannels
                    }
                },
                registry,
                createType: (type, ...params) => types_1.createType(registry, type, ...params)
            },
            nonce: Promise.resolve(0),
            self: {
                publicKey: pubKey,
                privateKey: privKey,
                keyPair
            },
            dbKeys: new dbKeys_1.default()
        };
        const counterpartysPrivKey = crypto_1.randomBytes(32);
        const counterpartysPubKey = secp256k1_1.default.publicKeyCreate(privKey);
        counterpartysHoprPolkadot = {
            utils: Utils,
            db: new levelup_1.default(memdown_1.default()),
            eventSubscriptions: {
                once: (_, handler) => setTimeout(handler)
            },
            accountBalance: Promise.resolve(new srml_types_1.Balance(registry, new bn_js_1.default(1234567))),
            api: {
                tx: {
                    hopr: {
                        create: function () {
                            const signAndSend = () => Promise.resolve();
                            return { signAndSend };
                        },
                        setActive: function () {
                            const signAndSend = () => Promise.resolve();
                            return { signAndSend };
                        }
                    }
                },
                query: {
                    hopr: {
                        state: () => Promise.resolve({
                            epoch: new bn_js_1.default(0),
                            secret: types_2.createTypeUnsafe(registry, 'Hash', [new Uint8Array(32)])
                        }),
                        channels: onChainChannels
                    }
                },
                registry,
                createType: (type, ...params) => types_1.createType(registry, type, ...params)
            },
            nonce: Promise.resolve(0),
            self: {
                publicKey: counterpartysPubKey,
                privateKey: counterpartysPrivKey,
                keyPair: new keyring_1.default({ type: 'sr25519' }).addFromSeed(counterpartysPrivKey, undefined, 'sr25519')
            },
            dbKeys: new dbKeys_1.default()
        };
    });
    it('should create a valid ticket', async function () {
        const channelEnum = new srml_types_1.Channel(registry, new srml_types_1.Funded(registry, new srml_types_1.ChannelBalance(registry, {
            balance: new bn_js_1.default(123),
            balance_a: new bn_js_1.default(122)
        })));
        const channelId = await hoprPolkadot.utils.getId(hoprPolkadot.api.createType('AccountId', hoprPolkadot.self.keyPair.publicKey), hoprPolkadot.api.createType('AccountId', counterpartysHoprPolkadot.self.keyPair.publicKey), hoprPolkadot.api);
        channels.set(channelId.toHex(), channelEnum);
        const signedChannel = new srml_types_1.SignedChannel(undefined, {
            channel: channelEnum,
            signature: await hoprPolkadot.utils.sign(channelEnum.toU8a(), counterpartysHoprPolkadot.self.privateKey, counterpartysHoprPolkadot.self.publicKey)
        });
        hoprPolkadot.db.put(hoprPolkadot.dbKeys.Channel(types_2.createTypeUnsafe(hoprPolkadot.api.registry, 'AccountId', [
            counterpartysHoprPolkadot.self.keyPair.publicKey
        ])), Buffer.from(signedChannel.toU8a()));
        const channel = await _1.Channel.create(hoprPolkadot, counterpartysHoprPolkadot.self.publicKey, () => Promise.resolve(counterpartysHoprPolkadot.api.createType('AccountId', counterpartysHoprPolkadot.self.keyPair.publicKey)), signedChannel.channel.asFunded);
        const preImage = crypto_1.randomBytes(32);
        const hash = await hoprPolkadot.utils.hash(preImage);
        const ticket = await channel.ticket.create(channel, new srml_types_1.Balance(registry, 1), new srml_types_1.Hash(registry, hash), hoprPolkadot.self.privateKey, hoprPolkadot.self.publicKey);
        signedChannel.signature = await counterpartysHoprPolkadot.utils.sign(channelEnum.toU8a(), hoprPolkadot.self.privateKey, hoprPolkadot.self.publicKey);
        counterpartysHoprPolkadot.db.put(hoprPolkadot.dbKeys.Channel(types_2.createTypeUnsafe(hoprPolkadot.api.registry, 'AccountId', [hoprPolkadot.self.keyPair.publicKey])), Buffer.from(signedChannel.toU8a()));
        const counterpartysChannel = await _1.Channel.create(counterpartysHoprPolkadot, hoprPolkadot.self.publicKey, () => Promise.resolve(hoprPolkadot.api.createType('AccountId', hoprPolkadot.self.keyPair.publicKey)), signedChannel.channel.asFunded);
        assert_1.default(await counterpartysChannel.ticket.verify(counterpartysChannel, ticket));
    });
    // it('should open a channel and create a valid ticket', async function() {
    //   const channelEnum = new ChannelEnum(
    //     registry,
    //     new Funded(
    //       registry,
    //       new ChannelBalance(registry, {
    //         balance: new BN(123),
    //         balance_a: new BN(122)
    //       })
    //     )
    //   )
    //   const signPromise = Channel.handleOpeningRequest(
    //     counterpartysHoprPolkadot,
    //     new SignedChannel(hoprPolkadot, undefined, {
    //       channel: channelEnum,
    //       signature: await hoprPolkadot.utils.sign(
    //         channelEnum.toU8a(),
    //         hoprPolkadot.self.privateKey,
    //         hoprPolkadot.self.publicKey
    //       )
    //     }).toU8a()
    //   )
    //   const channel = await Channel.create(
    //     hoprPolkadot,
    //     counterpartysHoprPolkadot.self.publicKey,
    //     () => Promise.resolve(counterpartysHoprPolkadot.self.keyPair.publicKey),
    //     channelEnum.asFunded,
    //     () => signPromise.then((arr: Uint8Array) => new SignedChannel(counterpartysHoprPolkadot, arr))
    //   )
    //   const preImage = randomBytes(32)
    //   const hash = await hoprPolkadot.utils.hash(preImage)
    //   const ticket = await channel.ticket.create(
    //     channel,
    //     new Balance(registry, 1),
    //     new Hash(registry, hash),
    //     hoprPolkadot.self.privateKey,
    //     hoprPolkadot.self.publicKey
    //   )
    //   const counterpartysChannel = await Channel.create(counterpartysHoprPolkadot, hoprPolkadot.self.publicKey, () =>
    //     Promise.resolve(hoprPolkadot.self.keyPair.publicKey)
    //   )
    //   assert(await counterpartysChannel.ticket.verify(counterpartysChannel, ticket))
    // })
});
//# sourceMappingURL=index.speccc.js.map
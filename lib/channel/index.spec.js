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
const DbKeys = __importStar(require("../dbKeys"));
const keyring_1 = __importDefault(require("@polkadot/keyring"));
const wasm_crypto_1 = require("@polkadot/wasm-crypto");
const _1 = require(".");
const it_pipe_1 = __importDefault(require("it-pipe"));
const open_1 = require("./open");
const TEN_SECONDS = 10 * 1000;
describe('test ticket generation and verification', function () {
    this.timeout(TEN_SECONDS);
    const registry = new types_1.TypeRegistry();
    registry.register({ AccountId: srml_types_1.AccountId, Active: srml_types_1.Active, Balance: srml_types_1.Balance, Channel: srml_types_1.Channel, ChannelId: srml_types_1.ChannelId, Ticket: srml_types_1.Ticket });
    let hoprPolkadot;
    let counterpartysHoprPolkadot;
    const channels = new Map();
    const preChannels = new Map();
    function onChainChannels(channelId, fn) {
        if (fn != null) {
            let found = preChannels.get(channelId.toHex());
            if (found == null) {
                return Promise.reject(`Could not find channel ${channelId.toHex()}`);
            }
            // @TODO this is very hacky
            setImmediate(fn, found);
            return Promise.resolve(() => { });
        }
        return Promise.resolve(channels.get(channelId.toHex()));
    }
    function generateNode() {
        const privKey = crypto_1.randomBytes(32);
        const pubKey = secp256k1_1.default.publicKeyCreate(privKey);
        const onChainKeyPair = new keyring_1.default({ type: 'sr25519' }).addFromSeed(privKey, undefined, 'sr25519');
        const hoprPolkadot = {
            utils: {
                ...Utils,
                waitForNextBlock() {
                    Promise.resolve();
                }
            },
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
                        states: () => Promise.resolve({
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
                onChainKeyPair
            },
            dbKeys: DbKeys,
            channel: _1.Channel
        };
        return hoprPolkadot;
    }
    beforeEach(async function () {
        this.timeout(TEN_SECONDS);
        await wasm_crypto_1.waitReady();
        channels.clear();
        preChannels.clear();
        hoprPolkadot = generateNode();
        counterpartysHoprPolkadot = generateNode();
    });
    it('should create a valid ticket', async function () {
        this.timeout(TEN_SECONDS);
        const channelEnum = new srml_types_1.Channel(registry, new srml_types_1.Funded(registry, new srml_types_1.ChannelBalance(registry, {
            balance: new bn_js_1.default(123),
            balance_a: new bn_js_1.default(122)
        })));
        const channelId = await hoprPolkadot.utils.getId(hoprPolkadot.api.createType('AccountId', hoprPolkadot.self.onChainKeyPair.publicKey), hoprPolkadot.api.createType('AccountId', counterpartysHoprPolkadot.self.onChainKeyPair.publicKey));
        const signedChannel = await srml_types_1.SignedChannel.create(counterpartysHoprPolkadot, undefined, { channel: channelEnum });
        preChannels.set(Utils.u8aToHex(channelId), channelEnum);
        const channel = await _1.Channel.create(hoprPolkadot, counterpartysHoprPolkadot.self.publicKey, () => Promise.resolve(counterpartysHoprPolkadot.api.createType('AccountId', counterpartysHoprPolkadot.self.onChainKeyPair.publicKey)), signedChannel.channel.asFunded, async () => {
            const result = await it_pipe_1.default([(await srml_types_1.SignedChannel.create(hoprPolkadot, undefined, { channel: channelEnum })).subarray()], open_1.ChannelOpener.handleOpeningRequest(counterpartysHoprPolkadot), async (source) => {
                let result;
                for await (const msg of source) {
                    if (result == null) {
                        result = msg.slice();
                        return result;
                    }
                    else {
                        continue;
                    }
                }
            });
            return new srml_types_1.SignedChannel({
                bytes: result.buffer,
                offset: result.byteOffset
            });
        });
        channels.set(Utils.u8aToHex(channelId), channelEnum);
        const preImage = crypto_1.randomBytes(32);
        const hash = await hoprPolkadot.utils.hash(preImage);
        const ticket = await channel.ticket.create(channel, new srml_types_1.Balance(registry, 1), new srml_types_1.Hash(registry, hash));
        assert_1.default(Utils.u8aEquals(await ticket.signer, hoprPolkadot.self.publicKey), `Check that signer is recoverable`);
        const signedChannelCounterparty = await srml_types_1.SignedChannel.create(hoprPolkadot, undefined, { channel: channelEnum });
        assert_1.default(Utils.u8aEquals(await signedChannelCounterparty.signer, hoprPolkadot.self.publicKey), `Check that signer is recoverable.`);
        counterpartysHoprPolkadot.db.put(Buffer.from(hoprPolkadot.dbKeys.Channel(types_2.createTypeUnsafe(hoprPolkadot.api.registry, 'AccountId', [hoprPolkadot.self.onChainKeyPair.publicKey]))), Buffer.from(signedChannelCounterparty));
        const dbChannels = (await counterpartysHoprPolkadot.channel.getAll(counterpartysHoprPolkadot, async (arg) => arg, async (arg) => Promise.all(arg)));
        assert_1.default(Utils.u8aEquals(dbChannels[0].counterparty.toU8a(), hoprPolkadot.self.onChainKeyPair.publicKey), `Channel record should make it into the database and its db-key should lead to the AccountId of the counterparty.`);
        const counterpartysChannel = await _1.Channel.create(counterpartysHoprPolkadot, hoprPolkadot.self.publicKey, () => Promise.resolve(hoprPolkadot.api.createType('AccountId', hoprPolkadot.self.onChainKeyPair.publicKey)), signedChannel.channel.asFunded, () => Promise.resolve(signedChannelCounterparty));
        assert_1.default(await hoprPolkadot.channel.isOpen(hoprPolkadot, hoprPolkadot.api.createType('AccountId', counterpartysHoprPolkadot.self.onChainKeyPair.publicKey)), `Checks that party A considers the channel open.`);
        assert_1.default(await counterpartysHoprPolkadot.channel.isOpen(counterpartysHoprPolkadot, counterpartysHoprPolkadot.api.createType('AccountId', hoprPolkadot.self.onChainKeyPair.publicKey)), `Checks that party B considers the channel open.`);
        await channel.testAndSetNonce(new Uint8Array(1).fill(0xff)), `Should be able to set nonce.`;
        assert_1.default.rejects(() => channel.testAndSetNonce(new Uint8Array(1).fill(0xff)), `Should reject when trying to set nonce twice.`);
        assert_1.default(await counterpartysChannel.ticket.verify(counterpartysChannel, ticket));
    });
});
//# sourceMappingURL=index.spec.js.map
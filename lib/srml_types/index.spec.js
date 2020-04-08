"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const assert_1 = __importDefault(require("assert"));
const channel_1 = require("./channel");
const types_1 = require("@polkadot/types");
const base_1 = require("./base");
const bn_js_1 = __importDefault(require("bn.js"));
const crypto_1 = require("crypto");
const wasm_crypto_1 = require("@polkadot/wasm-crypto");
const keyring_1 = __importDefault(require("@polkadot/keyring"));
const secp256k1_1 = __importDefault(require("secp256k1"));
const signedChannel_1 = require("./signedChannel");
const PRIVATE_KEY_LENGTH = 32;
describe('check whether we can construct types', function () {
    const registry = new types_1.TypeRegistry();
    registry.register({
        Moment: base_1.Moment,
        Balance: base_1.Balance
    });
    it('should create a channel instance', function () {
        const balance = new bn_js_1.default(12345);
        const balance_a = new bn_js_1.default(1234);
        const channelBalance = channel_1.ChannelBalance.create(undefined, {
            balance,
            balance_a
        });
        assert_1.default(channelBalance.balance.eq(balance) && channelBalance.balance_a.eq(balance_a), 'Check that values are correctly set');
        const channelBalanceU8a = channelBalance.toU8a();
        const channelBalanceFromUint8Array = channel_1.ChannelBalance.create({
            bytes: channelBalanceU8a.buffer,
            offset: channelBalanceU8a.byteOffset
        });
        assert_1.default(channelBalanceFromUint8Array.balance.eq(balance) && channelBalanceFromUint8Array.balance_a.eq(balance_a), 'Check that values are correctly set');
        const fundedChannel = channel_1.Channel.createFunded({
            balance,
            balance_a
        });
        assert_1.default(fundedChannel.asFunded.balance.eq(balance) && fundedChannel.asFunded.balance_a.eq(balance_a), 'Check that values are correctly set');
        const fundedChannelWithChannelBalance = channel_1.Channel.createFunded(channelBalance);
        assert_1.default(fundedChannelWithChannelBalance.asFunded.balance.eq(balance) &&
            fundedChannelWithChannelBalance.asFunded.balance_a.eq(balance_a), 'Check that values are correctly set when using a channelBalane instance');
        const activeChannel = channel_1.Channel.createActive({
            balance,
            balance_a
        });
        assert_1.default(activeChannel.asActive.balance.eq(balance) && activeChannel.asActive.balance_a.eq(balance_a), 'Check that values are correctly set');
        const activeChannelWithChannelBalance = channel_1.Channel.createActive(channelBalance);
        assert_1.default(activeChannelWithChannelBalance.asActive.balance.eq(balance) &&
            activeChannelWithChannelBalance.asActive.balance_a.eq(balance_a), 'Check that values are correctly set when using a channelBalane instance');
        const pendingChannel = channel_1.Channel.createPending(new bn_js_1.default(1001), {
            balance,
            balance_a
        });
        assert_1.default(pendingChannel.asPendingSettlement[0].balance.eq(balance) &&
            pendingChannel.asPendingSettlement[0].balance_a.eq(balance_a), 'Check that values are correctly set');
        const pendingChannelWithMomentAndChannelBalance = channel_1.Channel.createPending(new base_1.Moment(registry, new bn_js_1.default(1001)), channelBalance);
        assert_1.default(pendingChannelWithMomentAndChannelBalance.asPendingSettlement[0].balance.eq(balance) &&
            pendingChannelWithMomentAndChannelBalance.asPendingSettlement[0].balance_a.eq(balance_a), 'Check that values are correctly set when using a channelBalane instance and a moment instance');
    });
    it('should generate a signedChannel', async function () {
        await wasm_crypto_1.waitReady();
        const generateNode = () => {
            const privateKey = crypto_1.randomBytes(PRIVATE_KEY_LENGTH);
            return {
                self: {
                    privateKey,
                    publicKey: secp256k1_1.default.publicKeyCreate(privateKey),
                    keyPair: new keyring_1.default({ type: 'sr25519' }).addFromSeed(privateKey, undefined, 'sr25519')
                }
            };
        };
        const [Alice, Bob] = [generateNode(), generateNode()];
        const channel = channel_1.Channel.createFunded({
            balance: new bn_js_1.default(12345),
            balance_a: new bn_js_1.default(123)
        });
        const arr = new Uint8Array(signedChannel_1.SignedChannel.SIZE);
        const signedChannel = await signedChannel_1.SignedChannel.create(Alice, {
            bytes: arr.buffer,
            offset: arr.byteOffset
        }, { channel });
        assert_1.default(await signedChannel.verify(Alice));
        const signedChannelNormal = await signedChannel_1.SignedChannel.create(Alice, undefined, { channel });
        const signedChannelWithExisting = await signedChannel_1.SignedChannel.create(Alice, {
            bytes: signedChannelNormal.buffer,
            offset: signedChannelNormal.byteOffset
        }, {
            channel
        });
        assert_1.default(await signedChannelWithExisting.verify(Alice));
    });
});
//# sourceMappingURL=index.spec.js.map
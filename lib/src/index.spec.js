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
const _1 = __importDefault(require("."));
const child_process_1 = require("child_process");
const fs_1 = require("fs");
const path_1 = require("path");
const util_crypto_1 = require("@polkadot/util-crypto");
const types_1 = require("@polkadot/types");
const srml_types_1 = require("./srml_types");
const Utils = __importStar(require("./utils"));
const levelup_1 = __importDefault(require("levelup"));
const memdown_1 = __importDefault(require("memdown"));
const chalk_1 = __importDefault(require("chalk"));
const config_1 = require("./config");
const TWENTY_MINUTES = 20 * 60 * 60 * 1000;
describe('Hopr Polkadot', async function () {
    const path = path_1.resolve(__dirname, config_1.polkadotBasepath);
    const target = 'debug';
    const binaryPath = path_1.resolve(path, `target/${target}`);
    let polkadotNode;
    let hoprAlice;
    let hoprBob;
    before(async () => {
        this.timeout(TWENTY_MINUTES);
        if (!fs_1.existsSync(path)) {
            throw Error(`Unable to find Polkadot runtime in '${path}'.`);
        }
        await buildSubstrateModule(path, target);
        await util_crypto_1.cryptoWaitReady();
    });
    beforeEach(async function () {
        this.timeout(TWENTY_MINUTES);
        await resetChain(binaryPath);
        polkadotNode = child_process_1.spawn('cargo', ['run', '--', '--dev', '--no-mdns', '--no-telemetry'], {
            stdio: 'inherit',
            cwd: path
        });
        await Utils.wait(14 * 1000);
        [hoprAlice, hoprBob] = await Promise.all([
            _1.default.create(levelup_1.default(memdown_1.default()), Utils.stringToU8a(config_1.DEMO_ACCOUNTS[0])),
            _1.default.create(levelup_1.default(memdown_1.default()), Utils.stringToU8a(config_1.DEMO_ACCOUNTS[1]))
        ]);
        await Promise.all([
            /* prettier-ignore */
            hoprAlice.start(),
            hoprBob.start()
        ]);
        const [first, second, third] = [await hoprAlice.nonce, await hoprAlice.nonce, await hoprAlice.nonce];
        await Promise.all([
            /* prettier-ignore */
            hoprAlice.initOnchainValues(first),
            hoprBob.initOnchainValues(),
            hoprAlice.api.tx.sudo
                .sudo(hoprAlice.api.tx.balances.setBalance(hoprAlice.self.keyPair.publicKey, hoprAlice.api.createType('Balance', 1234567), hoprAlice.api.createType('Balance', 0)))
                .signAndSend(hoprAlice.self.keyPair, { nonce: second }),
            hoprAlice.api.tx.sudo
                .sudo(hoprAlice.api.tx.balances.setBalance(hoprBob.self.keyPair.publicKey, hoprAlice.api.createType('Balance', 1234567), hoprAlice.api.createType('Balance', 0)))
                .signAndSend(hoprAlice.self.keyPair, { nonce: third })
        ]);
        await Utils.waitForNextBlock(hoprAlice.api);
        await Utils.waitForNextBlock(hoprAlice.api);
        assert_1.default.doesNotReject(Promise.all([
            /* prettier-ignore */
            checkOnChainValues(hoprAlice),
            checkOnChainValues(hoprBob)
        ]));
        assert_1.default.deepEqual(hoprBob.self.keyPair.publicKey.subarray(4, 32), (await hoprBob.api.query.hopr.states(hoprBob.api.createType('AccountId', hoprBob.self.keyPair.publicKey))).pubkey
            .toU8a()
            .subarray(0, 28), `check that the Bobs pubkey has made its way into the on-chain logic`);
        await hoprAlice.api.tx.balances
            .transfer(hoprAlice.api.createType('AccountId', hoprBob.self.keyPair.publicKey), hoprAlice.api.createType('Balance', 123).toU8a())
            .signAndSend(hoprAlice.self.keyPair, { nonce: await hoprAlice.nonce });
        console.log(`Alice's new balance '${chalk_1.default.green((await hoprAlice.api.query.balances.freeBalance(hoprAlice.self.keyPair.publicKey)).toString())}'`);
    });
    afterEach(() => {
        polkadotNode.kill();
        hoprAlice.stop();
        hoprBob.stop();
    });
    it('should connect', async function () {
        this.timeout(TWENTY_MINUTES);
        const balance = hoprAlice.api.createType('Balance', 12345);
        const channelEnum = types_1.createTypeUnsafe(hoprAlice.api.registry, 'Channel', [
            types_1.createTypeUnsafe(hoprAlice.api.registry, 'Funded', [
                types_1.createTypeUnsafe(hoprAlice.api.registry, 'ChannelBalance', [
                    {
                        balance,
                        balance_a: balance
                    }
                ])
            ])
        ]);
        console.log(chalk_1.default.green('Opening channel'));
        assert_1.default(await hoprAlice.utils.verify(channelEnum.toU8a(), await hoprBob.utils.sign(channelEnum.toU8a(), hoprBob.self.privateKey, hoprBob.self.publicKey), hoprBob.self.publicKey), `check that we got a valid signature over the channel state`);
        const channelOpener = await hoprAlice.channel.create(hoprAlice, hoprBob.self.publicKey, () => Promise.resolve(hoprAlice.api.createType('AccountId', hoprBob.self.keyPair.publicKey)), channelEnum.asFunded, async () => Promise.resolve(new srml_types_1.SignedChannel(undefined, {
            channel: channelEnum,
            signature: await hoprBob.utils.sign(channelEnum.toU8a(), hoprBob.self.privateKey, hoprBob.self.publicKey)
        })));
        console.log(chalk_1.default.green('channel opened'));
        const channelId = await Utils.getId(hoprAlice.api.createType('AccountId', hoprAlice.self.keyPair.publicKey), hoprAlice.api.createType('AccountId', hoprBob.self.keyPair.publicKey), hoprAlice.api);
        await Utils.waitForNextBlock(hoprAlice.api);
        let channel = await hoprAlice.api.query.hopr.channels(channelId);
        console.log(channel.asActive.toString());
        await channelOpener.initiateSettlement();
        await Utils.waitForNextBlock(hoprAlice.api);
        channel = await hoprAlice.api.query.hopr.channels(channelId);
        assert_1.default(channel.type == 'Uninitialized', `Channel should be empty`);
        console.log(`Channel '${channel.toString()}'`);
    });
});
function buildSubstrateModule(path, target = 'debug') {
    return new Promise((resolve, reject) => {
        const cargoBuild = child_process_1.spawn('cargo', target == 'debug' ? ['build'] : ['build', `--${target}`], {
            cwd: path,
            stdio: 'inherit'
        });
        cargoBuild.on('error', data => reject(data.toString()));
        cargoBuild.on('close', () => resolve());
    });
}
function resetChain(binaryPath) {
    return new Promise((resolve, reject) => {
        const purgeChain = child_process_1.spawn(`${binaryPath}/hopr-polkadot`, ['purge-chain', '--dev', '-y'], {
            cwd: binaryPath,
            stdio: 'inherit'
        });
        purgeChain.on('error', data => reject(data.toString()));
        purgeChain.on('close', () => resolve());
    });
}
async function checkOnChainValues(hoprPolkadot) {
    if (!Utils.u8aEquals(hoprPolkadot.self.keyPair.publicKey.subarray(4, 32), (await hoprPolkadot.api.query.hopr.states(hoprPolkadot.api.createType('AccountId', hoprPolkadot.self.keyPair.publicKey))).pubkey
        .toU8a()
        .subarray(0, 28))) {
        throw Error(`Local values and on-chain values does not match.`);
    }
}
//# sourceMappingURL=index.spec.js.map
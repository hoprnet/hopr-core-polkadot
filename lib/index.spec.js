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
const it_pipe_1 = __importDefault(require("it-pipe"));
const srml_types_1 = require("./srml_types");
const Utils = __importStar(require("./utils"));
const levelup_1 = __importDefault(require("levelup"));
const memdown_1 = __importDefault(require("memdown"));
const chalk_1 = __importDefault(require("chalk"));
const config_1 = require("./config");
const bn_js_1 = __importDefault(require("bn.js"));
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
        const [first, second] = [await hoprAlice.nonce, await hoprAlice.nonce];
        await Promise.all([
            /* prettier-ignore */
            hoprAlice.api.tx.sudo
                .sudo(hoprAlice.api.tx.balances.setBalance(hoprAlice.self.onChainKeyPair.publicKey, hoprAlice.api.createType('Balance', 1234567), hoprAlice.api.createType('Balance', 0)))
                .signAndSend(hoprAlice.self.onChainKeyPair, { nonce: first }),
            hoprAlice.api.tx.sudo
                .sudo(hoprAlice.api.tx.balances.setBalance(hoprBob.self.onChainKeyPair.publicKey, hoprAlice.api.createType('Balance', 1234567), hoprAlice.api.createType('Balance', 0)))
                .signAndSend(hoprAlice.self.onChainKeyPair, { nonce: second })
        ]);
        await Utils.waitForNextBlock(hoprAlice.api);
        assert_1.default.doesNotReject(Promise.all([
            /* prettier-ignore */
            checkOnChainValues(hoprAlice),
            checkOnChainValues(hoprBob)
        ]));
        assert_1.default.deepEqual(hoprBob.self.onChainKeyPair.publicKey.subarray(4, 32), (await hoprBob.api.query.hopr.states(hoprBob.api.createType('AccountId', hoprBob.self.onChainKeyPair.publicKey))).pubkey
            .toU8a()
            .subarray(0, 28), `check that the Bobs pubkey has made its way into the on-chain logic`);
        await hoprAlice.api.tx.balances
            .transfer(hoprAlice.api.createType('AccountId', hoprBob.self.onChainKeyPair.publicKey), hoprAlice.api.createType('Balance', 123).toU8a())
            .signAndSend(hoprAlice.self.onChainKeyPair, { nonce: await hoprAlice.nonce });
        console.log(`Alice's new balance '${chalk_1.default.green((await hoprAlice.api.query.balances.freeBalance(hoprAlice.self.onChainKeyPair.publicKey)).toString())}'`);
    });
    afterEach(async () => {
        polkadotNode.kill();
        await hoprAlice.stop();
        await hoprBob.stop();
    });
    it('should connect', async function () {
        this.timeout(TWENTY_MINUTES);
        const balance = {
            balance: new bn_js_1.default(12345),
            balance_a: new bn_js_1.default(123)
        };
        const channelEnum = srml_types_1.Channel.createFunded(balance);
        console.log(chalk_1.default.green('Opening channel'));
        assert_1.default(await (await srml_types_1.SignedChannel.create(hoprAlice, undefined, { channel: channelEnum })).verify(hoprAlice), `check that we got a valid signature over the channel state`);
        const channel = await hoprAlice.channel.create(hoprAlice, hoprBob.self.publicKey, () => Promise.resolve(hoprAlice.api.createType('AccountId', hoprBob.self.onChainKeyPair.publicKey)), channelEnum.asFunded, async () => {
            const result = await it_pipe_1.default([(await srml_types_1.SignedChannel.create(hoprAlice, undefined, { channel: channelEnum })).subarray()], hoprAlice.channel.handleOpeningRequest(hoprBob), async (source) => {
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
        console.log(chalk_1.default.green('channel opened'));
        const channelId = await Utils.getId(hoprAlice.api.createType('AccountId', hoprAlice.self.onChainKeyPair.publicKey), hoprAlice.api.createType('AccountId', hoprBob.self.onChainKeyPair.publicKey));
        await Utils.waitForNextBlock(hoprAlice.api);
        let onChainChannel = await hoprAlice.api.query.hopr.channels(channelId);
        assert_1.default(srml_types_1.Channel.createActive(balance).eq(onChainChannel), `Channel should be active on-chain.`);
        assert_1.default(await hoprAlice.channel.isOpen(hoprAlice, hoprAlice.api.createType('Hash', hoprBob.self.onChainKeyPair.publicKey)));
        assert_1.default(await hoprBob.channel.isOpen(hoprBob, hoprBob.api.createType('Hash', hoprAlice.self.onChainKeyPair.publicKey)));
        console.log(onChainChannel.toJSON());
        const ticket = await channel.ticket.create(channel, channel.coreConnector.api.createType('Balance', new bn_js_1.default(12)), channel.coreConnector.api.createType('Hash', new Uint8Array(32).fill(0x00)));
        console.log(chalk_1.default.green(`ticket`), ticket);
        assert_1.default(Utils.u8aEquals(await ticket.signer, hoprAlice.self.publicKey), `Signer and Alice's publickey must be the same.`);
        await channel.initiateSettlement();
        await Utils.waitForNextBlock(hoprAlice.api);
        onChainChannel = await hoprAlice.api.query.hopr.channels(channelId);
        assert_1.default(onChainChannel.type == 'Uninitialized', `Channel should be empty`);
        console.log(`Channel `, onChainChannel.toJSON());
        assert_1.default.rejects(() => hoprAlice.db.get(Buffer.from(hoprAlice.dbKeys.Channel(hoprAlice.api.createType('AccountId', hoprBob.self.onChainKeyPair.publicKey)))), `Check that database entry gets deleted.`);
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
    if (!Utils.u8aEquals(hoprPolkadot.self.onChainKeyPair.publicKey.subarray(4, 32), (await hoprPolkadot.api.query.hopr.states(hoprPolkadot.api.createType('AccountId', hoprPolkadot.self.onChainKeyPair.publicKey))).pubkey
        .toU8a()
        .subarray(0, 28))) {
        throw Error(`Local values and on-chain values does not match.`);
    }
}

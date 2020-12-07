import {
    calculateBonuses,
    findAndPrepEligibleReqsGivenMigrConstr,
    prepareForBonusDisbursalReq,
    updateDBWithBonuses
} from '../src/bonus-utils';
import BN from "bn.js";
import {DBClient, trackNewRequest} from "../src/db-utils";
import {REQ_STATUS} from "../src/constants";
import {DockNodeClient} from "../src/dock-node-utils";
import {getBlock, getBlockNo} from "@docknetwork/sdk/utils/chain-ops";

require('dotenv').config();

describe('Bonus utils', () => {
    // Will hold original values of env variables changed during test as they need to be restored after tests are done
    let sReal, vReal, startReal, ethBTimeReal;

    // For testing only, taken from https://stackoverflow.com/a/58326357
    const genRanHex = size => [...Array(size)].map(() => Math.floor(Math.random() * 16).toString(16)).join('');

    beforeAll(() => {
        sReal = process.env.SWAP_BONUS_POOL;
        vReal = process.env.VESTING_BONUS_POOL;
        startReal = process.env.MIGRATION_START_BLOCK_NO;
        ethBTimeReal = process.env.ETH_BLOCK_TIME;
    });

    function findInTestData(ethAddr, txnHash, testData) {
        // test data is small otherwise generate a map along with test data as well
        for (let req of testData) {
            if ((req.eth_address === ethAddr) && (req.eth_txn_hash === txnHash)) {
                return req
            }
        }
        throw new Error('Cannot find in test data');
    }

    function genTestData() {
        // Only some fields are relevant, eth_address, eth_txn_hash, erc20, is_vesting and bonuses
        return [
            {
                eth_address: genRanHex(40),
                eth_txn_hash: genRanHex(64),
                erc20: '10000000000000000000',  // 10 ERC-20
                is_vesting: true,
                eth_txn_block_no: '12',
                swap_bonus_tokens: '3324468',
                vesting_bonus_tokens: '6250000',
                total_vesting: '11250000',
                mainnet_address: '3AkJdiRsTjWp5PjJRVXgDhVAUhtgutckADgwHGQh7ZB1ANvs'
            },
            {
                eth_address: genRanHex(40),
                eth_txn_hash: genRanHex(64),
                erc20: '5000000000000000000',  // 5 ERC-20
                is_vesting: false,
                eth_txn_block_no: '15',
                swap_bonus_tokens: '1662234',
                vesting_bonus_tokens: '0',
                total_vesting: '0',
                mainnet_address: '37gWq4gGd5ZfE979HuiRve8RujUbwfLZ1dkeXwTzV7oyc1Gk'
            },
            {
                eth_address: genRanHex(40),
                eth_txn_hash: genRanHex(64),
                erc20: '35000000000000000000',  // 35 ERC-20
                is_vesting: false,
                eth_txn_block_no: '16',
                swap_bonus_tokens: '11635638',
                vesting_bonus_tokens: '0',
                total_vesting: '0',
                mainnet_address: '37VqDE8j8h2frnmprFKPioaLzaXZS2XxTKKu7F7zeknDFbAc'
            },
            {
                eth_address: genRanHex(40),
                eth_txn_hash: genRanHex(64),
                erc20: '50000000000000000000',  // 50 ERC-20
                is_vesting: true,
                eth_txn_block_no: '35',
                swap_bonus_tokens: '16622340',
                vesting_bonus_tokens: '31250000',
                total_vesting: '56250000',
                mainnet_address: '37iWizExBLPhxf2M6igyvuBncKLihaiM8r3ebnpX3AVFKDDP'
            },
            {
                eth_address: genRanHex(40),
                eth_txn_hash: genRanHex(64),
                erc20: '100000000000000000000',  // 100 ERC-20
                is_vesting: false,
                eth_txn_block_no: '50',
                swap_bonus_tokens: '33244680',
                vesting_bonus_tokens: '0',
                total_vesting: '0',
                mainnet_address: '37rKkpevvStBZhwfrd2GWVtQWprac3mBrr8v8RNNqqtoyVST'
            },
            {
                eth_address: genRanHex(40),
                eth_txn_hash: genRanHex(64),
                erc20: '25000000000000000000',  // 25 ERC-20
                is_vesting: true,
                eth_txn_block_no: '19',
                swap_bonus_tokens: '8311170',
                vesting_bonus_tokens: '15625000',
                total_vesting: '28125000',
                mainnet_address: '3AkJdiRsTjWp5PjJRVXgDhVAUhtgutckADgwHGQh7ZB1ANvs'
            },
            {
                eth_address: genRanHex(40),
                eth_txn_hash: genRanHex(64),
                erc20: '15000000000000000000',  // 15 ERC-20
                is_vesting: true,
                eth_txn_block_no: '87',
                swap_bonus_tokens: '4986702',
                vesting_bonus_tokens: '9375000',
                total_vesting: '16875000',
                mainnet_address: '37VqDE8j8h2frnmprFKPioaLzaXZS2XxTKKu7F7zeknDFbAc'
            },
            {
                eth_address: genRanHex(40),
                eth_txn_hash: genRanHex(64),
                erc20: '500000000000000000',  // 0.5 ERC-20
                is_vesting: false,
                eth_txn_block_no: '46',
                swap_bonus_tokens: '166223',
                vesting_bonus_tokens: '0',
                total_vesting: '0',
                mainnet_address: '3AkJdiRsTjWp5PjJRVXgDhVAUhtgutckADgwHGQh7ZB1ANvs'
            },
            {
                eth_address: genRanHex(40),
                eth_txn_hash: genRanHex(64),
                erc20: '100000000000000000',  // 0.1 ERC-20
                is_vesting: false,
                eth_txn_block_no: '46',
                swap_bonus_tokens: '33244',
                vesting_bonus_tokens: '0',
                total_vesting: '0',
                mainnet_address: '37gWq4gGd5ZfE979HuiRve8RujUbwfLZ1dkeXwTzV7oyc1Gk'
            },
            {
                eth_address: genRanHex(40),
                eth_txn_hash: genRanHex(64),
                erc20: '200000000000000000',  // 0.2 ERC-20
                is_vesting: false,
                eth_txn_block_no: '19',
                swap_bonus_tokens: '66489',
                vesting_bonus_tokens: '0',
                total_vesting: '0',
                mainnet_address: '37iWizExBLPhxf2M6igyvuBncKLihaiM8r3ebnpX3AVFKDDP'
            },
            {
                eth_address: genRanHex(40),
                eth_txn_hash: genRanHex(64),
                erc20: '60000000000000000000',  // 60 ERC-20
                is_vesting: true,
                eth_txn_block_no: '99',
                swap_bonus_tokens: '19946808',
                vesting_bonus_tokens: '37500000',
                total_vesting: '67500000',
                mainnet_address: '37gWq4gGd5ZfE979HuiRve8RujUbwfLZ1dkeXwTzV7oyc1Gk'
            },
        ];
    }

    test('Check bonus calculation and db insertion', async () => {
        // Swap and vesting bonuses are 100 tokens each
        process.env.SWAP_BONUS_POOL = '100000000';
        process.env.VESTING_BONUS_POOL = '100000000';

        const mockedDbRequests = genTestData();
        const [reqsWithBonus, totalTransferred, totalTransferredByVestingUsers, totalSwapBonus, totalVestingBonus] = calculateBonuses(JSON.parse(JSON.stringify(mockedDbRequests)));

        mockedDbRequests.forEach((req, i) => {
            expect(reqsWithBonus[i].swap_bonus_tokens.eq(new BN(req.swap_bonus_tokens))).toBe(true);
            expect(reqsWithBonus[i].vesting_bonus_tokens.eq(new BN(req.vesting_bonus_tokens))).toBe(true);
        });

        expect(totalTransferred.toString()).toBe('300800000');
        expect(totalTransferredByVestingUsers.toString()).toBe('160000000');
        expect(totalSwapBonus.toString()).toBe('99999996');
        expect(totalVestingBonus.toString()).toBe('100000000');

        const dbClient = new DBClient();
        await dbClient.start();

        // Insert rows so that they can be updated
        reqsWithBonus.forEach(async (r) => {
            await trackNewRequest(dbClient, r.mainnet_address, r.eth_address, r.eth_txn_hash, genRanHex(128), r.is_vesting);
        });

        await updateDBWithBonuses(dbClient, reqsWithBonus);

        let queries = [];
        reqsWithBonus.forEach(r => {
            const sql = `SELECT * FROM public.requests WHERE eth_address = '${r.eth_address}' AND eth_txn_hash = '${r.eth_txn_hash}'`;
            queries.push(dbClient.query(sql));
        });
        const results = (await Promise.all(queries)).map(r => r.rows[0]);

        results.forEach(r => expect(r.status).toBe(REQ_STATUS.BONUS_CALCULATED));

        results.forEach((res, i) => {
            const req = findInTestData(res.eth_address, res.eth_txn_hash, mockedDbRequests)
            expect(res.swap_bonus_tokens).toBe(req.swap_bonus_tokens);
            expect(res.vesting_bonus_tokens).toBe(req.vesting_bonus_tokens);
        });

        // Cleanup
        queries = [];
        reqsWithBonus.forEach(r => {
            const sql = `DELETE FROM public.requests WHERE eth_address = '${r.eth_address}' AND eth_txn_hash = '${r.eth_txn_hash}'`;
            queries.push(dbClient.query(sql));
        });
        await Promise.all(queries);
        await dbClient.stop();
    }, 30000);

    test('Check bonus disbursal', () => {
        // Swap and vesting bonuses are 100 tokens each
        process.env.SWAP_BONUS_POOL = '100000000';
        process.env.VESTING_BONUS_POOL = '100000000';
        process.env.MIGRATION_START_BLOCK_NO = '10';

        const mockedDbRequests = genTestData();

        expect(findAndPrepEligibleReqsGivenMigrConstr(JSON.parse(JSON.stringify(mockedDbRequests)), 100, new BN('10000000'))).toBe(0);
        expect(findAndPrepEligibleReqsGivenMigrConstr(JSON.parse(JSON.stringify(mockedDbRequests)), 100, new BN('20000000'))).toBe(0);

        let mockedReqsCopy = JSON.parse(JSON.stringify(mockedDbRequests));
        let selectedCount = findAndPrepEligibleReqsGivenMigrConstr(mockedReqsCopy, 100, new BN('1000000000'));
        expect(selectedCount).toBe(11);
        let selectedReqs = mockedReqsCopy.slice(0, selectedCount);
        let [swapBonusRecips, vestingBonusRecips] = prepareForBonusDisbursalReq(selectedReqs);

        expect(swapBonusRecips.length).toBe(11);
        expect(vestingBonusRecips.length).toBe(5);

        selectedReqs.forEach(req => {
            const testReq = findInTestData(req.eth_address, req.eth_txn_hash, mockedDbRequests)
            expect(req.vesting_bonus_tokens.toString()).toBe(testReq.total_vesting);
        });

        expect(vestingBonusRecips[0][1]).toBe('67500000');
        expect(vestingBonusRecips[0][2]).toBe(356);
        expect(vestingBonusRecips[1][1]).toBe('56250000');
        expect(vestingBonusRecips[1][2]).toBe(100);
        expect(vestingBonusRecips[2][1]).toBe('28125000');
        expect(vestingBonusRecips[2][2]).toBe(36);
        expect(vestingBonusRecips[3][1]).toBe('16875000');
        expect(vestingBonusRecips[3][2]).toBe(308);
        expect(vestingBonusRecips[4][1]).toBe('11250000');
        expect(vestingBonusRecips[4][2]).toBe(8);
    });

    test('Check bonus transfer', async () => {
        // Swap and vesting bonuses are 100 tokens each
        process.env.SWAP_BONUS_POOL = '100000000';
        process.env.VESTING_BONUS_POOL = '100000000';
        process.env.MIGRATION_START_BLOCK_NO = '10';

        const mockedDbRequests = genTestData();

        let selectedCount = findAndPrepEligibleReqsGivenMigrConstr(mockedDbRequests, 100, new BN('1000000000'));
        let selectedReqs = mockedDbRequests.slice(0, selectedCount);
        let [swapBonusRecips, vestingBonusRecips] = prepareForBonusDisbursalReq(selectedReqs);

        const dockNodeClient =  new DockNodeClient();
        await dockNodeClient.start();
        const blockHash = await dockNodeClient.giveBonuses(swapBonusRecips, vestingBonusRecips);
        const blockNo = getBlockNo(await getBlock(dockNodeClient.handle.api, blockHash));

        const address_1 = '3AkJdiRsTjWp5PjJRVXgDhVAUhtgutckADgwHGQh7ZB1ANvs';
        const bonus_1 = await dockNodeClient.getBonusFor(address_1);
        expect(bonus_1.swap_bonuses[bonus_1.swap_bonuses.length-1][1].toNumber()).toBe(blockNo + 144);
        expect(bonus_1.swap_bonuses[bonus_1.swap_bonuses.length-2][1].toNumber()).toBe(blockNo + 36);
        expect(bonus_1.swap_bonuses[bonus_1.swap_bonuses.length-3][1].toNumber()).toBe(blockNo + 8);
        expect(bonus_1.vesting_bonuses[bonus_1.vesting_bonuses.length-1][2].toNumber()).toBe(blockNo + 8);
        expect(bonus_1.vesting_bonuses[bonus_1.vesting_bonuses.length-2][2].toNumber()).toBe(blockNo + 36);

        const address_2 = '37gWq4gGd5ZfE979HuiRve8RujUbwfLZ1dkeXwTzV7oyc1Gk';
        const bonus_2 = await dockNodeClient.getBonusFor(address_2);
        expect(bonus_2.swap_bonuses[bonus_2.swap_bonuses.length-1][1].toNumber()).toBe(blockNo + 356);
        expect(bonus_2.swap_bonuses[bonus_2.swap_bonuses.length-2][1].toNumber()).toBe(blockNo + 144);
        expect(bonus_2.swap_bonuses[bonus_2.swap_bonuses.length-3][1].toNumber()).toBe(blockNo + 20);
        expect(bonus_2.vesting_bonuses[bonus_2.vesting_bonuses.length-1][2].toNumber()).toBe(blockNo + 356);

        const address_3 = '37VqDE8j8h2frnmprFKPioaLzaXZS2XxTKKu7F7zeknDFbAc';
        const bonus_3 = await dockNodeClient.getBonusFor(address_3);
        expect(bonus_3.swap_bonuses[bonus_3.swap_bonuses.length-1][1].toNumber()).toBe(blockNo + 308);
        expect(bonus_3.swap_bonuses[bonus_3.swap_bonuses.length-2][1].toNumber()).toBe(blockNo + 24);
        expect(bonus_3.vesting_bonuses[bonus_3.vesting_bonuses.length-1][2].toNumber()).toBe(blockNo + 308);

        const address_4 = '37iWizExBLPhxf2M6igyvuBncKLihaiM8r3ebnpX3AVFKDDP';
        const bonus_4 = await dockNodeClient.getBonusFor(address_4);
        expect(bonus_4.swap_bonuses[bonus_4.swap_bonuses.length-1][1].toNumber()).toBe(blockNo + 100);
        expect(bonus_4.swap_bonuses[bonus_4.swap_bonuses.length-2][1].toNumber()).toBe(blockNo + 36);
        expect(bonus_4.vesting_bonuses[bonus_4.vesting_bonuses.length-1][2].toNumber()).toBe(blockNo + 100);

        const address_5 = '37rKkpevvStBZhwfrd2GWVtQWprac3mBrr8v8RNNqqtoyVST';
        const bonus_5 = await dockNodeClient.getBonusFor(address_5);
        expect(bonus_5.swap_bonuses[bonus_5.swap_bonuses.length-1][1].toNumber()).toBe(blockNo + 160);

        await dockNodeClient.stop();
    }, 40000);

    afterAll(() => {
        process.env.SWAP_BONUS_POOL = sReal;
        process.env.VESTING_BONUS_POOL = vReal;
        process.env.MIGRATION_START_BLOCK_NO = startReal;
        process.env.ETH_BLOCK_TIME = ethBTimeReal;
    });
});
import {calculateBonuses, updateDBWithBonuses} from '../src/bonus-utils';
import BN from "bn.js";
import {DBClient, trackNewRequest} from "../src/db-utils";
import {REQ_STATUS} from "../src/constants";

require('dotenv').config();

describe('Bonus utils', () => {
    // Will hold original values of env variables changed during test as they need to be restored after tests are done
    let sReal, vReal;

    // For testing only, taken from https://stackoverflow.com/a/58326357
    const genRanHex = size => [...Array(size)].map(() => Math.floor(Math.random() * 16).toString(16)).join('');

    beforeAll(() => {
        sReal = process.env.SWAP_BONUS_POOL;
        vReal = process.env.VESTING_BONUS_POOL;
    });


    test('Check bonus calculation and db insertion', async () => {
        // Swap and vesting bonuses are 100 tokens each
        process.env.SWAP_BONUS_POOL = '100000000';
        process.env.VESTING_BONUS_POOL = '100000000';

        // Only 4 fields are relevant, eth_address, eth_txn_hash, erc20 and is_vesting
        const mockedDbRequests = [
            {
                eth_address: genRanHex(40),
                eth_txn_hash: genRanHex(64),
                erc20: '10000000000000000000',  // 10 ERC-20
                is_vesting: true,
            },
            {
                eth_address: genRanHex(40),
                eth_txn_hash: genRanHex(64),
                erc20: '5000000000000000000',  // 5 ERC-20
                is_vesting: false,
            },
            {
                eth_address: genRanHex(40),
                eth_txn_hash: genRanHex(64),
                erc20: '35000000000000000000',  // 35 ERC-20
                is_vesting: false,
            },
            {
                eth_address: genRanHex(40),
                eth_txn_hash: genRanHex(64),
                erc20: '50000000000000000000',  // 50 ERC-20
                is_vesting: true,
            },
            {
                eth_address: genRanHex(40),
                eth_txn_hash: genRanHex(64),
                erc20: '100000000000000000000',  // 100 ERC-20
                is_vesting: false,
            },
        ];

        const [reqsWithBonus, totalTransferred, totalTransferredByVestingUsers, totalSwapBonus, totalVestingBonus] = calculateBonuses(mockedDbRequests);

        expect(reqsWithBonus[0].swap_bonus_tokens.eq(new BN('5000000'))).toBe(true);
        expect(reqsWithBonus[0].vesting_bonus_tokens.eq(new BN('16666666'))).toBe(true);

        expect(reqsWithBonus[1].swap_bonus_tokens.eq(new BN('2500000'))).toBe(true);
        expect(reqsWithBonus[1].vesting_bonus_tokens.eq(new BN('0'))).toBe(true);

        expect(reqsWithBonus[2].swap_bonus_tokens.eq(new BN('17500000'))).toBe(true);
        expect(reqsWithBonus[2].vesting_bonus_tokens.eq(new BN('0'))).toBe(true);

        expect(reqsWithBonus[3].swap_bonus_tokens.eq(new BN('25000000'))).toBe(true);
        expect(reqsWithBonus[3].vesting_bonus_tokens.eq(new BN('83333333'))).toBe(true);

        expect(reqsWithBonus[4].swap_bonus_tokens.eq(new BN('50000000'))).toBe(true);
        expect(reqsWithBonus[4].vesting_bonus_tokens.eq(new BN('0'))).toBe(true);

        expect(totalTransferred.eq(new BN('200000000'))).toBe(true);
        expect(totalTransferredByVestingUsers.eq(new BN('60000000'))).toBe(true);
        expect(totalSwapBonus.eq(new BN('100000000'))).toBe(true);
        expect(totalVestingBonus.eq(new BN('99999999'))).toBe(true);

        const dbClient = new DBClient();
        await dbClient.start();

        // Insert rows so that they can be updated
        reqsWithBonus.forEach(async (r) => {
            await trackNewRequest(dbClient, '39QKJG54MzsG66GTjQwEwrZ6FEkXrEEVa4LsAt759UNrfYLm', r.eth_address, r.eth_txn_hash, genRanHex(128), r.is_vesting);
        });

        await updateDBWithBonuses(dbClient, reqsWithBonus);

        let queries = [];
        reqsWithBonus.forEach(r => {
            const sql = `SELECT * FROM public.requests WHERE eth_address = '${r.eth_address}' AND eth_txn_hash = '${r.eth_txn_hash}'`;
            queries.push(dbClient.query(sql));
        });
        const results = (await Promise.all(queries)).map(r => r.rows[0]);

        results.forEach(r => expect(r.status).toBe(REQ_STATUS.BONUS_CALCULATED));
        expect(results[0].swap_bonus_tokens).toBe('5000000');
        expect(results[0].vesting_bonus_tokens).toBe('16666666');
        expect(results[1].swap_bonus_tokens).toBe('2500000');
        expect(results[1].vesting_bonus_tokens).toBe('0');
        expect(results[2].swap_bonus_tokens).toBe('17500000');
        expect(results[2].vesting_bonus_tokens).toBe('0');
        expect(results[3].swap_bonus_tokens).toBe('25000000');
        expect(results[3].vesting_bonus_tokens).toBe('83333333');
        expect(results[4].swap_bonus_tokens).toBe('50000000');
        expect(results[4].vesting_bonus_tokens).toBe('0');

        // Cleanup
        queries = [];
        reqsWithBonus.forEach(r => {
            const sql = `DELETE FROM public.requests WHERE eth_address = '${r.eth_address}' AND eth_txn_hash = '${r.eth_txn_hash}'`;
            queries.push(dbClient.query(sql));
        });
        await Promise.all(queries);
        await dbClient.stop();
    }, 10000);

    afterAll(() => {
        process.env.SWAP_BONUS_POOL = sReal;
        process.env.VESTING_BONUS_POOL = vReal;
    });
});
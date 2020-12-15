import {DBClient, trackNewRequest, getPendingMigrationRequests} from '../src/db-utils';
import {REQ_STATUS, BLACKLISTED_ETH_ADDR} from '../src/constants';
import {genRanHex} from "./utils";

describe('DB interaction', () => {
    let dbClient;

    beforeAll(async (done) => {
        dbClient = new DBClient();
        await dbClient.start();
        done();
    }, 5000);

    test('Track request', async () => {
        const reqs0 = await getPendingMigrationRequests(dbClient);

        const addr = genRanHex(40);
        const hash = genRanHex(64);
        const r1 = await trackNewRequest(dbClient, '39QKJG54MzsG66GTjQwEwrZ6FEkXrEEVa4LsAt759UNrfYLm', addr, hash, genRanHex(128));
        // Inserted row has status valid
        expect(r1.status).toBe(REQ_STATUS.SIG_VALID);
        expect(r1.is_vesting).toBe(null);

        // Repeat address but not txn hash
        const r2 = await trackNewRequest(dbClient, '39QKJG54MzsG66GTjQwEwrZ6FEkXrEEVa4LsAt759UNrfYLm', genRanHex(40), genRanHex(64), genRanHex(128));
        // Inserted row has status valid
        expect(r2.status).toBe(REQ_STATUS.SIG_VALID);

        // Repeat both transaction hash and address
        await expect(trackNewRequest(dbClient, '39QKJG54MzsG66GTjQwEwrZ6FEkXrEEVa4LsAt759UNrfYLm', addr, hash, genRanHex(128)))
            .rejects
            .toThrow();

        const reqs1 = await getPendingMigrationRequests(dbClient);
        expect(reqs1.length - reqs0.length).toBe(2);

        const r3 = await trackNewRequest(dbClient, '39QKJG54MzsG66GTjQwEwrZ6FEkXrEEVa4LsAt759UNrfYLm', genRanHex(40), genRanHex(64), genRanHex(128), true);
        expect(r3.status).toBe(REQ_STATUS.SIG_VALID);
        expect(r3.is_vesting).toBe(true);

        const r4 = await trackNewRequest(dbClient, '39QKJG54MzsG66GTjQwEwrZ6FEkXrEEVa4LsAt759UNrfYLm', genRanHex(40), genRanHex(64), genRanHex(128), false);
        expect(r4.status).toBe(REQ_STATUS.SIG_VALID);
        expect(r4.is_vesting).toBe(false);

        const reqs2 = await getPendingMigrationRequests(dbClient);
        expect(reqs2.length - reqs1.length).toBe(2);
    });

    test('Track blacklisted request', async () => {
        // Take a blacklisted address
        const blacklistedAddress = BLACKLISTED_ETH_ADDR[0];
        const r = await trackNewRequest(dbClient, '39QKJG54MzsG66GTjQwEwrZ6FEkXrEEVa4LsAt759UNrfYLm', blacklistedAddress, genRanHex(64), genRanHex(128));
        // Inserted row has status invalid
        expect(r.status).toBe(REQ_STATUS.INVALID_BLACKLIST);

    });

    afterAll(async (done) => {
        await dbClient.stop();
        done();
    }, 5000);
});
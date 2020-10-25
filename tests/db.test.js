import {DBClient, trackNewRequest, getPendingMigrationRequests} from '../src/db-utils';
import {REQ_STATUS, BLACKLISTED_ETH_ADDR} from '../src/constants';

describe('DB interaction', () => {
    let dbClient;

    // For testing only, taken from https://stackoverflow.com/a/58326357
    const genRanHex = size => [...Array(size)].map(() => Math.floor(Math.random() * 16).toString(16)).join('');

    beforeAll(async (done) => {
        dbClient = new DBClient();
        await dbClient.start();
        done();
    }, 5000);

    test('Track request', async () => {
        const reqs_0 = await getPendingMigrationRequests(dbClient);

        const addr = genRanHex(40);
        const hash = genRanHex(64);
        const r1 = await trackNewRequest(dbClient, '39QKJG54MzsG66GTjQwEwrZ6FEkXrEEVa4LsAt759UNrfYLm', addr, hash, genRanHex(128));
        // Inserted row has status valid
        expect(r1.status).toBe(REQ_STATUS.SIG_VALID);

        // Repeat address but not txn hash
        const r2 = await trackNewRequest(dbClient, '39QKJG54MzsG66GTjQwEwrZ6FEkXrEEVa4LsAt759UNrfYLm', genRanHex(40), genRanHex(64), genRanHex(128));
        // Inserted row has status valid
        expect(r2.status).toBe(REQ_STATUS.SIG_VALID);

        // Repeat both transaction hash and address
        await expect(trackNewRequest(dbClient, '39QKJG54MzsG66GTjQwEwrZ6FEkXrEEVa4LsAt759UNrfYLm', addr, hash, genRanHex(128)))
            .rejects
            .toThrow();

        const reqs_1 = await getPendingMigrationRequests(dbClient);
        expect(reqs_1.length - reqs_0.length).toBeGreaterThanOrEqual(2);
    });

    test('Track blacklisted request', async () => {
        // Take a blaclkisted address
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
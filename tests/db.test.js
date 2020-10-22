import {DBClient, trackNewRequest, getPendingMigrationRequests} from '../src/db-utils';

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
        const addr = genRanHex(40);
        const hash = genRanHex(64);
        const r1 = await trackNewRequest(dbClient, '39QKJG54MzsG66GTjQwEwrZ6FEkXrEEVa4LsAt759UNrfYLm', addr, hash, genRanHex(128));
        // Inserted row has status 0
        expect(r1.status).toBe(0);

        // Repeat address but not txn hash
        const r2 = await trackNewRequest(dbClient, '39QKJG54MzsG66GTjQwEwrZ6FEkXrEEVa4LsAt759UNrfYLm', genRanHex(40), genRanHex(64), genRanHex(128));
        // Inserted row has status 0
        expect(r2.status).toBe(0);

        // Repeat both transaction hash and address
        await expect(trackNewRequest(dbClient, '39QKJG54MzsG66GTjQwEwrZ6FEkXrEEVa4LsAt759UNrfYLm', addr, hash, genRanHex(128)))
            .rejects
            .toThrow();

        const reqs = await getPendingMigrationRequests(dbClient);
        expect(reqs.length).toBeGreaterThanOrEqual(2);
        console.log(reqs);
    });

    afterAll(async (done) => {
        await dbClient.stop();
        done();
    }, 5000);
});
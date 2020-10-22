import {DockNodeClient} from "../src/dock-node-utils";

require('dotenv').config();

describe('Node interaction', () => {
    let nodeClient;

    beforeAll(async (done) => {
        nodeClient = new DockNodeClient();
        await nodeClient.start();
        done();
    }, 5000);

    test('Query migrator', async () => {
        const [allowed, ] = await nodeClient.getMigratorDetails();
        expect(allowed).toBeGreaterThan(0);
    }, 10000);

    test('Migrate', async () => {
        const blockHash = await nodeClient.migrate([['36ioxyZDmuM51qAujXytqxgSQV7M7v82X2qAhf2jYmChV8oN', 100]]);
        console.log(blockHash);
        // expect(allowed).toBeGreaterThan(0);
    }, 10000);

    afterAll(async (done) => {
        await nodeClient.stop();
        done();
    }, 5000);
});

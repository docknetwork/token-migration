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
        await nodeClient.migrate([['36ioxyZDmuM51qAujXytqxgSQV7M7v82X2qAhf2jYmChV8oN', 100]]);
    }, 20000);

    test('Give bonus', async () => {
        const b1 = await nodeClient.giveBonuses([['3AkJdiRsTjWp5PjJRVXgDhVAUhtgutckADgwHGQh7ZB1ANvs', 200, 5]], [['37gWq4gGd5ZfE979HuiRve8RujUbwfLZ1dkeXwTzV7oyc1Gk', 500, 10]]);
        expect(b1).toBeTruthy();
        const b2 = await nodeClient.giveBonuses([], [['37gWq4gGd5ZfE979HuiRve8RujUbwfLZ1dkeXwTzV7oyc1Gk', 100, 2]]);
        expect(b2).toBeTruthy();
        const b3 = await nodeClient.giveBonuses([['3AkJdiRsTjWp5PjJRVXgDhVAUhtgutckADgwHGQh7ZB1ANvs', 100, 6]], []);
        expect(b3).toBeTruthy();
    }, 30000);

    afterAll(async (done) => {
        await nodeClient.stop();
        done();
    }, 5000);
});

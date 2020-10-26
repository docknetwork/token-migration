import {DBClient} from "../src/db-utils";
import {getNewWeb3MainnetClient} from "../src/eth-txn-utils";
import {processPendingRequests} from "../src/migrations";
import {DockNodeClient} from "../src/dock-node-utils";

describe('Migration testing', () => {
    let web3Client, dbClient, dockNodeClient;

    beforeAll( async (done) => {
        dbClient = new DBClient();
        await dbClient.start();
        dockNodeClient = new DockNodeClient();
        await dockNodeClient.start();
        web3Client = getNewWeb3MainnetClient();
        done();
    }, 10000);

    test('Check pending request', async () => {
        await processPendingRequests(dbClient, web3Client, dockNodeClient);
        // TODO:
    }, 40000)

    // TODO: add more tests using local web3 client with Ganache
    afterAll( async (done) => {
        await dbClient.stop();
        await dockNodeClient.stop();
        done();
    }, 5000);
});

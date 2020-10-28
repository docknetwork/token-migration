import {DBClient} from "../src/db-utils";
import {getNewWeb3MainnetClient, getNewWeb3TestClient} from "../src/eth-txn-utils";
import {processPendingRequests} from "../src/migrations";
import {DockNodeClient} from "../src/dock-node-utils";

describe('Migration testing', () => {
    const testAdminAddr = '0x81915d9d312e6fae52340a466f252c4ef111a012';
    const testAdminPrivKey = '5a9f39f83bbeb09acb8b3b2973d7855390fb82045f708e4095815c0a8fd9ccb9';

    let web3Client, dbClient, dockNodeClient;

    beforeAll( async (done) => {
        dbClient = new DBClient();
        await dbClient.start();
        dockNodeClient = new DockNodeClient();
        await dockNodeClient.start();
        // web3Client = getNewWeb3MainnetClient();
        web3Client = getNewWeb3TestClient();
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

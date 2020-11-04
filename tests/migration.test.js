import {DBClient} from "../src/db-utils";
import {getNewWeb3TestClient} from "../src/eth-txn-utils";
import {erc20ToInitialMigrationTokens, fromERC20ToDockTokens, processPendingRequests} from "../src/migrations";
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

    test('Convert ERC-20 to mainnet tokens', () => {
        expect(fromERC20ToDockTokens("9194775499990000000000").toString()).toBe("9194775499");
        expect(fromERC20ToDockTokens("19023932499990000000000").toString()).toBe("19023932499");
        expect(fromERC20ToDockTokens("5351643000000000000000").toString()).toBe("5351643000");
        expect(fromERC20ToDockTokens("1654000000000000000000").toString()).toBe("1654000000");
        expect(fromERC20ToDockTokens("6525911238000000000000").toString()).toBe("6525911238");
        expect(fromERC20ToDockTokens("46277679625000000000000").toString()).toBe("46277679625");
        expect(fromERC20ToDockTokens("37500000000000000000000").toString()).toBe("37500000000");
        expect(fromERC20ToDockTokens("84000000000000000000").toString()).toBe("84000000");
    });

    test('From ERC-20 to initial migration tokens', () => {
        expect(erc20ToInitialMigrationTokens("9194775499990000000000", null).toString()).toBe("9194775499");
        expect(erc20ToInitialMigrationTokens("9194775499990000000000", false).toString()).toBe("9194775499");
        expect(erc20ToInitialMigrationTokens("9194775499990000000000", true).toString()).toBe("4597387749");

        expect(erc20ToInitialMigrationTokens("19023932499990000000000", null).toString()).toBe("19023932499");
        expect(erc20ToInitialMigrationTokens("19023932499990000000000", false).toString()).toBe("19023932499");
        expect(erc20ToInitialMigrationTokens("19023932499990000000000", true).toString()).toBe("9511966249");

        expect(erc20ToInitialMigrationTokens("5351643000000000000000", null).toString()).toBe("5351643000");
        expect(erc20ToInitialMigrationTokens("5351643000000000000000", false).toString()).toBe("5351643000");
        expect(erc20ToInitialMigrationTokens("5351643000000000000000", true).toString()).toBe("2675821500");

        expect(erc20ToInitialMigrationTokens("1654000000000000000000", null).toString()).toBe("1654000000");
        expect(erc20ToInitialMigrationTokens("1654000000000000000000", false).toString()).toBe("1654000000");
        expect(erc20ToInitialMigrationTokens("1654000000000000000000", true).toString()).toBe("827000000");

        expect(erc20ToInitialMigrationTokens("6525911238000000000000", null).toString()).toBe("6525911238");
        expect(erc20ToInitialMigrationTokens("6525911238000000000000", false).toString()).toBe("6525911238");
        expect(erc20ToInitialMigrationTokens("6525911238000000000000", true).toString()).toBe("3262955619");
    });

    // TODO: add more tests using local web3 client with Ganache
    afterAll( async (done) => {
        await dbClient.stop();
        await dockNodeClient.stop();
        done();
    }, 5000);
});

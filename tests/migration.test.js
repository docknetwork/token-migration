import {erc20ToInitialMigrationTokens, fromERC20ToDockTokens, getVestingAmountFromMigratedTokens, isValidTransferFrom, getTokenSplit} from "../src/migrations";
import {getNewWeb3MainnetClient, getTransactionAsDockERC20TransferToVault} from "../src/eth-txn-utils";

describe('Migration testing', () => {
    let vaultReal;

    beforeAll(() => {
        // Mock address will be vaulted. Keeping this value to switch back to original value.
        vaultReal = process.env.DOCK_ERC_20_VAULT_ADDR;
    });

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

    test('From ERC-20 to vesting tokens', () => {
        expect(getVestingAmountFromMigratedTokens("9194775499990000000000").toString()).toBe("4597387750");
        expect(getVestingAmountFromMigratedTokens("19023932499990000000000").toString()).toBe("9511966250");
        expect(getVestingAmountFromMigratedTokens("5351643000000000000000").toString()).toBe("2675821500");
        expect(getVestingAmountFromMigratedTokens("1654000000000000000000").toString()).toBe("827000000");
        expect(getVestingAmountFromMigratedTokens("6525911238000000000000").toString()).toBe("3262955619");
    })

    test('Valid transfers from certain address', async () => {
        // Mock vault address
        process.env.DOCK_ERC_20_VAULT_ADDR = '0x1062a747393198f70f71ec65a582423dba7e5ab3';

        const web3Client = getNewWeb3MainnetClient();

        // Transfer made by address 0x1b2c4352fa9fb5567c49ac78ceb7209d23f6632e
        const txnHash1 = '0x51279a0b8b7f18610dd2dc60b36430fa54f4de12219612f894e9fd0dbd495174';
        const transfer1 = await getTransactionAsDockERC20TransferToVault(web3Client, txnHash1);
        expect(isValidTransferFrom(transfer1, '1b2c4352fa9fb5567c49ac78ceb7209d23f6632e')).toBe(true);

        // Transfer not made by address 0x1b2c4352fa9fb5567c49ac78ceb7209d23f6632e
        const txnHash2 = '0x8eb1f8f5ec864ee638a160958b153bfdd84519e8edaa413d27420ab89ca299f5';
        const transfer2 = await getTransactionAsDockERC20TransferToVault(web3Client, txnHash2);
        expect(isValidTransferFrom(transfer2, '1b2c4352fa9fb5567c49ac78ceb7209d23f6632e')).toBe(false);
    });

    test('Token split', () => {
        const [i1, l1] = getTokenSplit({erc20: '9194775499990000000000'}, true);
        expect(i1).toBe('4.5973 kDCK');
        expect(l1).toBe('4.5973 kDCK');

        const [i2, l2] = getTokenSplit({erc20: '9194775499990000000000'}, false);
        expect(i2).toBe('9.1947 kDCK');
        expect(l2).toBe('0');

        const [i3, l3] = getTokenSplit({erc20: '6525911238000000000000'}, true);
        expect(i3).toBe('3.2629 kDCK');
        expect(l3).toBe('3.2629 kDCK');

        const [i4, l4] = getTokenSplit({erc20: '6525911238000000000000'}, false);
        expect(i4).toBe('6.5259 kDCK');
        expect(l4).toBe('0');
    });

    afterAll(() => {
        process.env.DOCK_ERC_20_VAULT_ADDR = vaultReal;
    });
});

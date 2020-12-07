import {erc20ToInitialMigrationTokens, fromERC20ToDockTokens, getVestingAmountFromMigratedTokens} from "../src/migrations";

describe('Migration testing', () => {

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
});

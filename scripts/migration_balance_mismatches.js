const { DockAPI } = require("@docknetwork/sdk")
const { asDockAddress } = require("@docknetwork/sdk/utils/codec.js")
const { DBClient } = require("../src/db-utils")
const { BN } = require("bn.js")

require('dotenv').config();
const { NETWORK, DOCKNET_ADDR, SUDO_ADDR } = require("./common/consts.js")

const OTHER_SPECIAL_ACCOUNTS = (() => {
    let specialAccs = new Set();
    specialAccs.add(SUDO_ADDR);
    return specialAccs
})();



async function main() {
    const dockClient = new DockAPI();
    await dockClient.init({ address: DOCKNET_ADDR });
    const specialAccounts = await fetchSpecialAccounts(dockClient);
    const chainAccounts = await fetchChainAccounts(dockClient, specialAccounts);

    const dbClient = new DBClient();
    try {
        await dbClient.start();
    } catch (e) {
        console.error(`failed connecting to the database: ${e}`)
        process.exit(1)
    }
    const dbTotals = await loadDbTotals(dbClient);



    const mismatchedBalances = findMismatchedBalances(chainAccounts, dbTotals);
    console.log(mismatchedBalances)

    await dbClient.stop();
    await dockClient.disconnect();
}
main()

async function fetchChainAccounts(dockClient, specialAccounts) {
    const accounts = await dockClient.api.query.system.account.entries();
    // reduce because we want to index results by addr
    return accounts.reduce((indexed, [accountId, accountInfo]) => {
        const addrBytes = accountId._args[0]
        const addrStr = asDockAddress(addrBytes, NETWORK)

        if (specialAccounts.has(addrStr)) { return indexed }

        const balance = accountInfo.data.free // type BN
        return { ...indexed, [addrStr]: { balance } }
    }, {})
}

async function loadDbTotals(dbClient) {
    const sql = "SELECT mainnet_address, SUM(CAST(coalesce(migration_tokens, '0') AS bigint)) AS db_total FROM requests GROUP BY mainnet_address"
    const values = [];

    let res;
    try {
        res = await dbClient.query(sql, values)
    } catch (e) {
        console.error(`ERROR: message: ${e.message}, detail: ${e.detail}`)
    }

    return res.rows.reduce((indexed, row) => {
        // don't include if balance is zero
        if (row.db_total == 0) return indexed
        // else include
        return { ...indexed, [row.mainnet_address]: { db_total: new BN(row.db_total) } }
    }, {})
}

function findMismatchedBalances(chainAccounts, dbTotals) {
    // use reduce: because not each row gets mapped to a result
    const dbMismatches = Object.entries(dbTotals).reduce(
        ({ missing_chain_accounts, chain_accounts_with_balance_diff_from_db }, [addr, { db_total }]) => {
            const chain_account = chainAccounts[addr];

            // report accounts that don't exist on-chain yet
            if (!chain_account) {
                missing_chain_accounts = { ...missing_chain_accounts, [addr]: `db_total: ${db_total.toString()}` }
                return { missing_chain_accounts, chain_accounts_with_balance_diff_from_db }
            }

            // if balance match, don't include in results
            const chain_balance = chain_account.balance;
            if (db_total.eq(chain_balance)) {
                return { missing_chain_accounts, chain_accounts_with_balance_diff_from_db }
            }
            // else report balance mismatch
            chain_accounts_with_balance_diff_from_db = { ...chain_accounts_with_balance_diff_from_db, [addr]: `db_total: ${db_total.toString()}, chain_balance: ${chain_balance.toString()}` }
            return { missing_chain_accounts, chain_accounts_with_balance_diff_from_db }
        }, {})

    // find chain accounts that were never given a balance
    const chainMismatches = Object.entries(chainAccounts).reduce(({ chain_balances_not_from_migration }, [addr, { balance }]) => {
        const db_account = dbTotals[addr];

        // report accounts missing from db
        if (!db_account) {
            chain_balances_not_from_migration = { ...chain_balances_not_from_migration, [addr]: `chain_balance: ${balance.toString()}` }
            return { chain_balances_not_from_migration }
        }

        return { chain_balances_not_from_migration }
    }, {})

    return { ...dbMismatches, ...chainMismatches }
}

async function fetchSpecialAccounts(dockClient) {
    const validatorAccountIds = await dockClient.api.query.poAModule.activeValidators();
    const validatorAddrs = validatorAccountIds.map((val) => {
        return asDockAddress(val, NETWORK)
    })

    let specialAccounts = new Set(validatorAddrs);
    OTHER_SPECIAL_ACCOUNTS.forEach(ac => specialAccounts.add(ac))

    return specialAccounts
}
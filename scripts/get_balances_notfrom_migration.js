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
    await dbClient.start();
    const dbTotals = await loadDbTotals(dbClient);


    const mismatchedBalances = findMismatchedBalances(chainAccounts, dbTotals);
    // console.log({ mismatchedBalances })

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
        return { ...indexed, [addrStr]: balance }
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

    return res.rows.map(row => ({ ...row, db_total: new BN(row.db_total) }))
}

function findMismatchedBalances(chainAccounts, dbTotals) {
    // reduce because number of outputs != number of inputs. Not all return results
    const mismatchedBalances = dbTotals.reduce((resMap, mtot) => {
        const dockAddr = mtot.mainnet_address;
        const dbTotal = mtot.db_total;
        const onchain_account = chainAccounts[dockAddr];

        if (!onchain_account) { return resMap }
        const onchain_tokens = onchain_account.balance;

        // if match don't include in results
        if (db_migration_tokens == onchain_tokens) {
            return resMap
        }
        // else include in results
        return { ...resMap, [dockAddr]: { db_total, onchain_tokens } }
    }, {});
    return mismatchedBalances
}

async function fetchSpecialAccounts(dockClient) {
    const validatorAccountIds = await dockClient.api.query.poAModule.activeValidators();
    const validatorAddrs = validatorAccountIds.map((val) => {
        const addrStr = asDockAddress(val, NETWORK)
        return addrStr
    })

    let specialAccounts = new Set(validatorAddrs);
    OTHER_SPECIAL_ACCOUNTS.forEach(ac => specialAccounts.add(ac))

    return specialAccounts
}
const { DockAPI } = require("@docknetwork/sdk")
const { asDockAddress } = require("@docknetwork/sdk/utils/codec.js")
const { DBClient } = require("../src/db-utils")
require('dotenv').config();


const NETWORK = (() => {
    const _NETWORKS = {
        'testing_migration': 'test',
        '___REPLACE_WITH_PROD_DBNAME': 'main' // REPLACE WITH PROD DB NAME
    }
    return _NETWORKS[process.env.DB_NAME] || 'test'
})();
const DOCKNET_ADDR = (() => {
    const _ADDRS = {
        'test': "wss://danforth-1.dock.io/",
        'main': "wss://mainnet-node.dock.io/",
    }
    return _ADDRS[NETWORK] || _ADDRS['test']
})();
const SUDO = (() => {
    const _SUDO_ADDRS = {
        'test': '5CFfPovgr1iLJ4fekiTPmtGMyg7XGmLxUnTvd1Y4GigwPqzH',
        'main': '3HqoTXW3HBQJoFpvRaAaJoNsWTBZs3CuGRqT9xxfv497k8fs'
    }
    return _SUDO_ADDRS[NETWORK] || _SUDO_ADDRS['test']
})();


async function main() {
    const dockClient = new DockAPI();
    await dockClient.init({ address: DOCKNET_ADDR });
    const chainAccounts = await fetchChainAccounts(dockClient);

    const dbClient = new DBClient();
    await dbClient.start();
    const dbTotals = await loadDbTotals(dbClient);

    const specialAccounts = await fetchSpecialAccounts(dockClient);

    const mismatchedBalances = findMismatchedBalances(chainAccounts, dbTotals, specialAccounts);
    console.log({ mismatchedBalances })

    await dbClient.stop();
    await dockClient.disconnect();
}
main()

async function fetchChainAccounts(dockClient) {
    const accounts = await dockClient.api.query.system.account.entries();
    // reduce because we want to index results by addr
    return accounts.reduce((obj, [accountId, accountInfo]) => {
        const addrBytes = accountId._args[0]
        const addrStr = asDockAddress(addrBytes, NETWORK)
        const balance = BigInt(accountInfo.data.free.toString())
        return { ...obj, [addrStr]: balance }
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

    return res.rows.map(row => ({ ...row, db_total: BigInt(row.db_total) }))
}

function findMismatchedBalances(chainAccounts, dbTotals, specialAccounts) {
    // reduce because number of outputs != number of inputs. Not all return results
    const mismatchedBalances = dbTotals.reduce((resMap, mtot) => {
        const dockAddr = mtot.mainnet_address;
        const dbTotal = mtot.db_total;
        const onchain_account = chainAccounts[dockAddr];

        // filter special accounts
        if (!specialAccounts[dockAddr]) { return resMap } // TODO no SUDO

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
    const specialAccounts = validatorAddrs.concat(SUDO)
    return specialAccounts
}
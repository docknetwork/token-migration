const { DBClient } = require("../src/db-utils")
const fetch = require('node-fetch');

require('dotenv').config();
const { VAULT_ADDR, ERC20_CONTRACT } = require("./common/consts.js")



async function main() {
    const dbClient = new DBClient();
    await dbClient.start();

    const vaultTxs = await fetchVaultTxs()

    const dbRequests = await loadDbRequests(dbClient);

    const unclaimedMigrs = findUnclaimedMigrations(vaultTxs, dbRequests);
    console.log({ unclaimedMigrs, nb_unclaimed: Object.keys(unclaimedMigrs).length })


    await dbClient.stop();
}
main()

async function fetchVaultTxs(pageNo = 1) {
    try {
        const res = await fetch(`https://api.etherscan.io/api?module=account&action=tokentx&contractaddress=${ERC20_CONTRACT}&address=${VAULT_ADDR}&page=${pageNo}&offset=1000&sort=asc&apikey=${process.env.ETHERSCAN_API_KEY}`)
        const parsed = await res.json();
        if (parsed.status != 1) {
            throw new Error(`err response: ${JSON.stringify(parsed)}`)
        }
        let results = parsed.result || [];

        const isFetchNextPage = results.length == 1000;
        if (isFetchNextPage) {
            // quick work-around for 5req/s rate-limiting: 1 sec delay every 5 requests
            if (pageNo % 5 == 0) { await new Promise(resolve => setTimeout(resolve, 1100)); }

            let next_results = await fetchVaultTxs(pageNo + 1)
            results.push(...next_results)
        }

        return results
    } catch (e) {
        console.error(`failed fetching vault transactions: ${e}`)
        process.exit(1)
    }
}

async function loadDbRequests(dbClient) {
    const sql = "SELECT eth_txn_hash FROM requests"
    const values = [];

    let res;
    try {
        res = await dbClient.query(sql, values)
    } catch (e) {
        console.error(`ERROR: message: ${e.message}, detail: ${e.detail}`)
    }

    // index rows and return
    return res.rows.reduce((indexed, row) => ({ ...indexed, [row.eth_txn_hash]: true }), {})
}

function findUnclaimedMigrations(vaultTxs, dbRequests) {
    const res = vaultTxs.reduce((unclaimed, tx) => {
        // if present in dbRequests, do not include in result
        if (dbRequests[tx.hash]) {
            return unclaimed
        }
        // else include in result
        return { ...unclaimed, [tx.hash]: tx }
    }, {})
    return res
}
const { DBClient } = require("../src/db-utils")
const fetch = require('node-fetch');

require('dotenv').config();
const { get_VAULT_ADDR, get_ERC20_CONTRACT } = require("./common/consts.js")



async function main() {
    const dbClient = new DBClient();
    try {
        await dbClient.start();
    } catch (e) {
        console.error(`failed connecting to the database: ${e}`)
        process.exit(1)
    }

    const vaultTxs = await fetchVaultTxs()

    const dbRequests = await loadDbRequests(dbClient);

    const unclaimedMigrs = findUnclaimedMigrations(vaultTxs, dbRequests);
    console.log({ unclaimedMigrs, nb_unclaimed: Object.keys(unclaimedMigrs).length })

    await dbClient.stop();
}
main()

async function fetchVaultTxs(pageNo = 1) {
    try {
        const res = await fetch(`https://api.etherscan.io/api?module=account&action=tokentx&contractaddress=${get_ERC20_CONTRACT()}&address=${get_VAULT_ADDR()}&page=${pageNo}&offset=1000&sort=asc&apikey=${process.env.ETHERSCAN_API_KEY}`)
        const parsed = await res.json();
        if (parsed.status != 1) {
            throw new Error(`err response: ${JSON.stringify(parsed)}`)
        }
        let results = parsed.result || [];

        const isFetchNextPage = results.length == 1000;
        if (isFetchNextPage) {
            // quick work-around for 5req/s rate-limiting: 1 sec delay every 5 requests
            if (pageNo % 5 == 1) { await new Promise(resolve => setTimeout(resolve, 1100)); }

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
    const sql = "SELECT eth_address, eth_txn_hash FROM requests WHERE status > -1" // status -1 is for invalid requests e.g. wrong signature
    const values = [];

    try {
        const res = await dbClient.query(sql, values)
        // index rows and return
        return res.rows.reduce((set, row) => {
            const db_id = `0x${row.eth_address};0x${row.eth_txn_hash}`
            set.add(db_id)
            return set
        }, new Set())
    } catch (e) {
        console.error(`ERROR: message: ${e.message}, detail: ${e.detail}`)
        process.exit(1)
    }
}

function findUnclaimedMigrations(vaultTxs, dbRequests) {
    const res = vaultTxs.reduce((unclaimed, vaultTx) => {
        const tx_db_id = `${vaultTx.from};${vaultTx.hash}`

        // if present in dbRequests, do not include in result
        if (dbRequests.has(tx_db_id)) {
            return unclaimed
        }
        // else include in result
        const { blockNumber, timeStamp, hash, blockHash, from, to, value } = vaultTx
        const txSummary = { blockNumber, timeStamp, hash, blockHash, from, to, value }
        return { ...unclaimed, [tx_db_id]: { ...txSummary } }
    }, {})
    return res
}
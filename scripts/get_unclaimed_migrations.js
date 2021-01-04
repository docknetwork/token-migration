const { asDockAddress } = require("@docknetwork/sdk/utils/codec.js")
const { DBClient } = require("../src/db-utils")
const fetch = require('node-fetch');

require('dotenv').config();
const { VAULT_ADDR, ERC20_CONTRACT } = require("./common/consts.js")



async function main() {
    const dbClient = new DBClient();
    await dbClient.start();

    const vaultTxs = await fetchEthERC20DockVaultTxs()
    // txs.map(tx => {
    //     // console.log({ tx })
    //     // console.log({ hash: tx.hash })
    //     if (tx.hash == '0xc82d4b28e5b224d73efaf515e963d5c5eeeee831f88749cfcadbd1674c27836d') { console.log("FOUND !") }
    // })

    const dbRequests = await loadDbRequests(dbClient);

    const unclaimedMigrs = findUnclaimedMigrations(vaultTxs, dbRequests);
    console.log({ unclaimedMigrs })


    await dbClient.stop();
}
main()

async function fetchEthERC20DockVaultTxs() {
    let res;
    try {
        res = await fetch(`https://api.etherscan.io/api?module=account&action=tokentx&contractaddress=${ERC20_CONTRACT}&address=${VAULT_ADDR}&page=1&offset=1000&sort=asc&apikey=${process.env.ETHERSCAN_API_KEY}`)
    } catch (e) {
        console.error(`failed fetching vault transactions`)
    }

    const parsed = await res.json();
    if (parsed.status != 1) {
        console.error(`failed fetching vault transactions.Response: ${JSON.stringify(parsed)}`)
    }
    const results = parsed.result || [];
    return results
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
const { asDockAddress } = require("@docknetwork/sdk/utils/codec.js")
const { DBClient } = require("../src/db-utils")
const fetch = require('node-fetch');
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
const VAULT_ADDR = '0x0cf75f808479c9e7d61c78f65e997b605160b0aa';
const ERC20_CONTRACT = '0xe5dada80aa6477e85d09747f2842f7993d0df71c';
// const ETHSCAN_API_KEY = process.env.ETHERSCAN_API_KEY;
// console.log({ ETHSCAN_API_KEY })
const VAULT_CREATION_HASH = '0xcc1ac05bcdcadeb50086f30e34b093dcfde6b156a9622b9faea83a3b73726b11';


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
        // res = await fetch(`https://api.etherscan.io/api?module=account&action=txlist&address=${DOCK_ERC_20_VAULT_ADDR}&startblock=0&endblock=99999999&sort=asc&apikey=${process.env.ETHERSCAN_API_KEY}`)
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
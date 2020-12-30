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
console.log({ DB_name: process.env.DB_NAME, NETWORK, DOCKNET_ADDR });


async function main() {
    const dockClient = new DockAPI();
    await dockClient.init({ address: DOCKNET_ADDR });
    const allAccounts = await getAllAccounts(dockClient);


    const db_client = new DBClient();
    await db_client.start();
    const dbRequests = await getDBRequests(db_client);

    // reduce because number of outputs != number of inputs. Not all return results
    const mismatched_accounts = dbRequests.reduce((obj, req) => {
        const dockAddr = req.mainnet_address;
        const db_migration_tokens = req.migration_tokens;
        const onchain_account = allAccounts[dockAddr];
        // console.log({ dockAddr, onchain_account })
        if (!onchain_account) { return obj }
        const onchain_tokens = onchain_account.balance.toNumber();

        // console.log({ db_migration_tokens, onchain_tokens })

        // if match don't include in results
        if (db_migration_tokens == onchain_tokens) {
            return obj
        }
        // else include in results
        return { ...obj, [dockAddr]: { dockAddr, db_migration_tokens, onchain_tokens } }
    }, {});
    console.log({ mismatched_accounts })

    await db_client.stop();
    await dockClient.disconnect();
}
main()

async function getAllAccounts(dockClient) {
    const accounts = await dockClient.api.query.system.account.entries();
    // use reduce because we want the result as an indexed map rather than an array
    return accounts.reduce((obj, [accountId, accountInfo]) => {
        const addrBytes = accountId._args[0]
        const addrStr = asDockAddress(addrBytes, NETWORK)
        const balance = accountInfo.data.free
        return { ...obj, [addrStr]: { addr: addrStr, balance } }
    }, {})

    // const dockAddr = asDockAddress(acc1[0]._args[0])
    // console.log(asDockAddress(acc1[0]._args[0]), NETWORK)
    // console.log(acc1[1].data.free.toNumber())

    // accountsList.forEach((account, index) => {
    //     console.log({ account })
    //     console.log({ index })
    // })
    // let accountsMapped = accountsDoubleMap.reduce(async (mapProm, account) => {
    //     const map = await mapProm
    //     const addrBytes = account[0]._args[0];
    //     const addr = asDockAddress(addrBytes);
    //     const balance = await getAccountBalance(dockClient, addr);
    //     return { ...map, [addr]: { addr, balance } }
    // }, {})
    // return accountsMapped
}

// async function getAccountBalance(dockClient, accAddr) {
//     let { data: { free: previousFree }, nonce: previousNonce } = await dockClient.api.query.system.account(accAddr);
//     // console.log(`${accAddr} has a balance of ${previousFree}, nonce ${previousNonce}`);
//     return { free: previousFree, nonce: previousNonce }
// }

async function getDBRequests(db_client) {
    const sql = 'SELECT * FROM public.requests';
    const values = [];

    let res;
    try {
        res = await db_client.query(sql, values)
    } catch (e) {
        console.error(`ERROR: message: ${e.message}, detail: ${e.detail}`)
    }

    return res.rows
}
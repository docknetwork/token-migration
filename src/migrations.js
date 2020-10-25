// Check if any pending requests and try to do migration
import {getPendingMigrationRequests, markRequestInvalid, markRequestParsed} from "./db-utils";
import {getTransactionAsDockERC20TransferToVault} from './eth-txn-utils'
import {REQ_STATUS} from "./constants";
import {toHexWithPrefix} from "./util";

export async function processPendingRequests(dbClient, web3Client) {

    // XXX: An optimization regarding txn confirmation can be to fetch current block number (`web3.eth.getBlockNumber`) only once
    const migrations = [];
    const requests = await getPendingMigrationRequests(dbClient);
    const reqByStatus = requests.reduce(function (grp, r) {
        (grp[r.status] = grp[r.status] || []).push(r);
        return grp;
    }, {});


    const txns = await Promise.allSettled(reqByStatus[REQ_STATUS.SIG_VALID].map((r) => getTransactionAsDockERC20TransferToVault(web3Client, toHexWithPrefix(r.eth_txn_hash))));
    console.log(txns);
    
    const failed = [];
    // XXX: Optimization No need to insert in DB after each change in req status, it can be done till at the end
    const pendingForDB = {};
    reqByStatus[REQ_STATUS.SIG_VALID].forEach((req, index) => {
        console.log(index);
        if (txns[index].status === "rejected") {
            failed.push(markRequestInvalid(dbClient, req.eth_address, req.eth_txn_hash))
        } else {
            req.status = REQ_STATUS.TXN_PARSED;
            req.erc20 = txns[index].value.value;
            pendingForDB[[req.eth_address, req.eth_txn_hash]] = req;
        }
    });

    await Promise.all(failed);

    const currentBlockNumber = await web3Client.eth.getBlockNumber();

    // TODO: Check confirmation of pendingForDB and reqByStatus[REQ_STATUS.TXN_CONFIRMED] with `isTxnConfirmedAsOf`

    const [allowedMigrations, balance] = dbClient.getMigratorDetails();

    // TODO: Send migration
}
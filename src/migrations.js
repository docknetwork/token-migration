// Check if any pending requests and try to do migration
import {
    getPendingMigrationRequests, markRequestConfirmed,
    markRequestDone,
    markRequestInvalid,
    markRequestParsed,
    markRequestParsedAndConfirmed
} from "./db-utils";
import {fromERC20ToDockTokens, getTransactionAsDockERC20TransferToVault, isTxnConfirmedAsOf} from './eth-txn-utils'
import {REQ_STATUS} from "./constants";
import {toHexWithPrefix} from "./util";

// Attempt to migrate requests which are confirmed
export async function migrateConfirmedRequests(web3Client, dockNodeClient, dbReqs, allowedMigrations, balanceAsBn) {
    // For reqs as confirmed txns, send migration request immediately
    // Try to send migration for maximum amount, sort in descending order.
    const confirmed = dbReqs.map((r) => {
        const n = r;
        n.erc20 = new web3Client.utils.BN(n.erc20);
        return n;
    })
    confirmed.sort(function(a, b) {
        if (a.erc20.lt(b.erc20)) {
            return 1;
        } else if (b.erc20.lt(a.erc20)) {
            return -1;
        }
        return 0;
    });

    // Find out which and how many reqs will be migrated
    let accum = new web3Client.utils.BN("0");
    let selected = 0;
    while (selected < confirmed.length) {
        if (selected >= allowedMigrations) {
            break;
        }
        // Mainnet balance is intentionally computed just before migration is being done as the mainnet balance can
        // include time-dependent bonus and only till the bonus pool is not empty.
        const mainnetBal = fromERC20ToDockTokens(web3Client, confirmed[selected].erc20);
        const temp = accum.add(mainnetBal);
        if (balanceAsBn.gte(temp)) {
            // Sufficient balance to transfer as there is no fee for migrations
            confirmed[selected].mainnetBal = mainnetBal;
            accum = temp;
            selected++;
        } else {
            break;
        }
    }

    if (selected === 0) {
        throw new Error('Could not migrate any request. This is either due to insufficient balance or cap on the allowed migration');
    }

    if (selected < confirmed.length) {
        console.warn(`${confirmed.length - selected} confirmed requests could not be migrated`);
    }

    // Do the migration. Migration is atomic, either all reqs are migrated or none.
    const recipients = confirmed.slice(0, selected).map((r) => [r.mainnet_address, r.mainnetBal.toString()]);
    const blockHash = await dockNodeClient.migrate(recipients);

    console.info(`Migrated ${recipients.length} requests in block ${blockHash}`);

    const migrated = [];
    confirmed.slice(0, selected).forEach((req, index) => {
        const m = req;
        m.mainnet_tokens = recipients[index][1];
        migrated.push(m);
    });
    return [blockHash, migrated, accum]
}

// Post migration, update requests in DB
async function updateMigratedRequestsInDb(dbClient, blockHash, migrated) {
    // Update DB
    const dbReqPromises = [];
    migrated.forEach((req) => {
        dbReqPromises.push(markRequestDone(dbClient, req.eth_address, req.eth_txn_hash, blockHash, req.mainnet_tokens));
    });
    await Promise.all(dbReqPromises);
}

export async function processPendingRequests(dbClient, web3Client, dockNodeClient) {
    const requests = await getPendingMigrationRequests(dbClient);
    const reqByStatus = requests.reduce(function (grp, r) {
        (grp[r.status] = grp[r.status] || []).push(r);
        return grp;
    }, {});

    // Get number of allowed migration and migrator's balance
    let [allowedMigrations, balance] = await dockNodeClient.getMigratorDetails();
    // Convert balance to BigNumber as ERC-20 balance is used a big BigNumber
    let balanceAsBn = balance.toBn();

    // Attempt to migrate requests with already confirmed txns. Any confirmed reqs not migrated will not be touched during this
    // entire loop as they might have too much balance.
    if (reqByStatus[REQ_STATUS.TXN_CONFIRMED] && (reqByStatus[REQ_STATUS.TXN_CONFIRMED].length > 0)) {
        try {
            const [blockHash, migrated, balanceUsedInMigration] = await migrateConfirmedRequests(web3Client, dockNodeClient, reqByStatus[REQ_STATUS.TXN_CONFIRMED], allowedMigrations, balanceAsBn);
            // Update remaining balance and allowed confirmedReqs
            balanceAsBn = balanceAsBn.sub(balanceUsedInMigration);
            allowedMigrations -= migrated.length;
            // Update status in DB
            await updateMigratedRequestsInDb(dbClient, blockHash, migrated);
        } catch (e) {
            console.error(`Migration attempt of confirmed requests failed with error ${e}`)
        }
    }

    const reqsWithValidSig = reqByStatus[REQ_STATUS.SIG_VALID] || [];
    const reqsWithValidTxn = reqByStatus[REQ_STATUS.TXN_PARSED] || [];

    // Fetch transactions for unconfirmed requests which are valid ERC-20 transfers to the Vault address
    const unconfirmedReqs = (reqsWithValidSig).concat(reqsWithValidTxn);
    const txns = await Promise.allSettled(unconfirmedReqs.map((r) => getTransactionAsDockERC20TransferToVault(web3Client, toHexWithPrefix(r.eth_txn_hash))));
    // console.log(txns);

    // Need current block number for checking confirmation
    const currentBlockNumber = await web3Client.eth.getBlockNumber();

    // XXX: Optimization Can insert in DB after reconciling post migration

    // Tracks reqs which are confirmed
    const confirmedReqs = [];

    // Tracks reqs which are not yet confirmed
    const dbWritesForUnconfirmedReqs = [];

    // Parse and check if any valid requests are confirmed and can be sent for migration
    reqsWithValidSig.forEach((req, index) => {
        if (txns[index].status === "rejected") {
            dbWritesForUnconfirmedReqs.push(markRequestInvalid(dbClient, req.eth_address, req.eth_txn_hash))
        } else {
            const txn = txns[index].value;
            if (isTxnConfirmedAsOf(txn, currentBlockNumber)) {
                req.status = REQ_STATUS.TXN_CONFIRMED;
                req.erc20 = txn.value;
                // Note: Don't compute mainnet balance due to potential time dependent bonus.
                confirmedReqs.push(req);
                dbWritesForUnconfirmedReqs.push(markRequestParsedAndConfirmed(dbClient, req.eth_address, req.eth_txn_hash, txn.value));
            } else {
                dbWritesForUnconfirmedReqs.push(markRequestParsed(dbClient, req.eth_address, req.eth_txn_hash, txn.value))
            }
        }
    });

    // Check if any parsed requests are confirmed and can be sent for migration
    const txnListOffset = reqsWithValidSig.length;
    reqsWithValidTxn.forEach((req, index) => {
        if (isTxnConfirmedAsOf(txns[txnListOffset + index], currentBlockNumber)) {
            req.status = REQ_STATUS.TXN_CONFIRMED;
            confirmedReqs.push(req);
            dbWritesForUnconfirmedReqs.push(markRequestConfirmed(dbClient, req.eth_address, req.eth_txn_hash))
        }
    });

    // Update DB with status and erc-20 bal
    await Promise.all(dbWritesForUnconfirmedReqs);

    if (confirmedReqs.length > 0) {
        // Note: If the migrator's address is used outside of this code then there is a chance that value of `allowedMigrations` won't be
        // correct between now and previous invocation of `migrateConfirmedRequests` in this function
        const [blockHash, migrated, ] = await migrateConfirmedRequests(web3Client, dockNodeClient, confirmedReqs, allowedMigrations, balanceAsBn);
        await updateMigratedRequestsInDb(dbClient, blockHash, migrated);
    }
}
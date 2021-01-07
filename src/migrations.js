// Check if any pending requests and try to do migration
import {
    getPendingMigrationRequests,
    markInitialMigrationDone,
    markRequestConfirmed,
    markRequestInvalid,
    markRequestParsed,
    markRequestParsedAndConfirmed
} from "./db-utils";
import {getTransactionAsDockERC20TransferToVault, isTxnConfirmedAsOf} from './eth-txn-utils'
import {REQ_STATUS} from "./constants";
import {addPrefixToHex, removePrefixFromHex} from "./util";
import BN from 'bn.js';
import {alarmMigratorIfNeeded, sendLargeReqAlarmEmail, sendMigrationFailEmail} from "./email-utils";
import {logBadTxn, logMigrationWarning} from './log';
import {formatBalance} from '@polkadot/util';


const ERC20Factor = new BN('1000000000000');

/**
 * Takes ERC-20 amount (as smallest unit) as a string and return mainnet amount as BN
 * @param amountInERC20
 * @returns {BN}
 */
export function fromERC20ToDockTokens(amountInERC20) {
    const ercBN = new BN(amountInERC20);
    // Dock mainnet has 6 decimal places, ERC-20 has 18
    // Note: Loses some precision in case of less than 12 "0" least significant digits
    return ercBN.div(ERC20Factor)
}

/**
 * Takes ERC-20 amount (as smallest unit) that was migrated and returns the contribution to vesting bonus.
 * @param amountInERC20
 * @returns {BN}
 */
export function getVestingAmountFromMigratedTokens(amountInERC20) {
    const dockTokens = fromERC20ToDockTokens(amountInERC20);
    // take ceil of half of the amount
    if (dockTokens.isEven()) {
        return dockTokens.shrn(1);
    } else {
        return dockTokens.shrn(1).addn(1);
    }
}

/**
 * Takes ERC-20 amount (as smallest unit) as a string and return mainnet amount as BN. Considers whether vesting or not.
 In the case where vesting does not apply or is not opted, the amount is returned as it is else the amount is halved
 followed by flooring in case amount was odd
 * @param amountInERC20
 * @param isVesting
 * @returns {BN}
 */
export function erc20ToInitialMigrationTokens(amountInERC20, isVesting) {
    const dockTokens = fromERC20ToDockTokens(amountInERC20);
    if (isVesting === true) {
        // If vesting, take the floor after dividing by 2
        return dockTokens.shrn(1);
    } else {
        return dockTokens;
    }
}

/**
 * Format given balance as 6 decimal digit number and add symbol `k` and `M` for kilo and Mega respectively.
 * @param balance
 * @returns {string}
 */
export function formatBal(balance) {
    return formatBalance(balance, { withSi: true, decimals: 6, withUnit: 'DCK'})
}

/**
 * Split tokens into initial migration amount and amount for vesting
 * @param req
 * @param isVesting
 * @returns {(string|string)[]}
 */
export function getTokenSplit(req, isVesting) {
    const initial = erc20ToInitialMigrationTokens(req.erc20, isVesting);
    return [formatBal(initial), isVesting ? formatBal(getVestingAmountFromMigratedTokens(req.erc20)) : '0'];
}

export function getVestingMessageForUnMigrated(req) {
    const [initial, later] = getTokenSplit(req, true);
    return `You will receive ${initial} soon and the remaining ${later} will be given along with a bonus as part of vesting.`;
}

export function getVestingMessageForMigrated(req) {
    const [initial, later] = getTokenSplit(req, true);
    return `You have been given ${initial} and the remaining ${later} will be given along with a bonus as part of vesting.`;
}

/**
 * Attempt to migrate requests which are confirmed
 * @param dockNodeClient
 * @param dbReqs
 * @param allowedMigrations
 * @param balance
 * @returns {Promise<(*|[]|BN)[]>}
 */
export async function migrateConfirmedRequests(dockNodeClient, dbReqs, allowedMigrations, balance) {
    // For reqs as confirmed txns, send migration request immediately
    const confirmed = dbReqs.map((r) => {
        const n = r;
        // Calculate tokens to be given now, i.e. before bonus
        n.migration_tokens = erc20ToInitialMigrationTokens(n.erc20, n.is_vesting);
        return n;
    });
    // Try to send migration for maximum requests, sort in increasing order.
    confirmed.sort(function(a, b) {
        if (a.migration_tokens.lt(b.migration_tokens)) {
            return -1;
        } else if (b.migration_tokens.lt(a.migration_tokens)) {
            return 1;
        }
        return 0;
    });

    // Find out which and how many reqs will be migrated
    let accum = new BN("0");
    let selected = 0;
    while (selected < confirmed.length) {
        if (selected >= allowedMigrations) {
            break;
        }
        const temp = accum.add(confirmed[selected].migration_tokens);
        if (balance.gte(temp)) {
            accum = temp;
            selected++;
        } else {
            break;
        }
    }

    if (selected === 0) {
        await sendLargeReqAlarmEmail();
        throw new Error('Could not migrate any request. This is either due to insufficient balance or cap on the allowed migration');
    }

    if (selected < confirmed.length) {
        logMigrationWarning(`${confirmed.length - selected} confirmed requests could not be migrated`);
        await sendLargeReqAlarmEmail();
    }

    // Do the migration. Migration is atomic, either all reqs are migrated or none.
    const recipients = confirmed.slice(0, selected).map((r) => [r.mainnet_address, r.migration_tokens.toString()]);
    const blockHash = await dockNodeClient.migrate(recipients);

    console.info(`Migrated ${recipients.length} requests in block ${blockHash}`);

    const migrated = [];
    confirmed.slice(0, selected).forEach((req) => {
        const m = req;
        m.mainnet_tokens = req.migration_tokens.toString();
        migrated.push(m);
    });
    return [blockHash, migrated, accum]
}

/**
 * Post initial migration, update requests in DB
 * @param dbClient
 * @param blockHash
 * @param migrated
 * @returns {Promise<void>}
 */
async function updateMigratedRequestsInDb(dbClient, blockHash, migrated) {
    const hash = removePrefixFromHex(blockHash);
    // Update DB
    const dbReqPromises = [];
    migrated.forEach((req) => {
        dbReqPromises.push(markInitialMigrationDone(dbClient, req.eth_address, req.eth_txn_hash, hash, req.mainnet_tokens));
    });
    await Promise.all(dbReqPromises);
}

/**
 * Returns true if its a valid transfer from given Eth address
 * @param txn
 * @param ethAddr
 * @returns {boolean}
 */
export function isValidTransferFrom(txn, ethAddr) {
    return !((txn.status === "rejected") || (removePrefixFromHex(txn.from).toLowerCase() !== ethAddr))
}

/**
 * Process any pending migration requests, includes all (confirmed and unconfirmed) valid requests
 * @param dbClient
 * @param web3Client
 * @param dockNodeClient
 * @returns {Promise<void>}
 */
export async function processPendingRequests(dbClient, web3Client, dockNodeClient) {
    const requests = await getPendingMigrationRequests(dbClient);
    // Group requests by status
    const reqByStatus = requests.reduce(function (grp, r) {
        (grp[r.status] = grp[r.status] || []).push(r);
        return grp;
    }, {});

    // Get number of allowed migration and migrator's balance
    let [allowedMigrations, balance] = await dockNodeClient.getMigratorDetails();
    // Convert balance to BigNumber as ERC-20 balance is used a big BigNumber
    let balanceAsBn = balance.toBn();

    await alarmMigratorIfNeeded(allowedMigrations, balanceAsBn);

    // Attempt to migrate requests with already confirmed txns. Any confirmed reqs not migrated will not be touched during the
    // current execution of this function as they might have too much balance.
    if (reqByStatus[REQ_STATUS.TXN_CONFIRMED] && (reqByStatus[REQ_STATUS.TXN_CONFIRMED].length > 0)) {
        console.info(`Found ${reqByStatus[REQ_STATUS.TXN_CONFIRMED].length} confirmed requests. Trying to migrate now`);
        try {
            const [blockHash, migrated, balanceUsedInMigration] = await migrateConfirmedRequests(dockNodeClient, reqByStatus[REQ_STATUS.TXN_CONFIRMED], allowedMigrations, balanceAsBn);
            // Update remaining balance and allowed migrations
            balanceAsBn = balanceAsBn.sub(balanceUsedInMigration);
            allowedMigrations -= migrated.length;
            // Update status in DB
            await updateMigratedRequestsInDb(dbClient, blockHash, migrated);
        } catch (e) {
            logMigrationWarning(`Migration attempt of confirmed requests failed with error ${e}`);
            await sendMigrationFailEmail();
        }
    }

    const reqsWithValidSig = reqByStatus[REQ_STATUS.SIG_VALID] || [];
    const reqsWithValidTxn = reqByStatus[REQ_STATUS.TXN_PARSED] || [];

    console.info(`Found ${reqsWithValidSig.length + reqsWithValidTxn.length} unconfirmed requests. Parse and check for confirmation.`);

    // Fetch transactions for unconfirmed requests which are valid ERC-20 transfers to the Vault address
    const unconfirmedReqs = (reqsWithValidSig).concat(reqsWithValidTxn);
    const txns = await Promise.allSettled(unconfirmedReqs.map((r) => getTransactionAsDockERC20TransferToVault(web3Client, addPrefixToHex(r.eth_txn_hash))));

    // Need current block number for checking confirmation
    const currentBlockNumber = await web3Client.eth.getBlockNumber();

    // XXX: Optimization Can insert in DB after reconciling post migration

    // Tracks reqs which are confirmed
    const confirmedReqs = [];

    // Tracks reqs which are not yet migrated
    const dbWritesForUnMigratedReqs = [];

    // Parse and check if any valid requests are confirmed and can be sent for migration
    reqsWithValidSig.forEach((req, index) => {
        const txn = txns[index].value;
        if (txns[index].status === 'fulfilled' && isValidTransferFrom(txn, req.eth_address)) {
            if (isTxnConfirmedAsOf(txn, currentBlockNumber)) {
                req.status = REQ_STATUS.TXN_CONFIRMED;
                req.erc20 = txn.value;
                // Note: Don't compute mainnet balance due to potential time dependent bonus.
                confirmedReqs.push(req);
                dbWritesForUnMigratedReqs.push(markRequestParsedAndConfirmed(dbClient, req.eth_address, req.eth_txn_hash, txn.value, txn.blockNumber));
            } else {
                dbWritesForUnMigratedReqs.push(markRequestParsed(dbClient, req.eth_address, req.eth_txn_hash, txn.value));
            }
        } else {
            logBadTxn('Transaction was either not found, or was rejected by the network or was not a token transfer to the Vault', req.eth_address, txns[index]);
            dbWritesForUnMigratedReqs.push(markRequestInvalid(dbClient, req.eth_address, req.eth_txn_hash))
        }
    });

    console.info(`Parsed ${reqsWithValidSig.length} requests, ${confirmedReqs.length} were confirmed`);

    // Check if any parsed requests are confirmed and can be sent for migration
    const txnListOffset = reqsWithValidSig.length;
    reqsWithValidTxn.forEach((req, index) => {
        const txn = txns[txnListOffset + index].value;
        if (isTxnConfirmedAsOf(txn, currentBlockNumber)) {
            req.status = REQ_STATUS.TXN_CONFIRMED;
            confirmedReqs.push(req);
            dbWritesForUnMigratedReqs.push(markRequestConfirmed(dbClient, req.eth_address, req.eth_txn_hash, txn.blockNumber))
        }
    });

    console.info(`Checked ${reqsWithValidTxn.length} already parsed requests, total ${confirmedReqs.length} confirmed now`);

    // Update DB with status and erc-20 bal
    await Promise.all(dbWritesForUnMigratedReqs);

    console.info(`Updating ${dbWritesForUnMigratedReqs.length} requests in DB before migration`)

    if (confirmedReqs.length > 0) {
        try {
            // Note: If the migrator's address is used outside of this code then there is a chance that value of `allowedMigrations` won't be
            // correct between now and previous invocation of `migrateConfirmedRequests` in this function
            const [blockHash, migrated, ] = await migrateConfirmedRequests(dockNodeClient, confirmedReqs, allowedMigrations, balanceAsBn);
            await updateMigratedRequestsInDb(dbClient, blockHash, migrated);
        } catch (e) {
            logMigrationWarning(`Migration attempt of confirmed requests failed with error ${e}`);
            await sendMigrationFailEmail();
        }
    }
}

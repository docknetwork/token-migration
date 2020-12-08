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
import {MIGRATION_SUPPORT_MSG, REQ_STATUS, MICRO_DOCK} from "./constants";
import {addPrefixToHex, removePrefixFromHex} from "./util";
import BN from 'bn.js';
import {alarmMigratorIfNeeded} from "./email-utils";

/**
 * Takes ERC-20 amount (as smallest unit) as a string and return mainnet amount as BN
 * @param amountInERC20
 * @returns {BN}
 */
export function fromERC20ToDockTokens(amountInERC20) {
    const ercBN = new BN(amountInERC20);
    // Dock mainnet has 6 decimal places, ERC-20 has 18
    // Note: Loses some precision in case of less than 12 "0" least significant digits
    return ercBN.div(new BN('1000000000000'))
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

function getTokenSplit(req, isVesting) {
    const initial = erc20ToInitialMigrationTokens(req.erc20, isVesting);
    return [initial.toString()+MICRO_DOCK, isVesting ? getVestingAmountFromMigratedTokens(req.erc20).toString()+MICRO_DOCK : '0'];
}

function getVestingMessageForUnMigrated(req) {
    const [initial, later] = getTokenSplit(req, true);
    return `You will be given ${initial} soon and the remaining ${later} will be given along with a bonus as part of vesting`;
}

function getVestingMessageForMigrated(req) {
    const [initial, later] = getTokenSplit(req, true);
    return `You have been given ${initial} and the remaining ${later} will be given along with a bonus as part of vesting`;
}

export function prepareReqStatusForApiResp(req) {
    const details = {
        status: req.status
    };

    if (req.status === REQ_STATUS.INVALID_BLACKLIST) {
        details.messages = [`Migration request has been received but the sender address is blacklisted. ${MIGRATION_SUPPORT_MSG}`];
        return details;
    }

    if (req.status === REQ_STATUS.INVALID) {
        details.messages = [`Migration request has been received but the request is invalid. It maybe due to sending the transaction hash being not for Dock ERC-20 tokens, or the signer of the message did not match the sender or something else. ${MIGRATION_SUPPORT_MSG}`];
        return details;
    }

    const messages = [`You have requested migration for the mainnet address ${req.mainnet_address}.`];

    if (req.is_vesting === true) {
        messages.push(`You have opted for vesting and are eligible for vesting bonus.`);
    }
    if (req.is_vesting === false) {
        messages.push(`You have not opted for vesting.`);
    }

    if (req.status === REQ_STATUS.SIG_VALID) {
        messages.push('Your request has been received. Waiting for sufficient confirmations to begin the migration.');
    }

    if (req.status === REQ_STATUS.TXN_PARSED) {
        messages.push('Your request has been received and successfully parsed. It mill be migrated soon.');
        if (req.is_vesting === true) {
            messages.push(getVestingMessageForUnMigrated(req));
        }
    }

    if (req.status === REQ_STATUS.TXN_CONFIRMED) {
        messages.push('Your request has been received and has had sufficient confirmations. It mill be migrated soon.');
        if (req.is_vesting === true) {
            messages.push(getVestingMessageForUnMigrated(req));
        }
    }

    // There wouldn't be in much delay between BONUS_CALCULATED and BONUS_TRANSFERRED, at max 1 hour.
    if ((req.status === REQ_STATUS.INITIAL_TRANSFER_DONE) || (req.status === REQ_STATUS.BONUS_CALCULATED)) {
        messages.push(`Your request has been processed successfully and tokens have been sent to your mainnet address in block 0x${req.migration_txn_hash}.`);
        if (req.is_vesting === true) {
            messages.push(getVestingMessageForMigrated(req));
        }
    }

    if (req.status === REQ_STATUS.BONUS_TRANSFERRED) {
        messages.push('Your request has been processed successfully and your tokens along with bonus have been transferred to your mainnet address.');
        messages.push(`The initial tokens were given in block 0x${req.migration_txn_hash}.`);
        if (req.is_vesting !== null) {
            messages.push(`Your bonus has been transferred in block 0x${req.bonus_txn_hash}.`);
        }
        if (req.is_vesting === true) {
            messages.push(`You have been given a swap bonus of ${req.swap_bonus_tokens+MICRO_DOCK} and ${req.vesting_bonus_tokens+MICRO_DOCK} of your balance is vesting.`);
        }
        if (req.is_vesting === false) {
            messages.push(`You have been given a swap bonus of ${req.swap_bonus_tokens+MICRO_DOCK}`);
        }
    }

    details['messages'] = messages;
    return details;
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
    // Try to send migration for maximum amount, sort in descending order.
    // XXX: Consider sorting in increasing order to migrate maximum requests
    confirmed.sort(function(a, b) {
        if (a.migration_tokens.lt(b.migration_tokens)) {
            return 1;
        } else if (b.migration_tokens.lt(a.migration_tokens)) {
            return -1;
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
        throw new Error('Could not migrate any request. This is either due to insufficient balance or cap on the allowed migration');
    }

    if (selected < confirmed.length) {
        console.warn(`${confirmed.length - selected} confirmed requests could not be migrated`);
    }

    // Do the migration. Migration is atomic, either all reqs are migrated or none.
    const recipients = confirmed.slice(0, selected).map((r) => [r.mainnet_address, r.migration_tokens.toString()]);
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

// TODO: A better alternative to console.info and console.warn here are using an external logging service
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
            console.warn(`Migration attempt of confirmed requests failed with error ${e}`)
        }
    }

    const reqsWithValidSig = reqByStatus[REQ_STATUS.SIG_VALID] || [];
    const reqsWithValidTxn = reqByStatus[REQ_STATUS.TXN_PARSED] || [];

    console.info(`Found ${reqsWithValidSig.length + reqsWithValidTxn.length} unconfirmed requests. Parse and check for confirmation.`);

    // Fetch transactions for unconfirmed requests which are valid ERC-20 transfers to the Vault address
    const unconfirmedReqs = (reqsWithValidSig).concat(reqsWithValidTxn);
    const txns = await Promise.allSettled(unconfirmedReqs.map((r) => getTransactionAsDockERC20TransferToVault(web3Client, addPrefixToHex(r.eth_txn_hash))));
    // console.log(txns);

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
        if (isValidTransferFrom(txn, req.eth_address)) {
            if (isTxnConfirmedAsOf(txn, currentBlockNumber)) {
                req.status = REQ_STATUS.TXN_CONFIRMED;
                req.erc20 = txn.value;
                // Note: Don't compute mainnet balance due to potential time dependent bonus.
                confirmedReqs.push(req);
                dbWritesForUnMigratedReqs.push(markRequestParsedAndConfirmed(dbClient, req.eth_address, req.eth_txn_hash, txn.value, txn.blockNumber));
            } else {
                dbWritesForUnMigratedReqs.push(markRequestParsed(dbClient, req.eth_address, req.eth_txn_hash, txn.value))
            }
        } else {
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
        // Note: If the migrator's address is used outside of this code then there is a chance that value of `allowedMigrations` won't be
        // correct between now and previous invocation of `migrateConfirmedRequests` in this function
        const [blockHash, migrated, ] = await migrateConfirmedRequests(dockNodeClient, confirmedReqs, allowedMigrations, balanceAsBn);
        await updateMigratedRequestsInDb(dbClient, blockHash, migrated);
    }
}
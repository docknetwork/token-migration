import {
    getPendingBonusCalcRequests,
    updateBonuses,
    getPendingBonusDispRequests,
    updateAfterBonusTransfer,
} from "./db-utils";
import {
    fromERC20ToDockTokens,
    getVestingAmountFromMigratedTokens
} from "./migrations";
import BN from "bn.js";
import {alarmMigratorIfNeeded} from "./email-utils";

require('dotenv').config();

/**
 * Calculate bonus from given requests fetched from the database. Returns bonus for all requests,
total transferred tokens, total transferred by vesting users, total swap bonus, total vesting bonus.
The total bonuses to be given will be used to adjust the unminted emission supply
Assumes all the initial migrations are done
 * @param {*} requestRows 
 */
export function calculateBonuses(requestRows) {
    const totalTransferred = new BN("0");
    const totalTransferredByVestingUsers = new BN("0");
    let totalSwapBonus = new BN("0");
    let totalVestingBonus = new BN("0");
    
    if (requestRows.length > 0) {
        // Convert ERC-20 tokens to Dock tokens
        requestRows.forEach(r => {
            r.dockTokens = fromERC20ToDockTokens(r.erc20);
            totalTransferred.iadd(r.dockTokens);
            if (r.is_vesting === true) {
                totalTransferredByVestingUsers.iadd(r.dockTokens);
            }
        });

        const b = calculateBonusGivenTransferredAmounts(requestRows, totalTransferred, totalTransferredByVestingUsers);
        totalSwapBonus = b[0];
        totalVestingBonus = b[1];
    }

    return [requestRows, totalTransferred, totalTransferredByVestingUsers, totalSwapBonus, totalVestingBonus]
}

export function calculateBonusGivenTransferredAmounts(requestRows, totalTransferred, totalTransferredByVestingUsers) {
    const totalSwapBonus = new BN("0");
    const totalVestingBonus = new BN("0");

    // The bonus pools
    const swapPool = new BN(process.env.SWAP_BONUS_POOL);
    const vestingPool = new BN(process.env.VESTING_BONUS_POOL);

    requestRows.forEach(r => {
        // No risk of divide by 0 as totalTransferred is always > 0

        // Swap bonus for a request = (tokens transferred in that request / total tokens transferred) * Swap bonus pool
        let swapBonus = r.dockTokens.mul(swapPool);
        swapBonus = swapBonus.div(totalTransferred);
        r.swap_bonus_tokens = swapBonus;
        totalSwapBonus.iadd(swapBonus);

        if (r.is_vesting === true) {
            // Vesting bonus for a request = (tokens transferred in that request / total tokens transferred in requests opting for vesting) * Vesting bonus pool
            let vestingBonus = r.dockTokens.mul(vestingPool);
            vestingBonus = vestingBonus.div(totalTransferredByVestingUsers);
            r.vesting_bonus_tokens = vestingBonus;
            totalVestingBonus.iadd(vestingBonus);
        } else {
            r.vesting_bonus_tokens = new BN("0");
        }
    });

    return [totalSwapBonus, totalVestingBonus];
}
 
export async function updateDBWithBonuses(dbClient, requests) {
    const dbWrites = [];
    requests.forEach(r => {
        dbWrites.push(updateBonuses(dbClient, r.eth_address, r.eth_txn_hash, r.swap_bonus_tokens.toString(), r.vesting_bonus_tokens.toString()));
    });
    await Promise.all(dbWrites);
}

/**
 * Calculate bonuses and update database with bonuses for each migration request. Returns bonus for all requests,
total transferred tokens, total transferred by vesting users, total swap bonus, total vesting bonus.
The total bonuses to be given will be used to adjust the unminted emission supply.
Assumes all the initial migrations are done
 * @param {*} dbClient 
 */
export async function calculateBonusesAndUpdateDB(dbClient) {
    const requests = await getPendingBonusCalcRequests(dbClient);
    const [updatedRequests, totalTransferred, totalTransferredByVestingUsers, totalSwapBonus, totalVestingBonus] = calculateBonuses(requests);
    await updateDBWithBonuses(dbClient, updatedRequests);
    return [totalTransferred, totalTransferredByVestingUsers, totalSwapBonus, totalVestingBonus];
}

/**
 * Finds requests that are eligible to be considered for migration or bonus given the current allowed migrations and
the balance of the migrator. Selects requests with highest balance first. Sorts the given requests in descending order
and returns the number of requests that can be selected from the given requests
 * @param {*} requests 
 * @param {*} allowedMigrations 
 * @param {*} balance 
 */
export function findAndPrepEligibleReqsGivenMigrConstr(requests, allowedMigrations, balance) {
    const updatedRequests = requests.map((r) => {
        // Shallow copy is fine
        const n =  {...r};
        n.swap_bonus_tokens = new BN(r.swap_bonus_tokens);
        if (r.is_vesting === true) {
            // During initial migration only half of the amount was transferred
            n.vesting_bonus_tokens = getVestingAmountFromMigratedTokens(r.erc20).add(new BN(r.vesting_bonus_tokens));
            n.total_bonus = n.vesting_bonus_tokens.add(n.swap_bonus_tokens);
        } else {
            n.total_bonus = n.swap_bonus_tokens;
        }
        return n;
    });

    // Sorting in increasing order to serve maximum bonus requests
    updatedRequests.sort(function(a, b) {
        if (a.total_bonus.lt(b.total_bonus)) {
            return -1;
        } else if (b.total_bonus.lt(a.total_bonus)) {
            return 1;
        }
        return 0;
    });

    let accum = new BN("0");
    let selected = 0;
    // The node counts swap and vesting bonus entries as independent
    let bonusEntryCount = 0;
    while (selected < updatedRequests.length) {
        if (bonusEntryCount >= allowedMigrations) {
            break;
        }
        const temp = accum.add(updatedRequests[selected].total_bonus);
        if (balance.gte(temp)) {
            accum = temp;
            // All bonus will be dispatched as swap
            // bonusEntryCount += updatedRequests[selected].isVesting === true ? 2 : 1;
            bonusEntryCount++;
            selected++;
        } else {
            break;
        }
    }

    return updatedRequests.slice(0, selected);
}

export function prepareForBonusDisbursalReq(requests) {
    const swapBonusRecips = [];
    // Vesting bonus mechanism changed
    // const vestingBonusRecips = [];
    const startingBlockNo = new BN(process.env.MIGRATION_START_BLOCK_NO);
    // Dock's block time is 3 sec
    const blockTimeRatio = Math.floor(parseFloat(process.env.ETH_BLOCK_TIME) / 3);
    requests.forEach(req => {
        const ethBlockNo = new BN(req.eth_txn_block_no);
        // Offset fits in 32 bytes
        const offset = (ethBlockNo.sub(startingBlockNo).muln(blockTimeRatio).toNumber());

        // Vesting bonus mechanism changed so it will act just like swap bonus
        /* swapBonusRecips.push([req.mainnet_address, req.swap_bonus_tokens.toString(), offset]);
        if (req.is_vesting === true) {
            vestingBonusRecips.push([req.mainnet_address, req.vesting_bonus_tokens.toString(), offset]);
        } */
        let bonusAmount = req.swap_bonus_tokens;
        if (req.is_vesting === true) {
            bonusAmount.iadd(req.vesting_bonus_tokens);
        }

        swapBonusRecips.push([req.mainnet_address, bonusAmount.toString(), offset]);
    });
    // return [swapBonusRecips, vestingBonusRecips];
    return swapBonusRecips;
}

/**
 *  Update request details for which bonus has been  transferred.
 * @param {*} dbClient 
 * @param {*} requests 
 * @param {*} blockHash 
 */
export async function updateDBPostBonusTrsfr(dbClient, requests, blockHash) {
    const dbReqPromises = [];
    requests.forEach((req) => {
        dbReqPromises.push(updateAfterBonusTransfer(dbClient, req.eth_address, req.eth_txn_hash, blockHash));
    });
    await Promise.all(dbReqPromises);
}

export async function dispatchBonusesAndUpdateDB(dbClient, dockNodeClient, batchSize = 100) {
    // Get number of allowed migration and migrator's balance
    let [allowedMigrations, balance] = await dockNodeClient.getMigratorDetails();
    // Convert balance to BigNumber as ERC-20 balance is used a big BigNumber
    let balanceAsBn = balance.toBn();

    await alarmMigratorIfNeeded(allowedMigrations, balanceAsBn);

    // Get requests for which bonus has to be dispatched.
    const requests = await getPendingBonusDispRequests(dbClient, batchSize);
    if (requests.length === 0) {
        return 0;
    }

    // Find requests which can be given bonus given migrator's current balance and allowed migrations
    const selectedReqs = findAndPrepEligibleReqsGivenMigrConstr(requests, allowedMigrations, balanceAsBn);

    if (selectedReqs.length === 0) {
        throw new Error('Could not give bonus to any request. This is either due to insufficient balance or cap on the allowed migration');
    }

    if (selectedReqs.length < requests.length) {
        console.warn(`${requests.length - selectedReqs.length} requests could not be given bonus`);
    }

    // Calculate total bonus and offset for requests
    // const [swapBonusRecips, vestingBonusRecips] = prepareForBonusDisbursalReq(selectedReqs);
    const swapBonusRecips = prepareForBonusDisbursalReq(selectedReqs);

    const blockHash = await dockNodeClient.giveBonuses(swapBonusRecips, []);
    console.info(`Gave bonus to ${selectedReqs.length} requests in block ${blockHash}`);

    await updateDBPostBonusTrsfr(dbClient, selectedReqs, blockHash);

    return selectedReqs.length;
}
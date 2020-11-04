import {getPendingBonusRequests, updateBonuses} from "./db-utils";
import {fromERC20ToDockTokens} from "./migrations";
import BN from "bn.js";

require('dotenv').config();

// Calculate bonus from given requests fetched from the database. Returns bonus for all requests,
// total transferred tokens, total transferred by vesting users, total swap bonus, total vesting bonus.
// The total bonuses to be given will be used to adjust the unminted emission supply
// Assumes all the initial migrations are done
export function calculateBonuses(requestRows) {
    const totalTransferred = new BN("0");
    const totalTransferredByVestingUsers = new BN("0");
    const totalSwapBonus = new BN("0");
    const totalVestingBonus = new BN("0");

    if (requestRows.length > 0) {
        // Convert ERC-20 tokens to Dock tokens
        requestRows.forEach(r => {
            r.dockTokens = fromERC20ToDockTokens(r.erc20);
            totalTransferred.iadd(r.dockTokens);
            if (r.is_vesting === true) {
                totalTransferredByVestingUsers.iadd(r.dockTokens);
            }
        });

        // The bonus pools
        const swapPool = new BN(process.env.SWAP_BONUS_POOL);
        const vestingPool = new BN(process.env.VESTING_BONUS_POOL);

        requestRows.forEach(r => {
            // No risk of divide by 0 as totalTransferred is always > 0

            // Swap bonus for a request = (tokens transferred in that request / total tokens transferred) * Swap bonus pool
            let sb = r.dockTokens.mul(swapPool);
            sb = sb.div(totalTransferred);
            r.swap_bonus_tokens = sb;
            totalSwapBonus.iadd(sb);

            if (r.is_vesting === true) {
                // Vesting bonus for a request = (tokens transferred in that request / total tokens transferred in requests opting for vesting) * Vesting bonus pool
                let vb = r.dockTokens.mul(vestingPool);
                vb = vb.div(totalTransferredByVestingUsers);
                r.vesting_bonus_tokens = vb;
                totalVestingBonus.iadd(vb);
            } else {
                r.vesting_bonus_tokens = new BN("0");
            }
        });
    }

    return [requestRows, totalTransferred, totalTransferredByVestingUsers, totalSwapBonus, totalVestingBonus]
}

export async function updateDBWithBonuses(dbClient, requests) {
    const dbWrites = [];
    requests.forEach(r => {
        dbWrites.push(updateBonuses(dbClient, r.eth_address, r.eth_txn_hash, r.swap_bonus_tokens.toString(), r.vesting_bonus_tokens.toString()));
    });
    await Promise.all(dbWrites);
}

// Calculate bonuses and update database with bonuses for each migration request. Returns bonus for all requests,
// total transferred tokens, total transferred by vesting users, total swap bonus, total vesting bonus.
// The total bonuses to be given will be used to adjust the unminted emission supply.
// Assumes all the initial migrations are done
export async function calculateBonusesAndUpdateDB(dbClient) {
    const requests = await getPendingBonusRequests(dbClient);
    const [updatedRequests, totalTransferred, totalTransferredByVestingUsers, totalSwapBonus, totalVestingBonus] = calculateBonuses(requests);
    await updateDBWithBonuses(dbClient, updatedRequests);
    return [totalTransferred, totalTransferredByVestingUsers, totalSwapBonus, totalVestingBonus];
}

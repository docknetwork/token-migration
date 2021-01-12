import {getPendingBonusCalcRequests} from "../src/db-utils";
import {calculateBonuses} from "../src/bonus-utils";
import {DBClient} from "../src/db-utils";
import {formatBal} from "../src/migrations";


/**
 * Format token amount showing all 6 decimal places
 * @param amount - Assumes amount is as decimal string and has at least 6 numbers
 */
function formatAmount(amount) {
    const whole = amount.slice(0, -6);
    const fraction = amount.slice(-6);
    // Regex from here https://stackoverflow.com/a/51322015
    const wholeFormatted = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return `${wholeFormatted}.${fraction}`;
}


void async function() {
    const dbClient = new DBClient();
    await dbClient.start();
    const requests = await getPendingBonusCalcRequests(dbClient);
    const [updatedRequests, totalTransferred, totalTransferredByVestingUsers, totalSwapBonus, totalVestingBonus] = calculateBonuses(requests);
    console.log(`Considered ${updatedRequests.length} requests for bonus`);
    console.log(`Total transferred amount ${formatAmount(totalTransferred.toString())}`);
    console.log(`Total transferred amount by vesting users ${formatAmount(totalTransferredByVestingUsers.toString())}`);
    console.log(`Total swap bonus to be given ${formatAmount(totalSwapBonus.toString())}`);
    console.log(`Total vesting bonus to be given ${formatAmount(totalVestingBonus.toString())}`);

    if (process.argv.length === 3 && process.argv[2] === 'detailed') {
        console.log('');
        console.log('Showing as tokens, if vesting, swap bonus, vesting bonus');
        updatedRequests.forEach(r => {
           console.log(`${formatBal(r.dockTokens)}, ${r.is_vesting}, ${formatBal(r.swap_bonus_tokens)}, ${formatBal(r.vesting_bonus_tokens)}`);
        });
    }

    process.exit(0);
}();
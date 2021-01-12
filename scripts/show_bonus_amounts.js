import {getPendingBonusCalcRequests} from "../src/db-utils";
import {calculateBonuses} from "../src/bonus-utils";
import { DBClient } from "../src/db-utils";

void async function() {
    const dbClient = new DBClient();
    await dbClient.start();
    const requests = await getPendingBonusCalcRequests(dbClient);
    const [updatedRequests, totalTransferred, totalTransferredByVestingUsers, totalSwapBonus, totalVestingBonus] = calculateBonuses(requests);
    console.log(`Considered ${updatedRequests.length} requests for bonus`);
    console.log(`Total transferred amount ${totalTransferred.toString()}`);
    console.log(`Total transferred amount by vesting users ${totalTransferredByVestingUsers.toString()}`);
    console.log(`Total swap bonus to be given ${totalSwapBonus.toString()}`);
    console.log(`Total vesting bonus to be given ${totalVestingBonus.toString()}`);

    if (process.argv.length === 3 && process.argv[2] === 'detailed') {
        console.log('');
        console.log('Showing as tokens, if vesting, swap bonus, vesting bonus');
        updatedRequests.forEach(r => {
           console.log(`${r.dockTokens.toString()}, ${r.is_vesting}, ${r.swap_bonus_tokens}, ${r.vesting_bonus_tokens}`);
        });
    }
}();
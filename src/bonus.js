// Script to calculate bonuses or give bonuses

import {DBClient} from "./db-utils";
import {DockNodeClient} from "./dock-node-utils";
import {calculateBonusesAndUpdateDB, dispatchBonusesAndUpdateDB} from "./bonus-utils";

let dbClient;

void async function() {
    if (process.argv.length !== 3) {
        console.error('Need 1 and only 1 command line argument');
        process.exit(1);
    }

    const action = parseInt(process.argv[2]);

    dbClient = new DBClient();
    await dbClient.start();

    switch (action) {
        case 0:
            // Calculate bonuses and update database
            await calculateBonusesAndUpdateDB(dbClient);
            break;
        case 1:
            // Assuming bonuses have been calculated and updated in DB, send bonuses on Dock chain
            const dockNodeClient = new DockNodeClient();
            await dockNodeClient.start();
            let processed;
            do {
                // Process in batches of size 100
                processed = await dispatchBonusesAndUpdateDB(dbClient, dockNodeClient, 10);
            }
            while (processed > 0);
            break;
        default:
            console.error('Argument should be 0 or 1');
            process.exit(2);
    }
    process.exit(0);
}();
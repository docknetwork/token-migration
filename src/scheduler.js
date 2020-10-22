import {DBClient, getPendingMigrationRequests} from './db-utils';

require('dotenv').config();

// This script must be run with `forever` to keep on running

let dbClient;
let wait = ms => new Promise(resolve => setTimeout(resolve, ms));

// Check if any pending requests and try to do migration
async function checkPendingRequests() {
    /*console.log('In do something');
    await wait(100);
    console.timeLog('t');*/
    const requests = await getPendingMigrationRequests(dbClient);
    // TODO:
}

// This function will check for pending requests and wait for a minute and then recurse.
async function schedule() {
    await checkPendingRequests();
    // await wait(2000);
    await wait(process.env.SCHEDULER_FREQ);
    await schedule();
}

void async function() {
    dbClient = new DBClient();
    await dbClient.start();
    // console.time('t')
    await schedule();
    // console.log('done');
}();
import {DBClient} from './db-utils';
import {processPendingRequests} from "./migrations";
import {getNewWeb3MainnetClient} from "./eth-txn-utils";
import {DockNodeClient} from "./dock-node-utils";

require('dotenv').config();

// This script must be run with `forever` to keep on running

let dbClient;
let web3Client;
let dockNodeClient;
let wait = ms => new Promise(resolve => setTimeout(resolve, ms));

// This function will check for pending requests and wait for a minute and then recurse.
async function schedule() {
    await processPendingRequests(dbClient, web3Client, dockNodeClient);
    // await wait(2000);
    await wait(process.env.SCHEDULER_FREQ);
    await schedule();
}

void async function() {
    dbClient = new DBClient();
    await dbClient.start();
    web3Client = getNewWeb3MainnetClient();
    dockNodeClient = new DockNodeClient();
    await dockNodeClient.start();

    // console.time('t')
    await schedule();
    // console.log('done');
}();
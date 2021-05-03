import {DBClient} from './db-utils';
import {resetAllInvalidMigrations} from "./migrations";

let wait = ms => new Promise(resolve => setTimeout(resolve, ms));

async function scheduleInvalidCheck() {
  const dbClient = new DBClient();
  await dbClient.start();
  try {
    await resetAllInvalidMigrations(dbClient);
  } catch (e) {
      console.error('Error while trying to process invalid requests');
      console.error(e);
  } finally {
    // Infrequent process so close connection
    await dbClient.stop();
  }

  // Sleep for 12 hours
  await wait(12*3600*1000);
  // Repeat
  await scheduleInvalidCheck();
}

void async function() {
  await scheduleInvalidCheck();
}();
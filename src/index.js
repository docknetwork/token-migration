import {setupLogglyForAPI} from './log';
import {getServer, setupDbForServer} from "./server";

require('dotenv').config();

void async function() {
  const server = getServer();
  await setupDbForServer(server);
  setupLogglyForAPI();

  server.listen(process.env.API_PORT, process.env.API_LISTEN_ADDRESS, async () => {
    console.log('Server running on port', process.env.API_PORT);
  });
}();


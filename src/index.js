import express from 'express';
import bodyParser from 'body-parser';
import slowDown from 'express-slow-down';
import {DBClient, trackNewRequest, getRequestFromDB, getStatsFromDB} from './db-utils';
import {validateStatusRequest, validateMigrationRequest, checkReqWindow} from "./util";
import {setupLogglyForAPI, logMigrationReq} from './log';
import {prepareReqStatusForApiResp} from "./migrations";
import basicAuth from 'express-basic-auth';

require('dotenv').config();

let dbClient;

async function processMigrationReq(req, res, withBonus = false) {
  try {
    logMigrationReq(req.body);

    checkReqWindow(withBonus);

    // The signature needs to be persisted so that can be used in potential disputes resolution later.
    const [mainnetAddress, ethAddress, txnHash, signature, isVesting] = await validateMigrationRequest(req.body, withBonus)

    // XXX: An attacked can submit arbitrary txn hashes with valid signatures on valid payloads. One way to stop them
    // is to fetch txn using hash during this call and reject if sender address does not match the address used in payload
    // signing. This however requires a network call during API call. Another option is to use the queue to remove rows
    // with these arbitrary txns or set them to a negative value indicating invalid to help in case someone genuinely used
    // wrong id. Going the former route now.

    await trackNewRequest(dbClient, mainnetAddress, ethAddress, txnHash, signature, withBonus ? isVesting : null);

    // XXX: As an assurance to the holder, we might decide to include a signature by the API (the public key is well known)
    // in the response over the request thus giving them a proof that we wish to acknowledge the holder's request.

    res.statusCode = 200;
    res.json({
      error: null,
    });
  } catch (e) {
    // Log request again but with error. Have a better way like with finally or something
    logMigrationReq(req.body, e);

    res.statusCode = 400;
    res.json({
      error: e.toString(),
    });
  }
}

// For processing requests before bonus window closes
async function onMigrationWithBonusRequest(req, res) {
  await processMigrationReq(req, res, true);
}

// For processing requests after bonus window closes
async function onMigrationRequest(req, res) {
  await processMigrationReq(req, res, false);
}

async function onStatusRequest(req, res) {
  try {
    const [ethAddress, txnHash] = await validateStatusRequest(req.body);
    const dbReq = await getRequestFromDB(dbClient, ethAddress, txnHash);
    const details = prepareReqStatusForApiResp(dbReq);

    res.statusCode = 200;
    res.json({
      error: null,
      details,
    });
  } catch (e) {
    res.statusCode = 400;
    res.json({
      error: e.toString(),
    });
  }
}

async function onStatsRequest(req, res) {
  res.statusCode = 200;
  const stats = await getStatsFromDB(dbClient);
  res.json({
    stats,
  });
}

const server = express();
server.listen(process.env.API_PORT, process.env.API_LISTEN_ADDRESS, async () => {
  console.log('Server running on port', process.env.API_PORT);

  dbClient = new DBClient();
  await dbClient.start();

  setupLogglyForAPI();

  // Use JSON body parser with limit as we know its b58check of 67 bytes and hex of 64 bytes signature
  server.use(bodyParser.json({
    limit: '260b',
  }));

  const speedLimiter = slowDown({
    windowMs: 2 * 60 * 1000, // 2 minutes
    delayAfter: 120, // allow 120 requests per 2 minutes, then...
    delayMs: 100 // begin adding 100ms of delay per request above 120:
    // request # 121 is delayed by  100ms
    // request # 122 is delayed by 200ms
    // request # 123 is delayed by 300ms
    // etc.
  });

  server.use(speedLimiter);

  // CORS middleware
  server.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', process.env.CORS_ORIGIN);
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    next();
  });

  // Listen for migration route
  server.post('/migrate', onMigrationRequest);

  // Listen for migration route
  server.post('/migrate_with_bonus', onMigrationWithBonusRequest);

  // Listen for status route
  // XXX: This should have been a GET request
  server.post('/status', onStatusRequest);

  const users = {};
  users[process.env.STATS_ADMIN_NAME] = process.env.STATS_ADMIN_KEY;
  server.use('/statistics', basicAuth({users}));
  server.get('/statistics', onStatsRequest);
});

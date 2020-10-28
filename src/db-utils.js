// Tools for interacting with the database

import {Pool as PgPool} from 'pg';
import {REQ_STATUS} from './constants';
import {isBlacklistedAddress, removePrefixFromHex} from './util';

require('dotenv').config();

// Client for interacting with DB
export class DBClient {
    constructor(options) {
        this.pool = new PgPool(options || {
            user: process.env.DB_USER_NAME,
            host: process.env.DB_ENDPOINT,
            database: process.env.DB_NAME,
            password: process.env.DB_PASS,
            port: process.env.DB_PORT,
        });
    }

    async start() {
        this.client = await this.pool.connect();
    }

    async stop() {
        this.client.release()
        await this.pool.end()
    }

    async query(sqlWithPlaceholders, args) {
        // Start pool if not started
        if (this.client === undefined) {
            await this.start();
        }
        return this.client.query(sqlWithPlaceholders, args);
    }
}

export async function getRequestStatus(dbClient, address, txnHash) {
    const sql = 'SELECT status FROM public.requests WHERE eth_address = $1 AND eth_txn_hash = $2 LIMIT 1';
    const values = [removePrefixFromHex(address), removePrefixFromHex(txnHash)];

    let res;
    try {
      res = await dbClient.query(sql, values);
    } catch (e) {
      throw new Error(`Unexpected error. Message: ${e.message}, detail: ${e.detail}`)
    }

    if (res && res.rows.length > 0) {
      return res.rows[0].status;
    } else {
      throw new Error(`Cannot find token migration request with address: ${address} and txnHash: ${txnHash}`);
    }
}

// Track a new migration request in DB. Will throw error if request already tracked else return the inserted row
export async function trackNewRequest(dbClient, mainnetAddress, ethAddress, txnHash, signature) {
    const sql = 'INSERT INTO public.requests(eth_address, eth_txn_hash, mainnet_address, status, signature) VALUES($1, $2, $3, $4, $5) RETURNING *';
    const status = isBlacklistedAddress(ethAddress) ? REQ_STATUS.INVALID_BLACKLIST : REQ_STATUS.SIG_VALID;
    const values = [removePrefixFromHex(ethAddress), removePrefixFromHex(txnHash), mainnetAddress, status, removePrefixFromHex(signature)];
    try {
        const res = await dbClient.query(sql, values);
        return res.rows[0];
    } catch (e) {
        // TODO: `e` should be logged to some external logging service as well.
        if (e.message.startsWith('duplicate key value violates unique constraint')) {
            throw new Error('Already requested migration for this address and transaction');
        } else {
            throw new Error(`Unexpected error. Message: ${e.message}, detail: ${e.detail}`)
        }
    }
}

export async function getPendingMigrationRequests(dbClient) {
    const sql = `SELECT * FROM public.requests WHERE status >= ${REQ_STATUS.SIG_VALID} AND status < ${REQ_STATUS.MIGRATION_DONE}`;
    const res = await dbClient.query(sql);
    return res.rows;
}

async function setRequestStatus(dbClient, ethAddr, txnHash, status) {
    const sql = `UPDATE public.requests SET status = ${status} WHERE eth_address = '${ethAddr}' AND eth_txn_hash = '${txnHash}'`;
    return dbClient.query(sql);
}

export async function markRequestInvalid(dbClient, ethAddr, txnHash) {
    return setRequestStatus(dbClient, ethAddr, txnHash, REQ_STATUS.INVALID);
}

export async function markRequestParsed(dbClient, ethAddr, txnHash, erc20) {
    const sql = `UPDATE public.requests SET status = ${REQ_STATUS.TXN_PARSED}, erc20 = '${erc20}' WHERE eth_address = '${ethAddr}' AND eth_txn_hash = '${txnHash}'`;
    return dbClient.query(sql);
}

export async function markRequestConfirmed(dbClient, ethAddr, txnHash) {
    return setRequestStatus(dbClient, ethAddr, txnHash, REQ_STATUS.TXN_CONFIRMED);
}

export async function markRequestParsedAndConfirmed(dbClient, ethAddr, txnHash, erc20) {
    const sql = `UPDATE public.requests SET status = ${REQ_STATUS.TXN_CONFIRMED}, erc20 = '${erc20}' WHERE eth_address = '${ethAddr}' AND eth_txn_hash = '${txnHash}'`;
    return dbClient.query(sql);
}

export async function markRequestDone(dbClient, ethAddr, txnHash, mainnetTxnHash, mainnetTokens) {
    const sql = `UPDATE public.requests SET status = ${REQ_STATUS.MIGRATION_DONE}, mainnet_txn_hash = '${mainnetTxnHash}', mainnet_tokens_given = '${mainnetTokens}' WHERE eth_address = '${ethAddr}' AND eth_txn_hash = '${txnHash}'`;
    return dbClient.query(sql);
}
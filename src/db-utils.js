// Tools for interacting with the database

import {Pool as PgPool} from 'pg';
import {REQ_STATUS} from "./constants";
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

// Track a new migration request in DB. Will throw error if request already tracked else return the inserted row
export async function trackNewRequest(dbClient, mainnetAddress, ethAddress, txnHash, signature) {
    const sql = 'INSERT INTO public.requests(eth_address, eth_txn_hash, mainnet_address, status, signature) VALUES($1, $2, $3, $4, $5) RETURNING *';
    const values = [ethAddress, txnHash, mainnetAddress, REQ_STATUS.SIG_VALID, signature];
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

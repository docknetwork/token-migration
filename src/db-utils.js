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
            // number of milliseconds a client must sit idle in the pool and not be checked out
            // before it is disconnected from the backend and discarded
            // 0 means disable auto-disconnection of idle clients
            idleTimeoutMillis: 0,
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

export async function getRequestFromDB(dbClient, address, txnHash) {
    const sql = 'SELECT * FROM public.requests WHERE eth_address = $1 AND eth_txn_hash = $2 LIMIT 1';
    const values = [removePrefixFromHex(address).toLowerCase(), removePrefixFromHex(txnHash).toLowerCase()];

    let res;
    try {
        res = await dbClient.query(sql, values);
    } catch (e) {
        throw new Error(`Unexpected error. Message: ${e.message}, detail: ${e.detail}`)
    }

    if (res && res.rows.length > 0) {
        return res.rows[0];
    } else {
        throw new Error(`Cannot find token migration request with address: ${address} and txnHash: ${txnHash}`);
    }
}

// Track a new migration request in DB. Will throw error if request already tracked else return the inserted row
// If `isVesting` is null, it means the request was submitted after bonus window closed. `true` or `false` indicates opted for bonus or not
// and submitted before bonus window closes
export async function trackNewRequest(dbClient, mainnetAddress, ethAddress, txnHash, signature, isVesting = null) {
    const sql = 'INSERT INTO public.requests(eth_address, eth_txn_hash, mainnet_address, status, signature, is_vesting) VALUES($1, $2, $3, $4, $5, $6) RETURNING *';
    const status = isBlacklistedAddress(ethAddress) ? REQ_STATUS.INVALID_BLACKLIST : REQ_STATUS.SIG_VALID;
    const values = [removePrefixFromHex(ethAddress), removePrefixFromHex(txnHash), mainnetAddress, status, removePrefixFromHex(signature), isVesting];
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

/**
 * Get requests for which migration has not been done.
 * @param dbClient
 * @returns {Promise<*>}
 */
export async function getPendingMigrationRequests(dbClient) {
    const sql = `SELECT * FROM public.requests WHERE status >= ${REQ_STATUS.SIG_VALID} AND status < ${REQ_STATUS.INITIAL_TRANSFER_DONE}`;
    const res = await dbClient.query(sql);
    return res.rows;
}

/**
 * Get requests for which migration has been done but bonus not calculated yet
 * @param dbClient
 * @returns {Promise<*>}
 */
export async function getPendingBonusCalcRequests(dbClient) {
    const sql = `SELECT * FROM public.requests WHERE status = ${REQ_STATUS.INITIAL_TRANSFER_DONE} AND is_vesting IS NOT NULL`;
    const res = await dbClient.query(sql);
    return res.rows;
}

/**
 * Get requests for which bonus has been calculated but not calculated yet. Returns the request such that the requests
 opting for vesting come first
 * @param dbClient
 * @param batchSize
 * @returns {Promise<*>}
 */
export async function getPendingBonusDispRequests(dbClient, batchSize) {
    const sql = `SELECT * FROM public.requests WHERE status = ${REQ_STATUS.BONUS_CALCULATED} AND is_vesting IS NOT NULL ORDER BY is_vesting DESC LIMIT ${batchSize}`;
    const res = await dbClient.query(sql);
    return res.rows;
}

export async function markRequestInvalid(dbClient, ethAddr, txnHash) {
    const sql = `UPDATE public.requests SET status = ${REQ_STATUS.INVALID} WHERE eth_address = '${ethAddr}' AND eth_txn_hash = '${txnHash}'`;
    return dbClient.query(sql);
}

export async function markRequestParsed(dbClient, ethAddr, txnHash, erc20) {
    const sql = `UPDATE public.requests SET status = ${REQ_STATUS.TXN_PARSED}, erc20 = '${erc20}' WHERE eth_address = '${ethAddr}' AND eth_txn_hash = '${txnHash}'`;
    return dbClient.query(sql);
}

export async function markRequestConfirmed(dbClient, ethAddr, txnHash, blockNumber) {
    const sql = `UPDATE public.requests SET status = ${REQ_STATUS.TXN_CONFIRMED}, eth_txn_block_no = ${blockNumber} WHERE eth_address = '${ethAddr}' AND eth_txn_hash = '${txnHash}'`;
    return dbClient.query(sql);
}

export async function markRequestParsedAndConfirmed(dbClient, ethAddr, txnHash, erc20, blockNumber) {
    const sql = `UPDATE public.requests SET status = ${REQ_STATUS.TXN_CONFIRMED}, erc20 = '${erc20}', eth_txn_block_no = ${blockNumber} WHERE eth_address = '${ethAddr}' AND eth_txn_hash = '${txnHash}'`;
    return dbClient.query(sql);
}

export async function markInitialMigrationDone(dbClient, ethAddr, txnHash, migrationTxnHash, migrationTokens) {
    const sql = `UPDATE public.requests SET status = ${REQ_STATUS.INITIAL_TRANSFER_DONE}, migration_txn_hash = '${migrationTxnHash}', migration_tokens = '${migrationTokens}' WHERE eth_address = '${ethAddr}' AND eth_txn_hash = '${txnHash}'`;
    return dbClient.query(sql);
}

export async function updateBonuses(dbClient, ethAddr, txnHash, swapBonus, vestingBonus) {
    const sql = `UPDATE public.requests SET status = ${REQ_STATUS.BONUS_CALCULATED}, swap_bonus_tokens = '${swapBonus}', vesting_bonus_tokens = '${vestingBonus}' WHERE eth_address = '${ethAddr}' AND eth_txn_hash = '${txnHash}'`;
    return dbClient.query(sql);
}

export async function updateAfterBonusTransfer(dbClient, ethAddr, txnHash, bonusTxnHash) {
    const sql = `UPDATE public.requests SET status = ${REQ_STATUS.BONUS_TRANSFERRED}, bonus_txn_hash = '${bonusTxnHash}' WHERE eth_address = '${ethAddr}' AND eth_txn_hash = '${txnHash}'`;
    return dbClient.query(sql);
}

/**
 * Remove a migration request. Not exposed to public API. Intended to be used only in tests or by admin.
 * @param dbClient
 * @param ethAddr
 * @param txnHash
 * @returns {Promise<*>}
 */
export async function removeMigrationReq(dbClient, ethAddr, txnHash) {
    const sql = `DELETE from public.requests WHERE eth_address = '${ethAddr}' AND eth_txn_hash = '${txnHash}'`;
    return dbClient.query(sql);
}

/**
 * Get some statistics from DB
 * @param dbClient
 * @returns {Promise<{}>}
 */
export async function getStatsFromDB(dbClient) {
    const counts = dbClient.query('select count(*) as total, sum(case when status >= 0 then 1 else 0 end) AS valid, sum(case when status < 0 then 1 else 0 end) AS invalid FROM public.requests');
    const erc20 = dbClient.query('select sum(cast(erc20 as decimal(30, 2))) / 1000000000000000000 as tokens from public.requests');
    const initialMainnet = dbClient.query('select sum(cast(migration_tokens as decimal(30, 2))) / 1000000 as tokens from public.requests');
    // Find ERC-20 given by holders willing to vest
    const lockedForVesting = dbClient.query('select sum(cast(erc20 as decimal(30, 2))) / 1000000000000000000 as tokens from public.requests where is_vesting = true');
    const resp = await Promise.allSettled([counts, erc20, initialMainnet, lockedForVesting]);
    const stats = {};
    if (resp[0].status === 'fulfilled') {
        let cnts = resp[0].value.rows[0];
        stats['Migration reqs received so far'] = parseInt(cnts.total, 10);
        stats['Valid migration reqs received so far'] = parseInt(cnts.valid, 10);
        stats['Invalid migration reqs received so far'] = parseInt(cnts.invalid, 10);
    } else {
        console.error('Could not fetch count');
    }
    if (resp[1].status === 'fulfilled') {
        stats['Total ERC-20 received so far'] = parseFloat(resp[1].value.rows[0].tokens).toFixed(4);
    } else {
        console.error('Could not fetch erc20');
    }
    if (resp[2].status === 'fulfilled') {
        stats['Total mainnet tokens given so far'] = parseFloat(resp[2].value.rows[0].tokens).toFixed(4);
    } else {
        console.error('Could not fetch erc20');
    }
    if (resp[3].status === 'fulfilled') {
        // 50% go towards vesting
        stats['Tokens locked in vesting so far'] = (resp[3].value.rows[0].tokens / 2).toFixed(4);
    } else {
        console.error('Could not fetch erc20');
    }
    return stats;
}

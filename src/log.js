var winston = require('winston');
var {Loggly} = require('winston-loggly-bulk');

require('dotenv').config();

export let schedulerLogger;

export function setupLogglyForAPI() {
    winston.add(new Loggly({
        token: process.env.LOGGLY_TOKEN,
        subdomain: process.env.LOGGLY_SUBDOMAIN,
        tags: ["Migration-Request", process.env.LOGGLY_ENV],
        json: true
    }));
}

export function setupLogglyForScheduler() {
    schedulerLogger = winston.createLogger();
    schedulerLogger.add(new Loggly({
        token: process.env.LOGGLY_TOKEN,
        subdomain: process.env.LOGGLY_SUBDOMAIN,
        tags: ["Scheduler", process.env.LOGGLY_ENV],
        json: true
    }));
}

/**
 * Log migration request
 * @param reqBody
 * @param error
 */
export function logMigrationReq(reqBody, error) {
    try {
        if (error === undefined) {
            winston.log('info', reqBody);
        } else {
            winston.log('error', {error, req: reqBody});
        }
    } catch (e) {
        console.warn('Error while logging API:', e);
    }
}

export function logMigrationWarning(msg) {
    try {
        schedulerLogger.log('warn', {message: msg});
    } catch (e) {
        console.warn('Error while logging Scheduler:', e);
    }
}

/**
 * Log transaction that was marked invalid
 * @param msg
 * @param ethAddr - This is the ethereum address as inferred from signature from migration portal
 * @param txn - This is the ERC-20 `Transfer` event data.
 */
export function logBadTxn(msg, ethAddr, txn) {
    try {
        // This isn't really an error on our part.
        schedulerLogger.log('error', {requester: ethAddr, message: msg, txn: txn});
    } catch (e) {
        console.warn('Error while logging Scheduler:', e);
    }
}

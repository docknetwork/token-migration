var winston = require('winston');
var {Loggly} = require('winston-loggly-bulk');

require('dotenv').config();

export function setupLoggly() {
    winston.add(new Loggly({
        token: process.env.LOGGLY_TOKEN,
        subdomain: process.env.LOGGLY_SUBDOMAIN,
        tags: ["Migration-Request", process.env.LOGGLY_ENV],
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
        console.warn('Error while logging:', e);
    }
}

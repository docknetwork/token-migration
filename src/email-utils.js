import SESV2 from 'aws-sdk/clients/sesv2';
import {configFileName} from "./constants";
import * as BN from "bn.js";

require('dotenv').config();

const fs = require('fs');

// Check if a migrator needs to be refuelled and ring an alarm if needed.
export async function alarmMigratorIfNeeded(allowedMigrations, balanceAsBn) {
    if (shouldRingAlarm(allowedMigrations, balanceAsBn)) {
        await sendMigratorAlarmEmail();
        writeConfig();
    }
}

// Check if an alarm should be rung.
export function shouldRingAlarm(allowedMigrations, balanceAsBn) {
    // If allowed migrations or balance is less than specified in environment variable.
    if ((allowedMigrations < process.env.MIGRATOR_MIN_ALLOWED) || (balanceAsBn.lt(new BN(process.env.MIGRATOR_MIN_BALANCE)))) {
        try {
            // If config file is not found or does not have the time, assume an alarm needs to be raised.
            let rawConfig = fs.readFileSync(configFileName);
            const config = JSON.parse(rawConfig);
            const lastAlarmTime = (new Date(config.lastAlarm)).getTime()
            if (isNaN(lastAlarmTime)) {
                console.error('Config file was found at {} but did not contain the time');
                return true
            }
            return ((new Date()).getTime() - lastAlarmTime) > process.env.MIGRATOR_ALARM_WAIT;
        } catch (e) {
            return true
        }
    }
    return false
}

// Send mail alarming that migrator should be refuelled
export async function sendMigratorAlarmEmail() {
    const ses = new SESV2({
        apiVersion: '2019-09-27',
        accessKeyId: process.env.AWS_ACCESS_ID,
        secretAccessKey: process.env.AWS_SECRET_KEY,
        region: process.env.AWS_SES_EMAIL_REGION
    });

    // Split comma separated list of email recipients
    const toAddr = process.env.MIGRATOR_ALARM_EMAIL_TO.split(',');
    const params = {
        Destination: {
            ToAddresses: toAddr
        },
        Content: {
            Simple: {
                Body: {
                    Text: {
                        Data: 'Migrator is either low on balance or allowed migrations',
                        Charset: 'UTF-8'
                    }
                },
                Subject: {
                    Data: 'Migrator running low',
                    Charset: 'UTF-8'
                }
            }
        },
        FromEmailAddress: process.env.MIGRATOR_ALARM_EMAIL_FROM,
    };

    const r = await (ses.sendEmail(params).promise());
    console.log("Email sent.");
    console.log(r);
    return r;
}

// Write config file.
function writeConfig() {
    const config = {
        lastAlarm: new Date().toISOString()
    }
    let rawConfig = JSON.stringify(config);
    fs.writeFileSync(configFileName, rawConfig);
}

/*
void async function() {
    await sendMigratorAlarmEmail();
}();*/

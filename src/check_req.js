// Script to check details of a migration request. Expects the payload and signature (either hex or base58 encoded) that was submitted at the migration portal.
// Can also be checked from the migration API logs. Can optionally accept whether the request was sent during bonus window or not.

import {validateMigrationRequest} from "./util";
import bs58 from "bs58";

void async function() {
    if (process.argv.length < 4) {
        console.error('Need at least 2 command line arguments');
        process.exit(1);
    }

    let withBonus;
    if (process.argv.length > 4) {
        if (process.argv[4] === 'true') {
            withBonus = true;
        } else if (process.argv[4] === 'false') {
            withBonus = false;
        }
        else {
            console.error('3rd argument must be "true" or "false". "true" means submitted during bonus window, "false" means submitted after bonus');
            process.exit(1);
        }
    }
    if (withBonus === undefined) {
        withBonus = true;
    }

    const sig = process.argv[3];
    const signature = sig.startsWith('0x') ? bs58.encode(Buffer.from(sig.slice(2), 'hex')) : sig;
    try {
        const [mainnetAddress, ethAddress, txnHash, sigHex, isVesting] = validateMigrationRequest({payload: process.argv[2], signature}, withBonus);
        const vestingTxt = withBonus ? (isVesting ? 'with vesting' : 'without vesting') : '';
        console.info(`Migration request ${vestingTxt} was sent for mainnet address ${mainnetAddress} using ethereum transaction 0x${txnHash}.`);
        console.info(`The request was signed from address 0x${ethAddress} and the signature was 0x${sigHex}.`);
    } catch (e) {
        console.error('There was an error with this request');
        console.error(e.message);
    }
}();

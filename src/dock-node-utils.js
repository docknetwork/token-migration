import { DockAPI } from '@docknetwork/sdk';
import { Keyring } from '@polkadot/keyring';

require('dotenv').config();

export class DockNodeClient {
    constructor() {
        this.handle = new DockAPI();
    }

    async start() {
        await this.handle.init({address: process.env.DOCK_NODE_ENDPOINT})
    }

    async stop() {
        await this.handle.disconnect()
    }

    // Add account using URI, do migration, remove account to avoid keeping signing key in memory.
    // recipients is a list of pairs, i.e array of 2 element arrays containing an address
    async migrate(recipients) {
        // It is known that migrator has sr25519 keys
        const keyring = new Keyring({ type: 'sr25519' });
        // TODO: Move `MIGRATOR_SK` to a file that is not part of git.
        const keypair = keyring.addFromUri(process.env.MIGRATOR_SK);
        this.handle.setAccount(keypair);
        const txn = this.handle.migrationModule.migrateRecipAsList(recipients);

        try {
            const { status } = await this.handle.signAndSend(txn, false);
            this.clearKeypair(keyring, keypair);
            return status.asInBlock;
        } catch (e) {
            this.clearKeypair(keyring, keypair);
            throw new Error(`Migration failed with error ${e}`);
        }
    }

    // Get migrator's allowed migrations free balance
    async getMigratorDetails() {
        const address = process.env.MIGRATOR_ADDR;
        const [allowedMigrations, balance] = await multiQuery(this.handle, [
            [this.handle.api.query.migrationModule.migrators, address],
            [this.handle.api.query.system.account, address],
        ]);
        if (allowedMigrations.isNone) {
            throw new Error(`Migrator's address set in config ${address} is not a migrator`)
        }
        // allowedMigrations is a u16 so safe to convert to JS number
        return [allowedMigrations.value.toNumber(), balance.data.free];
    }

    clearKeypair(keyring, keypair) {
        // TODO: Is `lock` and `removePair` sufficient to zero out the key? Need to look
        // `lock` sets the secret key to empty byte array
        keypair.lock(); 
        keyring.removePair(keypair.address);
        this.handle.account = undefined;
    }
}

// Sent multiple queries in a batch
async function multiQuery(handle, queries) {
    return new Promise((resolve, reject) => {
        try {
            handle.api.queryMulti(queries, (resp) => {
                resolve(resp);
            })
                .catch((error) => {
                    reject(error);
                });
        } catch (error) {
            reject(error);
        }
    });
}
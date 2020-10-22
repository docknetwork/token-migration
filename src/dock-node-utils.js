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
        const account = keyring.addFromUri(process.env.MIGRATOR_SK);
        this.handle.setAccount(account);
        const txn = this.handle.migrationModule.migrateRecipAsList(recipients);

        try {
            const { status } = await this.handle.signAndSend(txn, false);
            this.clearKeypair(keyring, account.address);
            return status.asInBlock;
        } catch (e) {
            this.clearKeypair(keyring, account.address);
            throw new Error(`Migration failed with error ${e}`);
        }
    }

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

    clearKeypair(keyring, address) {
        // TODO: Is `removePair` sufficient to zero out the key? What about env vars in memory? Need to look
        keyring.removePair(address);
        this.handle.account = undefined;
    }
}

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
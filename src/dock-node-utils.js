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

    /**
     * Add account using URI, do migration, remove account to avoid keeping signing key in memory.
     * recipients is a list of pairs, i.e array of 2 element arrays containing an address
     * @param recipients
     * @returns {Promise<*|undefined>}
     */
    async migrate(recipients) {
        const action = this.handle.migrationModule.migrateRecipAsList.bind(this.handle);
        return this.actAsMigrator('Initial migration', action, [recipients])
    }

    /**
     * Add account using URI, give bonus, remove account to avoid keeping signing key in memory.
     * @param swapBonusRecips - Array of 3-element arrays with 1st element is address, 2nd is amount, 3rd is offset
     * @param vestingBonusRecips - Array of 3-element arrays with 1st element is address, 2nd is amount, 3rd is offset
     * @returns {Promise<*>}
     */
    async giveBonuses(swapBonusRecips, vestingBonusRecips) {
        const action = this.handle.migrationModule.giveBonuses.bind(this.handle);
        return this.actAsMigrator('Bonus disbursement', action, [swapBonusRecips, vestingBonusRecips])
    }

    /**
     * Do an action as a migrator. Used for doing initial migration and giving bonuses
     * @param actionDesc
     * @param action
     * @param args
     * @returns {Promise<*>}
     */
    async actAsMigrator(actionDesc, action, args) {
        // It is known that migrator has sr25519 keys
        const keyring = new Keyring({ type: 'sr25519' });
        // TODO: Move `MIGRATOR_SK` to a file that is not part of git.
        const keypair = keyring.addFromUri(process.env.MIGRATOR_SK);
        this.handle.setAccount(keypair);
        const txn = action(...args);
        try {
            const { status } = await this.handle.signAndSend(txn, false);
            return status.asInBlock.toString();
        } catch (e) {
            throw new Error(`${actionDesc} failed with error ${e}`);
        } finally {
            this.clearKeypair(keyring, keypair);
        }
    }

    /**
     * Get migrator's allowed migrations free balance
     * @returns {Promise<(*|string|{"@id": string})[]>}
     */
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

    async getBonusFor(address) {
        // TODO: After SDK PR is merged, uncomment the commented line and remove next
        // return this.handle.migrationModule.getBonus(address);
        const bonus = await this.handle.api.query.migrationModule.bonuses(address);
        return this.handle.api.createType('Option<Bonus>', bonus).unwrapOr(this.handle.api.createType('Bonus'));
    }

    /**
     * Returns free balance of given account
     * @param address
     * @returns {Promise<string|{"@id": string}|*>}
     */
    async getBalance(address) {
        const balance = await this.handle.api.query.system.account(address);
        return balance.data.free;
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
import {erc20ToInitialMigrationTokens} from '../../../build/eth-txn-utils';
import {DBClient, getRequestStatus, trackNewRequest} from "../../../build/db-utils";
import {DockNodeClient} from "../../../build/dock-node-utils";
import {processPendingRequests} from "../../../build/migrations";
import {REQ_STATUS} from "../../../build/constants";
import {removePrefixFromHex} from "../../../build/util";

const DockToken = artifacts.require("DockToken");

require('dotenv').config({path:'../../.env'});

// No confirmations needed for test
const TEST_ETH_TXN_CONFIRMATION_BLOCKS = '0';
const TEST_VAULT_ACCOUNT_INDEX = 8;

contract("DockToken", accounts => {
    let dbClient, nodeClient;

    before(async () => {
        dbClient = new DBClient();
        await dbClient.start();
        nodeClient = new DockNodeClient();
        await nodeClient.start();
    })

    it("should deploy contract with admin as first account, enable transfer and set contract address and vault address in env", async () => {
        const contract = await DockToken.deployed();
        let status = await contract.transferEnabled.call();
        assert.equal(
            status,
            false,
            "transferEnabled wasn't false"
        );
        await contract.enableTransfer();
        status = await contract.transferEnabled.call();
        assert.equal(
            status,
            true,
            "transferEnabled wasn't true"
        );

        // Override env variables
        process.env.DOCK_ERC_20_ADDR = contract.address.toLowerCase();
        // Arbitrary choice for vault account
        process.env.DOCK_ERC_20_VAULT_ADDR = accounts[TEST_VAULT_ACCOUNT_INDEX].toLowerCase();
        process.env.ETH_TXN_CONFIRMATION_BLOCKS = TEST_ETH_TXN_CONFIRMATION_BLOCKS;

        // Get the RPC endpoint of truffle's Eth node by querying injected RPC

        const host = web3._requestManager.provider.host;
        // const newWeb3 = new Web3(new Web3.providers.HttpProvider(host));
        // const block = await newWeb3.eth.getBlock('latest');
        // console.log('Current block', block);

        process.env.ETH_NODE_ENDPOINT = host;
    });

    async function migrateTestHelper(accounts, web3, transferMechanism, isVesting = null) {
        assert.equal(
            transferMechanism !== 'transfer' && transferMechanism !== 'transferFrom',
            false,
            `transferMechanism must be either transfer or transferFrom but was ${transferMechanism}`
        );

        // Owner fuels test accounts
        const owner = accounts[0];
        const contract = await DockToken.deployed();
        const ownerBal = await contract.balanceOf.call(owner);
        console.log(ownerBal.toString());

        const oneToken = new web3.utils.BN("1000000000000000000");

        const amount1 = new web3.utils.BN("9")
        amount1.imul(oneToken);
        const amount2 = new web3.utils.BN("5")
        amount2.imul(oneToken);
        const amount3 = oneToken.div(new web3.utils.BN("2"));
        const amount4 = oneToken.div(new web3.utils.BN("8"));

        console.log(amount1.toString());
        console.log(amount2.toString());
        console.log(amount3.toString());
        console.log(amount4.toString());
        await contract.transfer(accounts[1], amount1, { from: owner });
        await contract.transfer(accounts[2], amount2, { from: owner });
        await contract.transfer(accounts[3], amount3, { from: owner });
        await contract.transfer(accounts[4], amount4, { from: owner });
        // accounts[5] will not transfer to vault
        await contract.transfer(accounts[5], amount4, { from: owner });
        console.log((await contract.balanceOf.call(owner)).toString());

        const mainnetAddress1 = '3AkJdiRsTjWp5PjJRVXgDhVAUhtgutckADgwHGQh7ZB1ANvs';
        const mainnetAddress2 = '37gWq4gGd5ZfE979HuiRve8RujUbwfLZ1dkeXwTzV7oyc1Gk';
        const mainnetAddress3 = '37VqDE8j8h2frnmprFKPioaLzaXZS2XxTKKu7F7zeknDFbAc';
        const mainnetAddress4 = '37iWizExBLPhxf2M6igyvuBncKLihaiM8r3ebnpX3AVFKDDP';
        const mainnetAddress5 = '37rKkpevvStBZhwfrd2GWVtQWprac3mBrr8v8RNNqqtoyVST';

        const vault = accounts[TEST_VAULT_ACCOUNT_INDEX];
        const oldBalances = {};
        oldBalances[accounts[1]] = await contract.balanceOf.call(accounts[1]);
        oldBalances[accounts[2]] = await contract.balanceOf.call(accounts[2]);
        oldBalances[accounts[3]] = await contract.balanceOf.call(accounts[3]);
        oldBalances[accounts[4]] = await contract.balanceOf.call(accounts[4]);
        oldBalances[accounts[5]] = await contract.balanceOf.call(accounts[5]);
        oldBalances[vault] = await contract.balanceOf.call(vault);

        let txn1, txn2, txn3, txn4, txn5;
        // Transfer to vault
        if (transferMechanism === 'transfer') {
            // Direct transfer to vault
            txn1 = await contract.transfer(vault, amount1, { from: accounts[1] });
            txn2 = await contract.transfer(vault, amount2, { from: accounts[2] });
            txn3 = await contract.transfer(vault, amount3, { from: accounts[3] });
            txn4 = await contract.transfer(vault, amount4, { from: accounts[4] });
            // accounts[5] not transferring to vault but to accounts[6]
            txn5 = await contract.transfer(accounts[6], amount4, { from: accounts[5] });
        } else {
            // Approval of transfer to an intermediate account, accounts[7]
            await contract.approve(accounts[7], amount1, { from: accounts[1] });
            await contract.approve(accounts[7], amount2, { from: accounts[2] });
            await contract.approve(accounts[7], amount3, { from: accounts[3] });
            await contract.approve(accounts[7], amount4, { from: accounts[4] });
            await contract.approve(accounts[7], amount4, { from: accounts[5] });

            // accounts[7] uses the approved amount to transfer to vault
            txn1 = await contract.transferFrom(accounts[1], vault, amount1, { from: accounts[7] });
            txn2 = await contract.transferFrom(accounts[2], vault, amount2, { from: accounts[7] });
            txn3 = await contract.transferFrom(accounts[3], vault, amount3, { from: accounts[7] });
            txn4 = await contract.transferFrom(accounts[4], vault, amount4, { from: accounts[7] });
            // accounts[5] not transferring to vault but to accounts[6]
            txn5 = await contract.transferFrom(accounts[5], accounts[6], amount4, { from: accounts[7] });
        }


        console.log(txn1.tx);
        console.log(txn2.tx);
        console.log(txn3.tx);
        console.log(txn4.tx);
        console.log(txn5.tx);

        const mainnetAddress1Bal = (await nodeClient.getBalance(mainnetAddress1)).toBn();
        const mainnetAddress2Bal = (await nodeClient.getBalance(mainnetAddress2)).toBn();
        const mainnetAddress3Bal = (await nodeClient.getBalance(mainnetAddress3)).toBn();
        const mainnetAddress4Bal = (await nodeClient.getBalance(mainnetAddress4)).toBn();
        const mainnetAddress5Bal = (await nodeClient.getBalance(mainnetAddress5)).toBn();

        const totalMainnet = erc20ToInitialMigrationTokens(amount1.toString(), isVesting)
            .add(erc20ToInitialMigrationTokens(amount2.toString(), isVesting))
            .add(erc20ToInitialMigrationTokens(amount3.toString(), isVesting))
            .add(erc20ToInitialMigrationTokens(amount4.toString(), isVesting));


        // Don't care about signature here
        await trackNewRequest(dbClient, mainnetAddress1, accounts[1], txn1.tx, "", isVesting)
        await trackNewRequest(dbClient, mainnetAddress2, accounts[2], txn2.tx, "", isVesting)
        await trackNewRequest(dbClient, mainnetAddress3, accounts[3], txn3.tx, "", isVesting)
        await trackNewRequest(dbClient, mainnetAddress4, accounts[4], txn4.tx, "", isVesting)
        await trackNewRequest(dbClient, mainnetAddress5, accounts[5], txn5.tx, "", isVesting)

        let [allowedMigrationsPre, balancePre] = await nodeClient.getMigratorDetails();

        await processPendingRequests(dbClient, web3, nodeClient);

        let [allowedMigrationsPost, balancePost] = await nodeClient.getMigratorDetails();

        const mainnetAddress1PostBal = (await nodeClient.getBalance(mainnetAddress1)).toBn();
        const mainnetAddress2PostBal = (await nodeClient.getBalance(mainnetAddress2)).toBn();
        const mainnetAddress3PostBal = (await nodeClient.getBalance(mainnetAddress3)).toBn();
        const mainnetAddress4PostBal = (await nodeClient.getBalance(mainnetAddress4)).toBn();
        const mainnetAddress5PostBal = (await nodeClient.getBalance(mainnetAddress5)).toBn();

        assert.equal(
            allowedMigrationsPre - allowedMigrationsPost,
            4,
            `Wrong count of allowedMigrations. Should be 4. Was ${allowedMigrationsPre - allowedMigrationsPost}`
        );

        // Migrator's Dock token balance should decrease
        assert.equal(
            (balancePre.toBn().sub(balancePost.toBn())).eq(totalMainnet),
            true,
            `Wrong balance.`
        );

        // Requesters' Dock token balance should increase
        assert.equal(
            mainnetAddress1PostBal.sub(mainnetAddress1Bal).eq(erc20ToInitialMigrationTokens(amount1.toString(), isVesting)),
            true,
            `Wrong balance for address 1`
        );
        assert.equal(
            mainnetAddress2PostBal.sub(mainnetAddress2Bal).eq(erc20ToInitialMigrationTokens(amount2.toString(), isVesting)),
            true,
            `Wrong balance for address 2`
        );
        assert.equal(
            mainnetAddress3PostBal.sub(mainnetAddress3Bal).eq(erc20ToInitialMigrationTokens(amount3.toString(), isVesting)),
            true,
            `Wrong balance for address 3`
        );
        assert.equal(
            mainnetAddress4PostBal.sub(mainnetAddress4Bal).eq(erc20ToInitialMigrationTokens(amount4.toString(), isVesting)),
            true,
            `Wrong balance for address 4`
        );

        // Address 5's balance should not change
        assert.equal(
            mainnetAddress5PostBal.eq(mainnetAddress5Bal),
            true,
            `Wrong balance for address 5`
        );
        // Address 5's request should be marked invalid
        let status = await getRequestStatus(dbClient, accounts[5], txn5.tx)
        assert.equal(status, REQ_STATUS.INVALID, 'Status should have been invalid');

        // Requesters' ERC-20 balance should decrease
        const newBalances = {};
        newBalances[accounts[1]] = await contract.balanceOf.call(accounts[1]);
        newBalances[accounts[2]] = await contract.balanceOf.call(accounts[2]);
        newBalances[accounts[3]] = await contract.balanceOf.call(accounts[3]);
        newBalances[accounts[4]] = await contract.balanceOf.call(accounts[4]);
        newBalances[accounts[5]] = await contract.balanceOf.call(accounts[5]);
        newBalances[vault] = await contract.balanceOf.call(vault);
        assert.equal(
            oldBalances[accounts[1]].sub(newBalances[accounts[1]]).eq(amount1),
            true,
            'ERC-20 balance did not decrease correctly for 1'
        );
        assert.equal(
            oldBalances[accounts[2]].sub(newBalances[accounts[2]]).eq(amount2),
            true,
            'ERC-20 balance did not decrease correctly for 2'
        );
        assert.equal(
            oldBalances[accounts[3]].sub(newBalances[accounts[3]]).eq(amount3),
            true,
            'ERC-20 balance did not decrease correctly for 3'
        );
        assert.equal(
            oldBalances[accounts[4]].sub(newBalances[accounts[4]]).eq(amount4),
            true,
            'ERC-20 balance did not decrease correctly for 4'
        );
        assert.equal(
            oldBalances[accounts[5]].sub(newBalances[accounts[5]]).eq(amount4),
            true,
            'ERC-20 balance did not decrease correctly for 5'
        );

        // Vault's ERC-20 balance should increase
        // Only 4 accounts gave tokens to vault, accounts[5] gave to someone else
        const totalErc20 = amount1.add(amount2).add(amount3).add(amount4);
        assert.equal(
            newBalances[vault].sub(oldBalances[vault]).eq(totalErc20),
            true,
            'ERC-20 balance did not increase correctly for vault'
        );

        // Cleanup
        const items = [
            [accounts[1], txn1.tx],
            [accounts[2], txn2.tx],
            [accounts[3], txn3.tx],
            [accounts[4], txn4.tx],
            [accounts[5], txn5.tx]
        ];
        for (let i=0; i<5; i++) {
            const ethAddr = removePrefixFromHex(items[i][0]);
            const txnHash = removePrefixFromHex(items[i][1]);
            const sql = `DELETE from public.requests WHERE eth_address = '${ethAddr}' AND eth_txn_hash = '${txnHash}'`;
            await dbClient.query(sql);
        }
    }

    it("Transfers to Dock's contract and vault using `transfer` should be migrated after bonus window closes", async () => {
        await migrateTestHelper(accounts, web3, 'transfer');
    });

    it("Transfers to Dock's contract and vault using `transferFrom` should be migrated after bonus window closes", async () => {
        // This mechanism might be used by exchanges
        await migrateTestHelper(accounts, web3, 'transferFrom');
    });

    it("Transfers to Dock's contract and vault using `transfer` should be migrated when not opting for vesting bonus", async () => {
        await migrateTestHelper(accounts, web3, 'transfer', false);
    });

    it("Transfers to Dock's contract and vault using `transferFrom` should be migrated when not opting for vesting bonus", async () => {
        // This mechanism might be used by exchanges
        await migrateTestHelper(accounts, web3, 'transferFrom', false);
    });

    it("Transfers to Dock's contract and vault using `transfer` should be migrated when opting for vesting bonus", async () => {
        await migrateTestHelper(accounts, web3, 'transfer', true);
    });

    it("Transfers to Dock's contract and vault using `transferFrom` should be migrated when opting for vesting bonus", async () => {
        // This mechanism might be used by exchanges
        await migrateTestHelper(accounts, web3, 'transferFrom', true);
    });

    after(async () => {
        await dbClient.stop();
        await nodeClient.stop();
    })
});
import {erc20ToInitialMigrationTokens, fromERC20ToDockTokens, getVestingAmountFromMigratedTokens, isValidTransferFrom, getTokenSplit, prepareReqStatusForApiResp} from "../src/migrations";
import {getNewWeb3MainnetClient, getTransactionAsDockERC20TransferToVault} from "../src/eth-txn-utils";
import {MICRO_DOCK, REQ_STATUS, MIGRATION_SUPPORT_MSG} from "../src/constants";

describe('Migration testing', () => {
    let vaultReal;

    beforeAll(() => {
        // Mock address will be vaulted. Keeping this value to switch back to original value.
        vaultReal = process.env.DOCK_ERC_20_VAULT_ADDR;
    });

    test('Convert ERC-20 to mainnet tokens', () => {
        expect(fromERC20ToDockTokens("9194775499990000000000").toString()).toBe("9194775499");
        expect(fromERC20ToDockTokens("19023932499990000000000").toString()).toBe("19023932499");
        expect(fromERC20ToDockTokens("5351643000000000000000").toString()).toBe("5351643000");
        expect(fromERC20ToDockTokens("1654000000000000000000").toString()).toBe("1654000000");
        expect(fromERC20ToDockTokens("6525911238000000000000").toString()).toBe("6525911238");
        expect(fromERC20ToDockTokens("46277679625000000000000").toString()).toBe("46277679625");
        expect(fromERC20ToDockTokens("37500000000000000000000").toString()).toBe("37500000000");
        expect(fromERC20ToDockTokens("84000000000000000000").toString()).toBe("84000000");
    });

    test('From ERC-20 to initial migration tokens', () => {
        expect(erc20ToInitialMigrationTokens("9194775499990000000000", null).toString()).toBe("9194775499");
        expect(erc20ToInitialMigrationTokens("9194775499990000000000", false).toString()).toBe("9194775499");
        expect(erc20ToInitialMigrationTokens("9194775499990000000000", true).toString()).toBe("4597387749");

        expect(erc20ToInitialMigrationTokens("19023932499990000000000", null).toString()).toBe("19023932499");
        expect(erc20ToInitialMigrationTokens("19023932499990000000000", false).toString()).toBe("19023932499");
        expect(erc20ToInitialMigrationTokens("19023932499990000000000", true).toString()).toBe("9511966249");

        expect(erc20ToInitialMigrationTokens("5351643000000000000000", null).toString()).toBe("5351643000");
        expect(erc20ToInitialMigrationTokens("5351643000000000000000", false).toString()).toBe("5351643000");
        expect(erc20ToInitialMigrationTokens("5351643000000000000000", true).toString()).toBe("2675821500");

        expect(erc20ToInitialMigrationTokens("1654000000000000000000", null).toString()).toBe("1654000000");
        expect(erc20ToInitialMigrationTokens("1654000000000000000000", false).toString()).toBe("1654000000");
        expect(erc20ToInitialMigrationTokens("1654000000000000000000", true).toString()).toBe("827000000");

        expect(erc20ToInitialMigrationTokens("6525911238000000000000", null).toString()).toBe("6525911238");
        expect(erc20ToInitialMigrationTokens("6525911238000000000000", false).toString()).toBe("6525911238");
        expect(erc20ToInitialMigrationTokens("6525911238000000000000", true).toString()).toBe("3262955619");
    });

    test('From ERC-20 to vesting tokens', () => {
        expect(getVestingAmountFromMigratedTokens("9194775499990000000000").toString()).toBe("4597387750");
        expect(getVestingAmountFromMigratedTokens("19023932499990000000000").toString()).toBe("9511966250");
        expect(getVestingAmountFromMigratedTokens("5351643000000000000000").toString()).toBe("2675821500");
        expect(getVestingAmountFromMigratedTokens("1654000000000000000000").toString()).toBe("827000000");
        expect(getVestingAmountFromMigratedTokens("6525911238000000000000").toString()).toBe("3262955619");
    })

    test('Valid transfers from certain address', async () => {
        // Mock vault address
        process.env.DOCK_ERC_20_VAULT_ADDR = '0x1062a747393198f70f71ec65a582423dba7e5ab3';

        const web3Client = getNewWeb3MainnetClient();

        // Transfer made by address 0x1b2c4352fa9fb5567c49ac78ceb7209d23f6632e
        const txnHash1 = '0x51279a0b8b7f18610dd2dc60b36430fa54f4de12219612f894e9fd0dbd495174';
        const transfer1 = await getTransactionAsDockERC20TransferToVault(web3Client, txnHash1);
        expect(isValidTransferFrom(transfer1, '1b2c4352fa9fb5567c49ac78ceb7209d23f6632e')).toBe(true);

        // Transfer not made by address 0x1b2c4352fa9fb5567c49ac78ceb7209d23f6632e
        const txnHash2 = '0x8eb1f8f5ec864ee638a160958b153bfdd84519e8edaa413d27420ab89ca299f5';
        const transfer2 = await getTransactionAsDockERC20TransferToVault(web3Client, txnHash2);
        expect(isValidTransferFrom(transfer2, '1b2c4352fa9fb5567c49ac78ceb7209d23f6632e')).toBe(false);
    });

    test('Token split', () => {
        const [i1, l1] = getTokenSplit({erc20: '9194775499990000000000'}, true);
        expect(i1).toBe('4597387749'+MICRO_DOCK);
        expect(l1).toBe('4597387750'+MICRO_DOCK);

        const [i2, l2] = getTokenSplit({erc20: '9194775499990000000000'}, false);
        expect(i2).toBe('9194775499'+MICRO_DOCK);
        expect(l2).toBe('0');

        const [i3, l3] = getTokenSplit({erc20: '6525911238000000000000'}, true);
        expect(i3).toBe('3262955619'+MICRO_DOCK);
        expect(l3).toBe('3262955619'+MICRO_DOCK);

        const [i4, l4] = getTokenSplit({erc20: '6525911238000000000000'}, false);
        expect(i4).toBe('6525911238'+MICRO_DOCK);
        expect(l4).toBe('0');
    });

    test('API response', () => {
        const details1 = prepareReqStatusForApiResp({status: REQ_STATUS.INVALID_BLACKLIST});
        expect(details1.status).toBe(REQ_STATUS.INVALID_BLACKLIST);
        expect(details1.messages.length).toBe(1);
        expect(details1.messages[0].startsWith('Migration request has been received but the sender address is blacklisted')).toBe(true);
        expect(details1.messages[0].includes(MIGRATION_SUPPORT_MSG)).toBe(true);

        const details2 = prepareReqStatusForApiResp({status: REQ_STATUS.INVALID});
        expect(details2.status).toBe(REQ_STATUS.INVALID);
        expect(details2.messages.length).toBe(1);
        expect(details2.messages[0].startsWith('Migration request has been received but the request is invalid.')).toBe(true);
        expect(details2.messages[0].includes(MIGRATION_SUPPORT_MSG)).toBe(true);

        const details3 = prepareReqStatusForApiResp({status: REQ_STATUS.SIG_VALID, mainnet_address: 'xyz'});
        expect(details3.status).toBe(REQ_STATUS.SIG_VALID);
        expect(details3.messages[0].startsWith('You have requested migration for the mainnet address xyz')).toBe(true);
        expect(details3.messages[1]).toBe('Your request has been received. Waiting for sufficient confirmations to begin the migration.');

        const details4 = prepareReqStatusForApiResp({status: REQ_STATUS.TXN_PARSED, mainnet_address: 'xyz', is_vesting: true, erc20: '9194775499990000000000'});
        const [i1, l1] = getTokenSplit({erc20: '9194775499990000000000'}, true);
        expect(details4.status).toBe(REQ_STATUS.TXN_PARSED);
        expect(details4.messages[0].startsWith('You have requested migration for the mainnet address xyz')).toBe(true);
        expect(details4.messages[0].endsWith('have opted for vesting bonus.')).toBe(true);
        expect(details4.messages[1]).toBe('Your request has been received and successfully parsed. It will be migrated soon.');
        expect(details4.messages[2]).toBe(`You will receive ${i1} soon and the remaining ${l1} will be given along with a bonus as part of vesting.`);

        const details5 = prepareReqStatusForApiResp({status: REQ_STATUS.TXN_PARSED, mainnet_address: 'xyz', is_vesting: false, erc20: '9194775499990000000000'});
        const [i3, ] = getTokenSplit({erc20: '9194775499990000000000'}, false);
        expect(details5.status).toBe(REQ_STATUS.TXN_PARSED);
        expect(details5.messages[0].startsWith('You have requested migration for the mainnet address xyz')).toBe(true);
        expect(details5.messages[0].endsWith('have not opted for vesting bonus.')).toBe(true);
        expect(details5.messages[1]).toBe('Your request has been received and successfully parsed. It will be migrated soon.');
        expect(details5.messages[2]).toBe(`You will receive ${i3} soon.`);

        const details6 = prepareReqStatusForApiResp({status: REQ_STATUS.TXN_CONFIRMED, mainnet_address: 'xyz', is_vesting: true, erc20: '9194775499990000000000'});
        const [i4, l4] = getTokenSplit({erc20: '9194775499990000000000'}, true);
        expect(details6.status).toBe(REQ_STATUS.TXN_CONFIRMED);
        expect(details6.messages[0].startsWith('You have requested migration for the mainnet address xyz')).toBe(true);
        expect(details6.messages[0].endsWith('have opted for vesting bonus.')).toBe(true);
        expect(details6.messages[1]).toBe('Your request has been received and has had sufficient confirmations. It will be migrated soon.');
        expect(details6.messages[2]).toBe(`You will receive ${i4} soon and the remaining ${l4} will be given along with a bonus as part of vesting.`);

        const details7 = prepareReqStatusForApiResp({status: REQ_STATUS.TXN_CONFIRMED, mainnet_address: 'xyz', is_vesting: false, erc20: '9194775499990000000000'});
        let [i5, ] = getTokenSplit({erc20: '9194775499990000000000'}, false);
        expect(details7.status).toBe(REQ_STATUS.TXN_CONFIRMED);
        expect(details7.messages[0].startsWith('You have requested migration for the mainnet address xyz')).toBe(true);
        expect(details7.messages[0].endsWith('have not opted for vesting bonus.')).toBe(true);
        expect(details7.messages[1]).toBe('Your request has been received and has had sufficient confirmations. It will be migrated soon.');
        expect(details7.messages[2]).toBe(`You will receive ${i5} soon.`);

        const details8 = prepareReqStatusForApiResp({status: REQ_STATUS.INITIAL_TRANSFER_DONE, mainnet_address: 'xyz', is_vesting: true, erc20: '9194775499990000000000', migration_txn_hash: 'abc'});
        const [i6, l6] = getTokenSplit({erc20: '9194775499990000000000'}, true);
        expect(details8.status).toBe(REQ_STATUS.INITIAL_TRANSFER_DONE);
        expect(details8.messages[0].startsWith('You have requested migration for the mainnet address xyz')).toBe(true);
        expect(details8.messages[0].endsWith('have opted for vesting bonus.')).toBe(true);
        expect(details8.messages[1]).toBe('Your request has been processed successfully and tokens have been sent to your mainnet address in block 0xabc.');
        expect(details8.messages[2]).toBe(`You have been given ${i6} and the remaining ${l6} will be given along with a bonus as part of vesting.`);

        const details9 = prepareReqStatusForApiResp({status: REQ_STATUS.INITIAL_TRANSFER_DONE, mainnet_address: 'xyz', is_vesting: false, erc20: '9194775499990000000000', migration_txn_hash: 'abc'});
        let [i7, ] = getTokenSplit({erc20: '9194775499990000000000'}, false);
        expect(details9.status).toBe(REQ_STATUS.INITIAL_TRANSFER_DONE);
        expect(details9.messages[0].startsWith('You have requested migration for the mainnet address xyz')).toBe(true);
        expect(details9.messages[0].endsWith('have not opted for vesting bonus.')).toBe(true);
        expect(details9.messages[1]).toBe('Your request has been processed successfully and tokens have been sent to your mainnet address in block 0xabc.');
        expect(details9.messages[2]).toBe(`You have been given ${i7}.`);
    });

    afterAll(() => {
        process.env.DOCK_ERC_20_VAULT_ADDR = vaultReal;
    });
});

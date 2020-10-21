import {getNewWeb3MainnetClient, getTransactionAsDockERC20Transfer, getTransactionWithLogs} from "../src/eth-txn-utils";

require('dotenv').config();

describe('Get and parse ethereum txns', () => {
  let web3Client;

  beforeAll(async (done) => {
    web3Client = getNewWeb3MainnetClient();
    done();
  }, 5000);

  test('Get mainnet txn and parse as ERC-20', async () => {
    const txnHash = '0xc17989dcd3ed0181d251764d45c6db0e2ca4b7260f23a0d99364a131d7e960b9';
    const txn = await getTransactionWithLogs(web3Client, txnHash);
    expect(txn.status).toBe(true);
    expect(txn.from.toLowerCase()).toBe('0xb41f837f9d344b0561da3564b054236fdc8258c9');
    expect(txn.to.toLowerCase()).toBe(process.env.DOCK_ERC_20_ADDR);
    expect(txn.logs.length).toBe(1);
  }, 5000);

  test('Get from, to, amount from Dock ERC-20', async () => {
    const txnHash = '0x5e618464858638cb8b4df51db776c7293d138b170103a999644de87aa93d138a';
    const transfer = await getTransactionAsDockERC20Transfer(web3Client, txnHash);
    expect(transfer.from.toLowerCase()).toBe('0xa24ca79d901aea51dd6296071ed6717aeb2031fd');
    expect(transfer.to.toLowerCase()).toBe('0x9050292324a20ce723e073e18ad812b5b218f032');
    expect(transfer.value).toBe("84000000000000000000");
  }, 5000);
});
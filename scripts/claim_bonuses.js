// Script to claim bonuses for recepients. As the no of recepients is much lower than expected, we have decided to submit bonus claims for them saving them the effort.

import { DockNodeClient } from '../src/dock-node-utils';
import { getLastBlock, getBlockNo } from '@docknetwork/sdk/utils/chain-ops';
const { asDockAddress } = require("@docknetwork/sdk/utils/codec.js")

require('dotenv').config();

const secretUri = '';
const sender = '3EjNXTpMJieqEF5Fj5szwAqpvmmKFG3YtsY5eBazxaCkNtoz';

// First batch of bonus claims in 0x53c23f5388be6921c313d6e20f7bf8da5f68773eb5b11e5a3e7e52418339d3c5 for fee of 37.4 tokens
// 2nd batch of bonus claims in 0x5d7e35f593637504a81c96fd29a5858f2584bbd38a1555b6441ca0ce367785f2 for fee of 17.3 tokens
// 3rd batch of bonus claims in 0x3afb06dfff4bdb75f86e3af719b885ba14e70b8761d2f8695897b76391284c90 for fee of 4.4 tokens
// 4th batch of bonus claims in 0xfae623d8c5735b7ba617f25c9df50e48a6cf2ac5cb181292bac654328ee41482 for fee of 12.9 tokens

void async function() {
  const dockClient = new DockNodeClient();
  await dockClient.start();

  const block = await getLastBlock(dockClient.handle.api);
  const currentBlockNum = getBlockNo(block);
  console.log(`Current block number is ${currentBlockNum}`);

  const bonuses = await dockClient.handle.api.query.migrationModule.bonuses.entries();
  console.log(`Pending bonuses ${bonuses.length}`);

  const addrs = [];
  const blockNumbers = new Set();
  bonuses.forEach(element => {
    const addr = asDockAddress(element[0]._args[0], 'main');
    // console.log(addr);
    const bonus = dockClient.handle.api.createType('Option<Bonus>', element[1]).unwrap();
    // console.log(bonus);
    // console.log(bonus.swap_bonuses);
    // console.log(bonus.vesting_bonuses);
    let added = false
    bonus.swap_bonuses.forEach(s => {
      const num = s[1].toNumber();
      blockNumbers.add(num);
      // console.log(num);
      if (!added && num < currentBlockNum) {
        addrs.push(addr);
        added = true;
      }
    })
  });
  console.log(`Found ${addrs.length} addresses`);

  const txs = addrs.map(a => {
    return dockClient.handle.migrationModule.claimBonusForOther(a);
  });
  const txBatch = dockClient.handle.api.tx.utility.batch(txs);
  console.log(`Batch size is ${txBatch.encodedLength}`);
  console.info(`Payment info of batch is ${(await txBatch.paymentInfo(sender))}`);

  const nums = [...blockNumbers];
  nums.sort();
  console.log(nums.reverse());
  
  /* const account = dockClient.handle.keyring.addFromUri(secretUri);
  dockClient.handle.setAccount(account);
  const bal1 = await dockClient.handle.poaModule.getBalance(sender);
  const r = await dockClient.handle.signAndSend(txBatch, false);
  console.info(`block ${r.status.asInBlock}`);
  const bal2 = await dockClient.handle.poaModule.getBalance(sender);
  console.info(`Fee paid is ${parseInt(bal1[0]) - parseInt(bal2[0])}`); */

  process.exit();
}()

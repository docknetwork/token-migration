// Fetch a txn receipt using its hash and try to parse it as a Dock ERC-20 `transfer`
import Web3 from "web3";
import {TRANSFER_EVENT_TYPE} from "./constants";

export async function getTransactionAsDockERC20Transfer(web3Client, txnHash) {
    const txn = await getTransactionWithLogs(web3Client, txnHash);
    return parseTxnAsDockERC20Transfer(web3Client, txn);
}

// Given a txn receipt, try to parse it as a Dock ERC-20 `transfer`
export function parseTxnAsDockERC20Transfer(web3Client, txn) {
    // `txn` is the output of the JSON-RPC call `eth_getTransactionReceipt`.
    if ((typeof txn === 'object')
        // the intended target (`to`) of the `txn` is Dock's ERC-20 contract
        && (txn.to.toLowerCase() === process.env.DOCK_ERC_20_ADDR)
        // `txn` should have 1 and only 1 log
        && txn.logs && (txn.logs.length === 1)) {
        return parseLogAsDockERC20Transfer(web3Client, txn.logs[0]);
    }
    throw new Error('Not a DOCK ERC-20 transfer')
}

// Try to parse the log as the `Transfer` event of contract
// The consumer of this function should check that the recipient is Dock's vault address
function parseLogAsDockERC20Transfer(web3Client, log) {
    try {
        const transfer = web3Client.eth.abi.decodeLog(
            TRANSFER_EVENT_TYPE,
            log.data,
            [log.topics[1], log.topics[2]]  // Event has a name so skip the first log
        );
        return {from: transfer.from, to: transfer.to, value: transfer.value};
    } catch (e) {
        throw new Error(`Error while parsing txn log ${e}`)
    }
}

export async function getTransactionWithLogs(web3Client, txnHash) {
    // TODO: What about confirmations
    const txn = await web3Client.eth.getTransactionReceipt(txnHash);
    return txn;
}

export function getNewWeb3MainnetClient() {
    return new Web3(new Web3.providers.HttpProvider(process.env.ETH_NODE_ENDPOINT));
}

export function getNewWeb3TestClient() {
    // Assumes test node runs on a fixed endpoint, used by ganache by default
    return new Web3(new Web3.providers.HttpProvider('http://127.0.0.1:8545'));
}
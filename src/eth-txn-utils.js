// Fetch a txn receipt using its hash and try to parse it as a Dock ERC-20 `transfer`
import Web3 from "web3";
import {TRANSFER_EVENT_TYPE} from "./constants";

export async function getTransactionAsDockERC20Transfer(web3Client, txnHash) {
    const txn = await getTransactionWithLogs(web3Client, txnHash);
    return parseTxnAsDockERC20Transfer(web3Client, txn);
}

export async function getTransactionAsDockERC20TransferToVault(web3Client, txnHash) {
    const txn = await getTransactionWithLogs(web3Client, txnHash);
    return parseTxnAsERC20TransferToRecip(web3Client, txn, process.env.DOCK_ERC_20_ADDR, process.env.DOCK_ERC_20_VAULT_ADDR);
}

// Given a txn receipt, try to parse it as a `transfer` of Dock's ERC-20 contract
// Returns an object {from: <sender address>, to: <recip address>, value: <amount in wei>}
export function parseTxnAsDockERC20Transfer(web3Client, txn) {
    return parseTxnAsERC20Transfer(web3Client, txn, process.env.DOCK_ERC_20_ADDR);
}

// Given a txn receipt, try to parse it as a `transfer` of an ERC-20 contract.
// Returns an object {from: <sender address>, to: <recip address>, value: <amount in wei>}
export function parseTxnAsERC20Transfer(web3Client, txn, contractAddress) {
    // `txn` is the output of the JSON-RPC call `eth_getTransactionReceipt`.
    if ((typeof txn === 'object')
        // the intended target (`to`) of the `txn` is ERC-20 contract
        && (txn.to.toLowerCase() === contractAddress)
        // `txn` should have 1 and only 1 log
        && txn.logs && (txn.logs.length === 1)) {
        return parseLogAsDockERC20Transfer(web3Client, txn.logs[0]);
    }
    throw new Error('Not a ERC-20 transfer for the contract')
}

export function parseTxnAsERC20TransferToRecip(web3Client, txn, contractAddress, recipAddress) {
    const transfer = parseTxnAsERC20Transfer(web3Client, txn, contractAddress);
    if (transfer.to.toLowerCase() !== recipAddress) {
        throw new Error(`Transfer not intended for expected recipient but ${recipAddress}`)
    }
    return transfer;
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
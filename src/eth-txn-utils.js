// Fetch a txn receipt using its hash and try to parse it as a Dock ERC-20 `transfer`
import Web3 from "web3";
import {TRANSFER_EVENT_TYPE} from "./constants";

export async function getTransactionAsDockERC20Transfer(web3Client, txnHash) {
    const txn = await getTransactionWithLogs(web3Client, txnHash);
    return parseTxnAsDockERC20Transfer(web3Client, txn);
}

// Try to parse as txn as ERC-20 transfer of Dock's ERC-20 contract and sent to the vault address
export async function getTransactionAsDockERC20TransferToVault(web3Client, txnHash) {
    const txn = await getTransactionWithLogs(web3Client, txnHash);
    return parseTxnAsERC20TransferToRecip(web3Client, txn, process.env.DOCK_ERC_20_ADDR, process.env.DOCK_ERC_20_VAULT_ADDR);
}

// Given a txn receipt, try to parse it as a `transfer` of Dock's ERC-20 contract
// Returns an object {from: <sender address>, to: <recip address>, value: <amount in erc20>}
export function parseTxnAsDockERC20Transfer(web3Client, txn) {
    return parseTxnAsERC20Transfer(web3Client, txn, process.env.DOCK_ERC_20_ADDR);
}

// Given a txn receipt, try to parse it as a `transfer` of an ERC-20 contract.
// Returns an object {from: <sender address>, to: <recip address>, value: <amount in erc20>}
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

// Try to parse as txn as ERC-20 transfer of given contract and sent to given recipient
export function parseTxnAsERC20TransferToRecip(web3Client, txn, contractAddress, recipAddress) {
    const transfer = parseTxnAsERC20Transfer(web3Client, txn, contractAddress);
    if (transfer.to.toLowerCase() !== recipAddress) {
        throw new Error(`Transfer not intended for expected recipient but ${recipAddress}`)
    }
    return transfer;
}

// Returns true if transaction has confirmation according to the set env variable, false otherwise. Its is assumed that env
// variable will be at-least network's default (`web3.eth.transactionConfirmationBlocks`)
export async function isTxnConfirmed(web3Client, txn) {
    const blockNumber = await web3Client.eth.getBlockNumber();
    return isTxnConfirmedAsOf(txn, blockNumber);
}

export function isTxnConfirmedAsOf(txn, blockNumber) {
    if (txn.blockNumber && Number.isSafeInteger(txn.blockNumber)) {
        const age = blockNumber - (txn.blockNumber + parseInt(process.env.ETH_TXN_CONFIRMATION_BLOCKS));
        return age > 0;
    }
    // In case txn was excluded from chain due to reorg
    console.error(`Transaction did not have a safe integer as a block number ${txn.blockNumber}`);
    return false;
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

// If `onlySuccessful` is false, returns the transaction even when it failed
export async function getTransactionWithLogs(web3Client, txnHash, onlySuccessful = true) {
    const txn = await web3Client.eth.getTransactionReceipt(txnHash);
    if (txn === null) {
        throw new Error('No transaction with given hash')
    }
    if (onlySuccessful && (txn.status !== true)) {
        throw new Error('Transaction was unsuccessful')
    }
    return txn;
}

// Takes ERC-20 amount (as smallest unit) as a string and return mainnet amount as BN
export function fromERC20ToDockTokens(web3Client, amountInERC20) {
    const ercBN = new web3Client.utils.BN(amountInERC20);
    // Dock mainnet has 6 decimal places, ERC-20 has 18
    return ercBN.div(new web3Client.utils.BN('1000000000000'))
}

export function getNewWeb3MainnetClient() {
    return new Web3(new Web3.providers.HttpProvider(process.env.ETH_NODE_ENDPOINT));
}

export function getNewWeb3TestClient() {
    // Assumes test node runs on a fixed endpoint, used by ganache by default
    return new Web3(new Web3.providers.HttpProvider('http://127.0.0.1:8545'));
}
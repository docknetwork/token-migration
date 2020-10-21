// ABI of `Transfer` event
export const TRANSFER_EVENT_TYPE = [{
    type: 'address',
    name: 'from',
    indexed: true
}, {
    type: 'address',
    name: 'to',
    indexed: true
}, {
    type: 'uint256',
    name: 'value'
}];

export const MAINNET_ADDRESS_SIZE = 35;

export const TXN_HASH_SIZE = 32;

export const PAYLOAD_SIZE = MAINNET_ADDRESS_SIZE + TXN_HASH_SIZE;

// Ethereum signatures are 65 bytes
export const SIG_SIZE = 65;

// TODO: Add more addresses blacklisted by exchanges etc
export const BLACKLISTED_ETH_ADDR = [
    '0xeb31973e0febf3e3d7058234a5ebbae1ab4b8c23'
]

// Status tracked in database for each migration request passing signature verification
export const REQ_STATUS = {
    // Sender address was blacklisted
    INVALID_BLACKLIST: -2,
    // Invalid due to any reason, like txn was not for Dock's contract or was not for Dock's vault address
    INVALID: -1,
    // Signature valid but transaction not parsed to find out how many tokens to transfer.
    SIG_VALID: 0,
    // Parsed but not sufficient confirmations
    TXN_PARSED: 1,
    // Sufficient confirmations
    TXN_CONFIRMED: 2,
    ATTEMPTING_MIGRATION: 3,
    MIGRATION_DONE: 4,
}
// ABI of `Transfer` event. The event is emitted on call of `transfer` or `transferFrom` functions of the contract.
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

const MIGRATION_SUPPORT_EMAIL = 'support@dock.io';

export const MIGRATION_SUPPORT_MSG = `Please contact ${MIGRATION_SUPPORT_EMAIL} to enquire further. Share the transaction hash and your ethereum address in the email.`;

export const MICRO_DOCK = ' \u03BCDOCK';

// TODO: Add more addresses blacklisted by exchanges etc
export const BLACKLISTED_ETH_ADDR = [
    // Kucoin Sep-20 hacker
    'eb31973e0febf3e3d7058234a5ebbae1ab4b8c23',
    '0f9f22c27122301d5c7d2f9aef2c1c612d08ed34',
    '661eb74536b334fe07e3bcb20cd985ea9efd0e67'
]

// Status tracked in database for each migration request passing signature verification
export const REQ_STATUS = {
    // Sender address was blacklisted
    INVALID_BLACKLIST: -2,
    // Invalid due to any reason, like txn was not for Dock's contract or was not for Dock's vault address
    INVALID: -1,
    // Signature valid but transaction not parsed to find out how many tokens to transfer.
    SIG_VALID: 0,
    // Parsed and checked that was intended for Dock's contract and vault address but not sufficient confirmations
    TXN_PARSED: 1,
    // Sufficient confirmations
    TXN_CONFIRMED: 2,
    // Initial transfer (excluding bonus) is done.
    INITIAL_TRANSFER_DONE: 3,
    // Bonus has been calculated but not yet sent.
    BONUS_CALCULATED: 4,
    // Bonus sent
    BONUS_TRANSFERRED: 5
}

export const configFileName = 'config.json'

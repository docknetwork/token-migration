import bs58check from 'bs58check';
import bs58 from 'bs58';
import base58 from 'bs58';
import {
  ecrecover,
  fromRpcSig,
  publicToAddress,
  keccakFromString
} from 'ethereumjs-util'
import {validateAddress} from '@docknetwork/sdk/utils/chain-ops';
import {BLACKLISTED_ETH_ADDR, MAINNET_ADDRESS_SIZE, PAYLOAD_SIZE, SIG_SIZE, TXN_HASH_SIZE} from "./constants";

require('dotenv').config();

// Parse request body and verify TX hash and eth address
export function validateStatusRequest(reqBody) {
  const { address, txnHash } = reqBody;

  if (!txnHash || !address) {
    throw new Error('txnHash and address must be supplied');
  }

  // Ensure correct tx hash
  if (txnHash.length !== TXN_HASH_SIZE*2) {
    throw new Error(`txnHash must be of size ${TXN_HASH_SIZE*2} chars but was ${txnHash.length} chars`);
  }

  // Ensure address isn't blacklisted
  if (isBlacklistedAddress(address)) {
    throw new Error('Address is blacklisted');
  }

  return [address, txnHash];
}

// Parse request body and verify signature. Return mainnet address, ethereum address, transaction hash, signature and vesting indicator
export function validateMigrationRequest(reqBody, withBonus = false) {
  const [payload, sigBytes] = parseMigrationRequest(reqBody, withBonus);
  const payloadBytes = bs58.decode(payload);
  const mainnetAddress = base58.encode(payloadBytes.slice(0, MAINNET_ADDRESS_SIZE));
  // The address should be valid for the configured network type
  if (!validateAddress(mainnetAddress, process.env.DOCK_NETWORK_TYPE)) {
    throw new Error(`${mainnetAddress} is not a valid address for ${process.env.DOCK_NETWORK_TYPE}net`)
  }

  // The payload does not contain the Ethereum address, its inferred from the signature.
  const ethAddress = getAddressesFromPayloadSig(payload, sigBytes);
  // The payload is in form <Mainnet address><Eth Txn hash>[<Vesting indicator>]
  const txnHash = Buffer.from(payloadBytes.slice(MAINNET_ADDRESS_SIZE, MAINNET_ADDRESS_SIZE+TXN_HASH_SIZE)).toString('hex');

  let isVesting;
  if (withBonus) {
    const lastByte = payloadBytes.slice(MAINNET_ADDRESS_SIZE+TXN_HASH_SIZE, MAINNET_ADDRESS_SIZE+TXN_HASH_SIZE+1)[0];
    if (lastByte === 0) {
      isVesting = false;
    } else if (lastByte === 1) {
      isVesting = true;
    } else {
      throw new Error(`Vesting indicator must have been 0 or 1 but was ${lastByte}`);
    }
  } else {
    // The request was received outside the bonus window so no bonus at all
    isVesting = null;
  }
  return [mainnetAddress, ethAddress, txnHash, sigBytes.toString('hex'), isVesting];
}

/**
 * Generate keccak-256 hash for signing as per https://web3js.readthedocs.io/en/v1.2.4/web3-eth-personal.html#sign
  * @param {string} message
 * @returns {Buffer}
 */
export function hashMessageForSigning(message) {
  const prefixed = "\x19Ethereum Signed Message:\n" + message.length.toString() + message;
  return keccakFromString(prefixed);
}

/**
 * Verify signature on payload and return the address that signed the payload.
 * @param payload
 * @param sigBytes
 * @returns {string}
 */
export function getAddressesFromPayloadSig(payload, sigBytes) {
  const payloadHash = hashMessageForSigning(payload);

  let sig;
  try {
    sig = fromRpcSig('0x' + sigBytes.toString('hex'));
  } catch (e) {
    throw new Error(`Invalid signature: ${e.message}`)
  }
  let pubKey;
  try {
    pubKey = ecrecover(payloadHash, sig.v, sig.r, sig.s);
  } catch (e) {
    throw new Error(`Invalid signature: ${e.message}`)
  }
  return publicToAddress(pubKey).toString('hex');
}

// Parse request body containing payload and signature and return payload as base58-check string and signature as Buffer
export function parseMigrationRequest(reqBody, withBonus = false) {
  const { payload, signature } = reqBody;
  let sigBytes, payloadBytes;

  // Payload is in format <Mainnet address of 35 bytes><Eth txn hash of 32 bytes>[<Vesting indicator of 1 byte>]
  try {
    sigBytes = bs58.decode(signature);
  } catch (e) {
    throw new Error(`Cannot parse ${signature} as base58`);
  }
  try {
    payloadBytes = bs58check.decode(payload);
  } catch (e) {
    throw new Error(`Cannot parse ${payload} as base58-check`);
  }

  // The vesting indicator is only present with `withBonus` is true
  /*const payloadSize = PAYLOAD_SIZE + (withBonus ? 1 : 0);
  if (payloadBytes.length !== payloadSize) {
    throw new Error(`Payload must be of size ${payloadSize} bytes but was ${payloadBytes.length} bytes`);
  }*/

  if (sigBytes.length !== SIG_SIZE) {
    throw new Error(`Signature must be of size ${SIG_SIZE} bytes but was ${sigBytes.length} bytes`);
  }

  // Signature is on bytes including checksum
  return [payload, sigBytes];
}

// Check that the Ethereum address is not blacklisted
export function isBlacklistedAddress(ethAddr) {
  return BLACKLISTED_ETH_ADDR.indexOf(ethAddr) !== -1
}

// Add prefix '0x' to a hex string if not already. Doesn't check if string is hex or not
export function addPrefixToHex(string) {
  if (!string.startsWith('0x')) {
    return '0x' + string;
  }
  return string;
}

// Remove prefix '0x' from a hex string if present. Doesn't check if string is hex or not
export function removePrefixFromHex(string) {
  if (string.startsWith('0x')) {
    return string.slice(2);
  }
  return string;
}

// Check if bonus window is closed
function isBonusWindowClosed() {
  return new Date() > new Date(parseInt(process.env.BONUS_ENDS_AT, 10))
}

// Check if migration is over
function isMigrationOver() {
  return new Date() > new Date(parseInt(process.env.MIGRATION_ENDS_AT, 10))
}

// Check if bonus window is closed if trying for bonus and raise error if window closed
// Check if migration is over if not trying for bonus and raise error if migration over
export function checkReqWindow(withBonus) {
  if (withBonus && isBonusWindowClosed()) {
    throw new Error(`Bonus window is closed`)
  }

  if (!withBonus && isMigrationOver()) {
    throw new Error(`Migration is over`)
  }
}
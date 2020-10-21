import bs58check from 'bs58check';
import bs58 from 'bs58';
import base58 from 'bs58';
import {ecrecover, fromRpcSig, hashPersonalMessage, publicToAddress} from 'ethereumjs-util'
import {validateAddress} from '@docknetwork/sdk/utils/chain-ops';
import {BLACKLISTED_ETH_ADDR, MAINNET_ADDRESS_SIZE, PAYLOAD_SIZE, SIG_SIZE, TXN_HASH_SIZE} from "./constants";

require('dotenv').config();

// Parse request body and verify signature. Return mainnet address, ethereum address, transaction hash and signature
export function validateMigrationRequest(reqBody) {
  const [payloadBytes, sigBytes] = parseMigrationRequest(reqBody);
  const mainnetAddress = base58.encode(payloadBytes.slice(0, MAINNET_ADDRESS_SIZE));
  // The address should be valid for the configured network type
  if (!validateAddress(mainnetAddress, process.env.DOCK_NETWORK_TYPE)) {
    throw new Error(`${mainnetAddress} is not a valid address for ${process.env.DOCK_NETWORK_TYPE}net`)
  }
  const ethAddress = verifyPayloadSig(payloadBytes, sigBytes);
  const txnHash = Buffer.from(payloadBytes.slice(MAINNET_ADDRESS_SIZE, MAINNET_ADDRESS_SIZE+TXN_HASH_SIZE)).toString('hex');
  return [mainnetAddress, ethAddress, txnHash, sigBytes.toString('hex')];
}

// Verify signature on payload and return the address signing the payload.
export function verifyPayloadSig(payloadBytes, sigBytes) {
  const payloadHash = hashPersonalMessage(payloadBytes);
  const sig = fromRpcSig('0x' + sigBytes.toString('hex'));
  const pubKey = ecrecover(payloadHash, sig.v, sig.r, sig.s);
  return publicToAddress(pubKey).toString('hex');
}

// Parse request body containing payload and signature and return payload without checksum and signature both as Buffers
export function parseMigrationRequest(reqBody) {
  const { payload, signature } = reqBody;
  let sigBytes, payloadBytes, sig, address, txnHash;

  // Payload is in format <Mainnet address of 35 bytes><Eth txn hash of 32 bytes>
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
  if (payloadBytes.length !== PAYLOAD_SIZE) {
    throw new Error(`Payload must be of size ${PAYLOAD_SIZE} bytes but was ${payloadBytes.length} bytes`);
  }

  if (sigBytes.length !== SIG_SIZE) {
    throw new Error(`Signature must be of size ${SIG_SIZE} bytes but was ${sigBytes.length} bytes`);
  }

  // Signature is on bytes including checksum
  return [bs58.decode(payload), sigBytes];
}

// Check that the Ethereum address is not blacklisted
export function isBlacklistedAddress(ethAddr) {
  return BLACKLISTED_ETH_ADDR.indexOf(ethAddr) === -1
}


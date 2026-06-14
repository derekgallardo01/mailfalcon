#!/usr/bin/env node
// One-time generator for VAPID key pair (ECDSA P-256).
// Outputs lines suitable for `echo VALUE | wrangler secret put NAME`.

import { webcrypto } from 'node:crypto'

function b64url(buf) {
  return Buffer.from(buf)
    .toString('base64')
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '')
}

const kp = await webcrypto.subtle.generateKey(
  { name: 'ECDSA', namedCurve: 'P-256' },
  true,
  ['sign', 'verify'],
)

const publicRaw = await webcrypto.subtle.exportKey('raw', kp.publicKey)
const privateJwk = await webcrypto.subtle.exportKey('jwk', kp.privateKey)

// VAPID public key = uncompressed EC point, 65 bytes, base64url.
const VAPID_PUBLIC_KEY = b64url(new Uint8Array(publicRaw))

// VAPID private key is stored as full JWK (so we can re-import for ECDSA
// signing on the worker without re-deriving x/y from d).
const VAPID_PRIVATE_KEY_JWK = JSON.stringify(privateJwk)

console.log('VAPID_PUBLIC_KEY=' + VAPID_PUBLIC_KEY)
console.log('VAPID_PRIVATE_KEY_JWK=' + VAPID_PRIVATE_KEY_JWK)
console.log('VAPID_SUBJECT=mailto:hello@mailfalcon.app')

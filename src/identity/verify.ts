// Station identity — secp256k1 verification + PGP fingerprint, ported from
// receiver-basecamp/src/station_identity.cpp to match byte-for-byte:
//   verify: 33-byte compressed pubkey + 64-byte compact ECDSA over SHA-256(canonical-JSON-minus-sig)
//   fingerprint: SHA-256(pubkey)[0..2] → even/odd/even PGP word tables
// A v>=2 announce with an invalid signature is a forgery and must be dropped.

import { secp256k1 } from "@noble/curves/secp256k1.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { signedBytes } from "./canonical";
import { PGP_EVEN, PGP_ODD } from "./pgpWords";

function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) throw new Error("odd hex length");
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export interface Announce {
  name?: string;
  pubkey?: string;
  sig?: string;
  v?: number;
  [k: string]: unknown;
}

/** True if this announce carries a signed (v>=2) identity we can verify. */
export function isSigned(a: Announce): boolean {
  return (a.v ?? 1) >= 2 && typeof a.pubkey === "string" && typeof a.sig === "string";
}

/**
 * Verify a signed announce. Returns true only for a valid secp256k1 signature over the canonical
 * bytes. Unsigned (v<2) announces return false here — treat them as anonymous, not verified.
 */
export function verifyAnnounce(a: Announce): boolean {
  if (!isSigned(a)) return false;
  const pub = a.pubkey as string;
  const sig = a.sig as string;
  if (pub.length !== 66 || sig.length !== 128) return false; // 33 + 64 bytes, lowercase hex
  try {
    const digest = sha256(signedBytes(a as Record<string, unknown>)); // SHA-256(canonical minus sig)
    return secp256k1.verify(hexToBytes(sig), digest, hexToBytes(pub)); // low-S enforced (matches libsecp256k1)
  } catch {
    return false;
  }
}

/** The 3-word PGP fingerprint for a compressed pubkey hex, e.g. "newborn vocalist uncut". "" if invalid. */
export function fingerprint(pubkeyHex: string): string {
  let pub: Uint8Array;
  try {
    pub = hexToBytes(pubkeyHex);
  } catch {
    return "";
  }
  if (pub.length !== 33) return "";
  const h = sha256(pub);
  return `${PGP_EVEN[h[0]]} ${PGP_ODD[h[1]]} ${PGP_EVEN[h[2]]}`;
}

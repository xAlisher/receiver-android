// Round-trip proof the JS identity module matches the C++ contract (station_identity.cpp):
// build an announce, sign it the way booth does (canonical minus sig → sha256 → compact secp256k1),
// then verify + tamper-check + fingerprint-determinism. Run: npx tsx src/identity/identity.test.ts
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { signedBytes, canonicalize } from "./canonical";
import { verifyAnnounce, fingerprint, isSigned } from "./verify";

function bytesToHex(b: Uint8Array): string {
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}
let pass = 0,
  fail = 0;
function check(name: string, cond: boolean) {
  if (cond) {
    pass++;
    console.log("  ✓ " + name);
  } else {
    fail++;
    console.log("  ✗ " + name);
  }
}

// --- a booth-style signer (mirrors buildAnnouncePayload + station_identity signHex) ---
const sk = new Uint8Array(32).map((_, i) => i + 1); // seckey = 1..32, same as C++ selfTest
const pub = secp256k1.getPublicKey(sk, true); // 33-byte compressed
const pubHex = bytesToHex(pub);

const base = {
  name: "Test Station",
  streamUrl: "http://abcdef.onion/live/audio.m3u8",
  nowPlaying: "Kode9 — Live Set",
  keySource: "autogen",
  v: 2,
  pubkey: pubHex,
};
// sign canonical(base) — no sig field yet
const digest = sha256(signedBytes(base));
const sig = secp256k1.sign(digest, sk); // compact by default in noble v2
const sigHex = bytesToHex(sig.toCompactRawBytes ? sig.toCompactRawBytes() : (sig as unknown as Uint8Array));
const announce = { ...base, sig: sigHex };

console.log("station identity round-trip:");
check("isSigned(v2 + pubkey + sig)", isSigned(announce));
check("verifyAnnounce accepts a valid signature", verifyAnnounce(announce) === true);
check("tampered name is rejected", verifyAnnounce({ ...announce, name: "Evil Station" }) === false);
check("wrong-key is rejected", verifyAnnounce({ ...announce, pubkey: bytesToHex(secp256k1.getPublicKey(new Uint8Array(32).fill(9), true)) }) === false);
check("unsigned v1 announce is not 'verified'", verifyAnnounce({ name: "x", v: 1 }) === false);

console.log("canonical serialization (Qt compact = sorted keys, no spaces):");
check(
  "keys sorted, compact",
  canonicalize({ b: 1, a: "x", c: [3, 2] }) === '{"a":"x","b":1,"c":[3,2]}'
);
check("sig excluded from signed bytes", !new TextDecoder().decode(signedBytes(announce)).includes('"sig"'));

console.log("fingerprint:");
const fp = fingerprint(pubHex);
check("fingerprint is 3 words", fp.split(" ").length === 3 && fp.length > 5);
check("fingerprint deterministic", fingerprint(pubHex) === fp);
console.log("    → " + fp + "  (pubkey " + pubHex.slice(0, 16) + "…)");

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);

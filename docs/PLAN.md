# receiver-android — plan

## Mission
Bring the Logos radio **listener** to Android: discover stations over the delivery/Waku layer, verify their
secp256k1 identity, and play `.onion` HLS over Tor — as a React Native app. Interop with the existing
desktop `receiver-basecamp` / `booth-basecamp` (same topics, same announce schema, same fingerprints).

## Architecture — decision pending research (3 spikes in flight)
The whole shape hinges on three unknowns, each under active research:

| Spike | Question | Options | Decision |
|-------|----------|---------|----------|
| **Waku transport** | How does an RN app receive the same Waku messages? | js-waku light node · go-waku `.aar` native module · nwaku REST bridge | _pending_ |
| **Tor** | How to route `.onion` HLS through Tor on Android? | Embedded Arti / tor-android · Orbot SOCKS | _pending_ |
| **Interop** | Exact cluster/shard/content-topic + announce + sig scheme | (from delivery upstream) | _pending_ |

Crypto (secp256k1 verify) is settled-ish: `@noble/curves` in JS.

## Epics (GitHub issues to be filed once architecture lands)
- **E1 — Scaffold**: RN app (TypeScript, Hermes), Android project, CI-less local build onto the device.
- **E2 — Delivery/Waku transport**: receive announces from the directory topic (the chosen path).
- **E3 — Identity verification**: secp256k1 verify + 3-word PGP fingerprint (port `pgp_words` + canonical serialization).
- **E4 — Tor**: local SOCKS5 for `.onion` (embedded tor or Orbot), bootstrap status UI.
- **E5 — Playback**: `.onion` HLS through Tor via ExoPlayer/Media3, background audio, now-playing.
- **E6 — UI/UX**: station list, fingerprints, pin, connection/loading states — the identity-first look.
- **E7 — Test on device**: end-to-end against a live station (PSR on Sneg) on the connected phone.

## Interop contract (to be confirmed by the delivery spike)
- Directory content topic: `~/…/directory/json` (exact string TBD)
- Announce JSON: `name, streamUrl, nowPlaying, description, pubkey, sig, keySource, announceTopic, privacy, v`
- Signature: secp256k1 ECDSA, 64-byte compact, over SHA-256 of canonical JSON (obj minus `sig`), 33-byte compressed pubkey
- Fingerprint: 3 PGP words from SHA-256(pubkey) (even/odd/even word lists)

## Principles
- **Interop-first**: a station broadcast from desktop `booth` must appear + verify + play on the phone.
- **No server**: no custom backend; talk Waku + Tor directly (or via a public service node if unavoidable — flag it).
- **Ship thin**: prove the end-to-end path (discover → verify → play one station) before polishing.

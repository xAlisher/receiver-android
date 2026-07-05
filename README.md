# receiver-android

**Listen to decentralized [Logos](https://github.com/logos-co) radio on your phone.** A React Native
Android app that discovers stations broadcast over the Logos **delivery / Waku** messaging layer, verifies
each station's **secp256k1 identity** (the same fingerprints the desktop [Receiver](https://github.com/xAlisher/receiver-basecamp)
shows), and plays their **`.onion` HLS** streams over **Tor** — no server, no account, no app store gatekeeper.

> Sibling of [`receiver-basecamp`](https://github.com/xAlisher/receiver-basecamp) (desktop, Qt/QML) and
> [`booth-basecamp`](https://github.com/xAlisher/booth-basecamp) (the broadcaster). This brings the
> *listener* to mobile.

## Status

🧪 **Discover + verify + LISTEN all work on a real phone.** Built autonomously in one session — a decentralized, identity-verified, Tor-hidden radio station playing on Android.

| Piece | State |
|-------|-------|
| **Scaffold** (RN 0.86, TS, Hermes) | ✅ builds + runs on device (Galaxy S20 FE, Android 13) |
| **Identity** (secp256k1 verify + PGP fingerprint) | ✅ interop-proven vs a **real** PSR announce (`backfield aftermath frighten`) |
| **Discovery** (Waku cluster 2 → REST → phone) | ✅ **live PSR verified on the phone** over the real network |
| **Playback** (Tor .onion HLS) | ✅ **audio plays on device** — ExoPlayer → OkHttp SOCKS → Tor → onion HLS (`?cookieCheck=1` gate solved) |

Architecture: **REST-bridge** discovery (a nwaku node peered into cluster 2, polled via `fetch`), embedded
`.aar` as the future P2P upgrade. Playback = react-native-video + a Kotlin OkHttp-SOCKS plugin over Tor.
See [`docs/PLAN.md`](docs/PLAN.md) + the [Issues](https://github.com/xAlisher/receiver-android/issues).

## Run it

```bash
scripts/run-waku-node.sh                      # nwaku node → cluster 2, REST :8645
adb reverse tcp:8645 tcp:8645                 # phone → node (dev, over USB)
adb reverse tcp:9050 tcp:9050                 # phone → host tor (for onion playback)
npx react-native run-android                  # build + install + launch (JDK 17)
```
The phone discovers live stations (e.g. Parallel Society Radio on Sneg), verifies their identity, and shows
the same fingerprints as desktop.

## What it has to do

1. **Discover** — subscribe to the Logos delivery directory topic over Waku and receive live station announces.
2. **Verify** — check each announce's secp256k1 signature; show the 3-word PGP fingerprint (`newborn vocalist uncut`).
3. **Play** — stream a station's `.onion` HLS over Tor (ExoPlayer/Media3 through a local Tor SOCKS proxy).
4. **Feel native** — station list, now-playing, background audio, the same identity-first UX as desktop.

## The hard parts (being researched)

- **Waku on RN** — js-waku light node vs go-waku native binding vs a service-node REST bridge.
- **Tor on Android** — embedded tor (Arti / tor-android) vs Orbot, exposing a local SOCKS5 for `.onion` HLS.
- **Interop** — matching the delivery layer's cluster/shard/content-topic + announce schema exactly.

## Build

_TBD once the stack is chosen (see PLAN.md). Target: `npx react-native run-android` onto a connected device._

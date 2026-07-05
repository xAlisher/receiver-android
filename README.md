# receiver-android

**Listen to decentralized [Logos](https://github.com/logos-co) radio on your phone.** A React Native
Android app that discovers stations broadcast over the Logos **delivery / Waku** messaging layer, verifies
each station's **secp256k1 identity** (the same fingerprints the desktop [Receiver](https://github.com/xAlisher/receiver-basecamp)
shows), and plays their **`.onion` HLS** streams over **Tor** — no server, no account, no app store gatekeeper.

> Sibling of [`receiver-basecamp`](https://github.com/xAlisher/receiver-basecamp) (desktop, Qt/QML) and
> [`booth-basecamp`](https://github.com/xAlisher/booth-basecamp) (the broadcaster). This brings the
> *listener* to mobile.

## Status

🧪 **Experiment / early build.** See [`docs/PLAN.md`](docs/PLAN.md) for the architecture + epic plan and the
[Issues](https://github.com/xAlisher/receiver-android/issues) for progress.

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

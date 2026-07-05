# Logos Messaging on Android — build fork-tree (red-team log)

Goal: build `liblogosdelivery.so` (Logos Messaging = the `logos-messaging/logos-delivery` Nim library,
the rebranded nwaku "new Waku") for **Android arm64-v8a**, embed it in the receiver-android RN app via JNI,
and run an **in-app Waku light node** on **cluster 2** — no external nwaku node. *No known app runs Logos
Messaging on mobile yet; this would be the first.*

Every decision, win, and wall is logged below (fieldcraft `red-team-fork-tree`). Timestamps 2026-07-05.

## Decisions
- **D1 — Build logos-delivery's own Android target, not nwaku's `.aar`.** Research found logos-delivery
  `master` has a complete Android path (`Makefile:504` `liblogosdelivery-android-arm64` → nimble
  `libLogosDeliveryAndroid`, `config.nims` NDK block, `scripts/build_rln_android.sh`), cluster-2-native
  (`LogosDevConf`, RLN off), with an RN reference app (`examples/mobile/`, `waku_ffi.c` JNI bridge).
  Output = raw `.so` (drop into `jniLibs/arm64-v8a/`), simpler than an `.aar`. nwaku's `libwaku-android-arm64`
  `.aar` is unnecessary (D-rejected).
- **D2 — Bypass the flake devShell; use nixpkgs `nim` + rustup + system NDK.** The flake's custom nimble
  override doesn't build (see W2).

## Wins ✓
- **W1** — Android target exists in-repo (`make liblogosdelivery-android-arm64`). Not a cross-compile
  research project; the chronos-epoll fix (`-d:chronosEventEngine=epoll`, nwaku #3705) + RLN cross-compile
  are already wired. → it's a build task.
- **W2-fix** — nixpkgs `nim` = 2.2.10 works; `make deps` bootstraps its own `nimble 0.22.3` from source and
  fetches nim deps. System `rustup` has `aarch64-linux-android` target; NDK 27.1 has `aarch64-linux-android30-clang`.
- **W3** — logos-delivery vendors only `zerokit` as a git submodule; nim deps (libp2p/chronos) come via
  nimble — so a shallow clone + `make deps` is enough (no giant submodule tree).

## Walls / fails ✗
- **W-fail-1 — flake devShell broken.** `nix develop` fails building its custom `nimble-0.22.3` override:
  `Error: cannot open file: sat/sat` (the override doesn't vendor nimble's `sat` SAT-solver dep). → D2:
  bypass with nixpkgs `nim`.
- **W-fail-2 — nixpkgs `nim2`/`nim_2` removed** ("upgraded and removed, please use 'nim'", 2026-03-06). →
  use `nixpkgs#nim` (now 2.2.10).

## Reproduce (so far)
```bash
git clone --recurse-submodules --shallow-submodules https://github.com/logos-messaging/logos-delivery
cd logos-delivery
export ANDROID_NDK_HOME=~/Android/Sdk/ndk/27.1.12297006
export PATH="$HOME/.cargo/bin:$PATH"   # rustup rust + aarch64-linux-android target
nix shell nixpkgs#nim nixpkgs#git nixpkgs#gnumake nixpkgs#gcc --command bash -c '
  make deps
  make liblogosdelivery-android-arm64   # → build/android/arm64-v8a/{liblogosdelivery.so, librln.so}
'
```

## Status: 🔨 in progress — `make deps` bootstrapped; next is the arm64 cross-compile (RLN + Nim).
_(updated as walls are hit)_

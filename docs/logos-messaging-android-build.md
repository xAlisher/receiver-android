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
- **W-fail-3 — Nim compile: `No nat_traversal package under nimbledeps/pkgs2/ — run 'make build-deps' first`.**
  `make deps` only bootstraps `nimble`; it does NOT populate the nim dependency set. The android target's
  `deps` prereq is insufficient. → run **`make build-deps`** (fetches+builds nat_traversal, nim-libp2p,
  chronos, … into `nimbledeps/pkgs2/`) BEFORE the android target.

## More wins ✓
- **W4 — `librln.so` for Android arm64 BUILT.** `scripts/build_rln_android.sh` → `cross rustc
  --target=aarch64-linux-android` (Docker) compiled zerokit RLN v2.0.2 (ark-groth16 etc.) → 7 MB
  `build/android/arm64-v8a/librln.so` (verified `ELF 64-bit LSB, ARM aarch64`). The RLN-for-Android
  blocker — the thing most likely to be a wall — **cleared on the first try.** (Docker `cross-rs/
  aarch64-linux-android:edge` image is 4.2 GB — prune after the build to reclaim root.)
- **W5 — `nimbledeps` populated + `nat_traversal` cross-compiled.** After W-fail-4 fix, `make build-deps`
  ran nimble-setup from `nimble.lock` → `nimbledeps/pkgs2/` (bearssl, boringssl, nat_traversal, …), and
  `rebuild-nat-libs-nimbledeps` cross-compiled miniupnpc + libnatpmp with the NDK clang.

## Walls / fails ✗ (cont.)
- **W-fail-4 — `build-nph` → `could not load: libcrypto.so.3`.** The `nimbledeps/.nimble-setup` stamp
  depends on `build-nph` (installs the `nph` formatter via nimble), which failed loading OpenSSL at
  runtime → stamp never created → `nat_traversal` absent → Nim compile aborts. Fix:
  `LD_LIBRARY_PATH=$(nix eval --raw nixpkgs#openssl.out)/lib` before `make build-deps`.
- **W-fail-5 — Makefile non-nix-RLN branch SKIPS the Nim compile.** `build-liblogosdelivery-for-android-arch`
  only runs `nimble libLogosDeliveryAndroid` (the actual `.so` compile) in the `ifneq /nix/store LIBRLN`
  branch; the `else` (our path, RLN built by `build_rln_android.sh`) does RLN + nat-libs then STOPS. So
  `make liblogosdelivery-android-arm64` alone never emits `liblogosdelivery.so` unless RLN comes from nix.
  Fix: after RLN is built, invoke `nimble libLogosDeliveryAndroid` directly with
  `CPU=arm64 ABIDIR=arm64-v8a ANDROID_TOOLCHAIN_DIR=… ANDROID_COMPILER=aarch64-linux-android30-clang`
  (compile line: `nim c --os:android -d:androidNDK -d:chronosEventEngine=epoll --passL:-lrln --passL:-llog …`).
- **W-fail-6 — `nat_traversal` C libs linked as host x86_64 → `libminiupnpc.a is incompatible with
  aarch64linux`.** `build-deps` builds miniupnpc/libnatpmp for the HOST; the android target's
  `rebuild-nat-libs` saw them "up to date" and skipped, so the arm64 link pulled x86_64 `.a`s. → clean the
  `.a`/`.o` first to force a rebuild.
- **W-fail-7 — the forced rebuild fails: `rebuild-nat-libs-nimbledeps` bakes `-mssse3` from the HOST arch.**
  `Nat.mk` sets `PORTABLE_NAT_MARCH := -mssse3` when `NAT_UNAME_M == x86_64` (the build host) — an x86 flag
  the arm64 clang rejects → miniupnpc build `Error 2` → no `.a`. Cross-compile bug. → pass
  **`NAT_UNAME_M=aarch64`** to the rebuild so `-mssse3` is dropped, with `CC=<aarch64-linux-android30-clang>`,
  then re-link. *(The Makefile's android path never actually produces a working arm64 nat-lib on its own —
  this is the core reason no one's shipped it on mobile.)*

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

## 🏆 W6 — BUILT. `liblogosdelivery.so` for Android arm64.
375k lines of Nim/Waku compiled clean (`SuccessX`, 31s), linked against the arm64 `librln.so` + nat-libs.
`ELF 64-bit LSB, ARM aarch64`. Exports the real node API — `logosdelivery_create_node / _start_node /
_subscribe / _send / _set_event_callback / _stop_node / _destroy`, plus `waku_new`, `waku_relay_*`,
`waku_filter_subscribe`. **First-ever Logos Messaging build for Android.**
- Stripped 139M → **28M** (`llvm-strip --strip-unneeded`), 55 FFI symbols retained.
- Vendored: `android/app/src/main/jniLibs/arm64-v8a/{liblogosdelivery.so, librln.so}`.

## Full reproduce (all walls cleared)
```bash
git clone --recurse-submodules --shallow-submodules https://github.com/logos-messaging/logos-delivery && cd logos-delivery
export ANDROID_NDK_HOME=~/Android/Sdk/ndk/27.1.12297006
export ANDROID_TOOLCHAIN_DIR=$ANDROID_NDK_HOME/toolchains/llvm/prebuilt/linux-x86_64
CLANG=$ANDROID_TOOLCHAIN_DIR/bin/aarch64-linux-android30-clang
export TMPDIR=/extra/tmp PATH="$HOME/.cargo/bin:$PATH"      # rustup + aarch64-linux-android target
OSSL=$(nix eval --raw nixpkgs#openssl.out)/lib
nix shell nixpkgs#nim nixpkgs#git nixpkgs#gnumake nixpkgs#gcc nixpkgs#cmake nixpkgs#pkg-config nixpkgs#openssl --command bash -c "
  export PATH=\$HOME/.nimble/bin:\$PATH LD_LIBRARY_PATH=$OSSL
  export CPU=arm64 ABIDIR=arm64-v8a ANDROID_ARCH=aarch64-linux-android ANDROID_COMPILER=aarch64-linux-android30-clang ANDROID_TOOLCHAIN_DIR=$ANDROID_TOOLCHAIN_DIR
  make deps                                                 # bootstraps nimble
  make build-deps                                           # W-fail-4: needs LD_LIBRARY_PATH=openssl
  make liblogosdelivery-android-arm64                       # builds librln.so + nat-libs (W-fail-5: stops here)
  make rebuild-nat-libs-nimbledeps CC=$CLANG NAT_UNAME_M=aarch64   # W-fail-6/7: force arm64 nat-libs, drop -mssse3
  nimble libLogosDeliveryAndroid                            # the actual .so compile+link
"
# → build/android/arm64-v8a/{liblogosdelivery.so, librln.so}; strip with llvm-strip.
```

## Status: ✅ **`.so` BUILT + vendored.** Next: JNI bridge (`waku_ffi.c` template) + RN native module +
swap `restSource` for the native Waku event stream → phone is its own Logos Messaging node (no REST node).

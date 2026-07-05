# receiver-android — agent instructions

React Native (Android-first) listener for Logos radio. Sibling of `../receiver-basecamp` (desktop, the
interop reference) and `../booth-basecamp` (broadcaster). Read `docs/PLAN.md` for architecture + epics.

- **Interop reference**: `../receiver-basecamp/src/receiver_ui_backend.cpp` (`ingestAnnounce`) + `src/station_identity.*`
  (secp256k1 sig scheme) + `src/pgp_words.h` (fingerprint word lists). Match these exactly.
- **Device**: a physical Android phone is connected via ADB (Samsung SM-G780G). Build/test with
  `npx react-native run-android`; drive UI tests via the android MCP tools.
- Keep the build log discipline: save gradle/metro failures under `logs/`.

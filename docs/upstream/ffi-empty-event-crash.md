# FFI crash: `callEventCallback` dereferences nil on empty-string events (SIGSEGV)

- **Repo:** [`logos-messaging/nim-ffi`](https://github.com/logos-messaging/nim-ffi) — the `ffi` nimble package (`packageName = "ffi"`, "FFI framework with custom header generation", Institute of Free Technology). Default branch: `master`.
- **File:** `ffi/ffi_context.nim`, template `callEventCallback` (RET_OK and RET_ERR call sites).
- **Affected versions:** `v0.1.3`, `v0.1.4`, `v0.1.5` — every released tag. **Already fixed on `master`** (unreleased v0.2.0-rc line) — see "Upstream status" below.
- **Pinned by:** `logos-delivery` (nwaku / Logos Messaging) pins `ffi` **v0.1.3** (git commit `06111de155253b34e47ed2aaed1d61d08d62cc1b`), so the crash is live for every FFI/mobile consumer of the current delivery library.

## Summary

The FFI event dispatch template passes the address of the first byte of a Nim
string straight to the C callback:

```nim
cast[FFICallBack](ctx[].eventCallback)(
  RET_OK, unsafeAddr event[0], cast[csize_t](len(event)), ctx[].eventUserData
)
```

When `event` serializes to an **empty string** (`len == 0`), the string's data
pointer is nil, so `event[0]` dereferences nil and the process takes a
`SIGSEGV: Illegal storage access. (Attempt to read from nil?)`. The same bug is
in the `except` branch on `msg[0]`.

This is deterministic: it fires the **first time** the node emits an
empty-serialized event over the FFI boundary — for us, on first peer connect,
via the health monitor's `connection_status_change` event.

## Traceback

```
node_health_monitor.nim(706) startHealthMonitor
brokers/event_broker.nim(546) emit
brokers/event_broker.nim(467) emitEventConnectionStatusChangeValue
brokers/event_broker.nim(442) notifyEventConnectionStatusChangeListener
library/logos_delivery_api/node_api.nim(122) :anonymous
ffi/ffi_context.nim(38) anonymous
SIGSEGV: Illegal storage access. (Attempt to read from nil?)
```

`node_api.nim:122` is the `EventConnectionStatusChange` listener:

```nim
callEventCallback(ctx, "onConnectionStatusChange"):
  $newJsonEvent("connection_status_change", event),
```

`ffi/ffi_context.nim(38)` is inside `callEventCallback`, at the `unsafeAddr event[0]` call.

## Root cause

`unsafeAddr event[0]` / `unsafeAddr msg[0]` index element `0` of a possibly
empty Nim string. For an empty string (ARC/ORC), the payload pointer is nil;
indexing it reads from nil. There is no length/nil guard before taking the
address, so any event whose body serializes to `""` crashes the callback thread.

Because `callEventCallback` is the single choke point for **all** FFI events,
this is not specific to `connection_status_change` — any event that ever
produces an empty payload crashes the consumer.

## Reproduction

1. Build `liblogosdelivery` and embed it via FFI (Android, JNI over the C ABI).
2. `create_node` with the `logos.dev` preset.
3. `set_event_callback` (register a `FFICallBack`).
4. `start`.
5. On the first peer connect, the health monitor emits
   `connection_status_change`; `callEventCallback` runs `unsafeAddr event[0]`
   and the process SIGSEGVs with "Attempt to read from nil".

## The fix

Guard the empty case at both call sites — pass `nil` (with `len == 0`) instead
of indexing an empty string:

```nim
cast[FFICallBack](ctx[].eventCallback)(
  RET_OK,
  (if len(event) > 0: unsafeAddr event[0] else: nil),
  cast[csize_t](len(event)), ctx[].eventUserData
)
```

(and the same for `msg` in the `except` branch). Unified diff:
[`ffi-empty-event.patch`](./ffi-empty-event.patch).

Consumers must already handle a `(nil, 0)` payload (an empty event is a valid
event), so passing `nil` rather than a dangling address is the correct
contract. See how `master` handles it below — it routes empty payloads through
a non-nil empty-cstring sentinel, which is an equivalent, arguably nicer
choice; either is acceptable.

## Upstream status (important)

The bug exists in **every released tag** (`v0.1.3`, `v0.1.4`, `v0.1.5`) — the
unguarded `unsafeAddr event[0]` / `unsafeAddr msg[0]` is present in
`ffi/ffi_context.nim` in all three.

It is **already fixed on `master`** (unreleased, heading toward `v0.2.0`). The
FFI event layer was refactored: the `callEventCallback` template is gone, and
dispatch now lives in `ffi/event_thread.nim` + `ffi/ffi_events.nim`, where empty
payloads are routed through a non-nil sentinel:

```nim
# ffi/ffi_events.nim
const emptyListenerPayload*: cstring = ""
...
## Empty payloads go through `emptyListenerPayload` so consumers doing
## `std::string(data, len)` / `memcpy` never see a nil pointer.
let dataPtr =
  if n > 0 and not data.isNil(): cast[ptr cchar](data)
  else: cast[ptr cchar](emptyListenerPayload)
```

So the master refactor already carries the fix, but **none of the released
versions do**, and `logos-delivery` pins `v0.1.3`.

**Requested action (pick one):**

1. Cut a `v0.1.6` (or `v0.1.3.x`) patch release of the 0.1.x line carrying the
   guard in the attached patch, and have `logos-delivery` bump its `ffi` pin; or
2. Have `logos-delivery` move its `ffi` pin forward to a `master`/`v0.2.0-rc`
   revision that already contains the `emptyListenerPayload` fix.

Until either lands, every FFI/mobile embedder of the current delivery library
crashes on first peer connect.

## Note on the pinned revision

The reference build directory is named
`ffi-0.1.3-6f9d49375ea1dc71add55c72ac80a808f238e5b0`. That trailing hash is
**nimble's package-content checksum, not a git revision** — it does not resolve
as a commit in the repo. The actual pinned git revision, per the package's
`nimblemeta.json` (`vcsRevision`), is
`06111de155253b34e47ed2aaed1d61d08d62cc1b`, which is exactly tag `v0.1.3`
(2026-01-23). The bug was verified present at that commit and at `v0.1.4` /
`v0.1.5`.

## Secondary question: is `connection_status_change` serializing empty a deeper bug?

Investigated in the `logos-delivery` build tree; **conclusion: no secondary fix
belongs in `node_api.nim`.** The nim-ffi guard is the correct and complete fix.

`connection_status_change` is built by
`$newJsonEvent("connection_status_change", event)`
(`library/logos_delivery_api/node_api.nim:122-123`). `newJsonEvent` /
`toFlatJson` (`library/json_event.nim`) always produces a JSON **object** that
begins with the `eventType` key and flattens the payload:

```nim
jsonObj["eventType"] = %event.eventType          # always set
let payloadJson = %event.payload                 # flattened in
```

`EventConnectionStatusChange` (`logos_delivery/api/events/kernel_events.nim`) has
one field, `connectionStatus: ConnectionStatus`, and `ConnectionStatus`
(`logos_delivery/api/types.nim:24`) is a plain `{.pure.}` enum with a default
`%`/`$`. So the serialized string is always at least
`{"eventType":"connection_status_change","connectionStatus":"<value>"}` — it is
**structurally never empty**, and there is no custom `%`/`$` override that could
collapse it to `""`.

Therefore, from the source, this event should not serialize to an empty string,
and there is nothing to "fix" in `node_api.nim`'s serialization. The right and
only fix is the nim-ffi guard, which protects the FFI boundary against an empty
or nil payload from **any** event — the correct place to be defensive, since the
C-ABI contract must tolerate `(nil, 0)` regardless of which event emitted it.

Caveat for the reporter: because the source shows this event as always non-empty
yet the crash reproduces on this exact listener, it is worth capturing the
actual `len(event)` at the crash site once (e.g. a temporary log before the
callback) to confirm whether the payload was truly empty or whether the nil read
came from somewhere inside `body` evaluation. Either way it does not change the
fix — the guard is required — but it would settle whether a serialization edge
case also deserves a follow-up.

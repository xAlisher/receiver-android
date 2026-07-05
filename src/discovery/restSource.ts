// Live discovery via a nwaku/logos-delivery REST node peered into cluster 2 (see docs/PLAN.md E2).
// Two feeds into one TTL map, newest-by-seq wins:
//   - RELAY poll (fast): /relay/v1/auto/messages drains on read → catches live updates.
//   - STORE query (slower): /store/v3/messages is RETAINED (not drained) → self-heals if a relay drain
//     was missed or stolen by another consumer (drain-on-read means only one reader gets each message).
// Payloads are base64 on the REST boundary → decode to the raw announce JSON.
//
// Dev connectivity: `adb reverse tcp:8645 tcp:8645` maps the phone's 127.0.0.1:8645 to the node.

import { Announce } from "../identity/verify";

const DIRECTORY_TOPIC = "/radio-basecamp/1/directory/json";
const DEFAULT_NODE = "http://127.0.0.1:8645"; // via adb reverse in dev
const STATION_TTL_MS = 90_000; // drop a station after 90s without a heartbeat
const STORE_EVERY_MS = 8_000; // how often to reconcile against Store

function b64ToUtf8(b64: string): string {
  const bin = global.atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  if (typeof (global as any).TextDecoder !== "undefined") {
    return new (global as any).TextDecoder("utf-8").decode(bytes);
  }
  return decodeURIComponent(escape(bin));
}

export interface RestOptions {
  node?: string;
  contentTopic?: string;
  pollMs?: number;
}

type Seen = { announce: Announce; at: number; seq: number };

export function startRestDiscovery(
  onAnnounces: (list: Announce[]) => void,
  onStatus: (s: { connected: boolean; error?: string }) => void,
  opts: RestOptions = {}
): () => void {
  const node = opts.node ?? DEFAULT_NODE;
  const topic = opts.contentTopic ?? DIRECTORY_TOPIC;
  const enc = encodeURIComponent(topic);
  const pollMs = opts.pollMs ?? 2500;
  const live = new Map<string, Seen>(); // key: pubkey || name
  let stopped = false;
  let lastStore = 0;

  // Merge an announce in, keeping the NEWEST by `seq` (falls back to arrival time when seq is absent).
  // This lets the retained Store feed refresh without clobbering fresher relay data (or vice-versa).
  function merge(a: Announce, now: number): void {
    if (!a?.name) return;
    const key = ((a.pubkey as string) || (a.name as string)) as string;
    const seq = typeof (a as any).seq === "number" ? ((a as any).seq as number) : now;
    const prev = live.get(key);
    if (!prev || seq >= prev.seq) live.set(key, { announce: a, at: now, seq });
  }

  function emit(now: number): void {
    for (const [k, v] of live) if (now - v.at > STATION_TTL_MS) live.delete(k);
    onAnnounces(Array.from(live.values()).map((v) => v.announce));
  }

  async function subscribe(): Promise<void> {
    await fetch(`${node}/relay/v1/auto/subscriptions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([topic]),
    });
  }

  // Retained history — newest first. Reconciles the live map even if relay drains were missed/stolen.
  async function storeBackfill(now: number): Promise<void> {
    try {
      const u =
        `${node}/store/v3/messages?contentTopics=${enc}` +
        `&pageSize=50&ascending=false&includeData=true`;
      const r = await fetch(u);
      if (!r.ok) return;
      const body = await r.json();
      const msgs: Array<{ message?: { payload?: string }; payload?: string }> =
        body?.messages ?? body ?? [];
      for (const m of msgs) {
        const p = m?.message?.payload ?? m?.payload;
        if (!p) continue;
        try {
          merge(JSON.parse(b64ToUtf8(p)) as Announce, now);
        } catch {
          /* skip */
        }
      }
    } catch {
      /* store optional — ignore */
    }
  }

  async function tick(): Promise<void> {
    const now = Date.now();
    try {
      const r = await fetch(`${node}/relay/v1/auto/messages/${enc}`);
      if (r.status === 404) {
        await subscribe();
        onStatus({ connected: true });
      } else if (r.ok) {
        const msgs: Array<{ payload: string }> = await r.json();
        for (const m of msgs) {
          try {
            merge(JSON.parse(b64ToUtf8(m.payload)) as Announce, now);
          } catch {
            /* skip */
          }
        }
        onStatus({ connected: true });
      } else {
        onStatus({ connected: false, error: `HTTP ${r.status}` });
      }
    } catch (e) {
      onStatus({ connected: false, error: String((e as Error).message || e) });
    }

    // Periodic Store reconcile (self-heal) — cheaper cadence than the relay poll.
    if (now - lastStore >= STORE_EVERY_MS) {
      lastStore = now;
      await storeBackfill(now);
    }
    emit(now);
  }

  (async () => {
    try {
      await subscribe();
      onStatus({ connected: true });
    } catch (e) {
      onStatus({ connected: false, error: String((e as Error).message || e) });
    }
    await storeBackfill(Date.now()); // cold-start: show current stations immediately
    emit(Date.now());
    while (!stopped) {
      await tick();
      await new Promise((res) => setTimeout(res, pollMs));
    }
  })();

  return () => {
    stopped = true;
  };
}

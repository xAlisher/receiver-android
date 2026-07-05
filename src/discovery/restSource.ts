// Live discovery via a nwaku/logos-delivery REST node peered into cluster 2 (see docs/PLAN.md E2).
// Subscribe to the directory content topic, then poll — the node drains messages on read, so we
// accumulate into a TTL map. Payloads are base64 on the REST boundary → decode to the raw announce JSON.
//
// Dev connectivity: `adb reverse tcp:8645 tcp:8645` maps the phone's 127.0.0.1:8645 to the node.
// For a real deployment, point NODE at a TLS-fronted node reachable from the phone.

import { Announce } from "../identity/verify";

const DIRECTORY_TOPIC = "/radio-basecamp/1/directory/json";
const DEFAULT_NODE = "http://127.0.0.1:8645"; // via adb reverse in dev
const STATION_TTL_MS = 60_000; // drop a station after 60s without a heartbeat

function b64ToUtf8(b64: string): string {
  // Hermes has atob; decode to bytes then UTF-8 (handles the em-dash etc. in descriptions).
  const bin = global.atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  if (typeof (global as any).TextDecoder !== "undefined") {
    return new (global as any).TextDecoder("utf-8").decode(bytes);
  }
  return decodeURIComponent(escape(bin)); // fallback
}

export interface RestOptions {
  node?: string;
  contentTopic?: string;
  pollMs?: number;
}

type Seen = { announce: Announce; at: number };

/**
 * Start polling the node. Calls `onAnnounces` with the current set of live announces (TTL-pruned) each
 * tick. Returns a stop() function. Never throws — network hiccups just skip a tick.
 */
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

  async function subscribe(): Promise<void> {
    await fetch(`${node}/relay/v1/auto/subscriptions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([topic]),
    });
  }

  async function tick(): Promise<void> {
    try {
      const r = await fetch(`${node}/relay/v1/auto/messages/${enc}`);
      if (r.status === 404) {
        await subscribe(); // node lost/never had the sub
        onStatus({ connected: true });
        return;
      }
      if (!r.ok) {
        onStatus({ connected: false, error: `HTTP ${r.status}` });
        return;
      }
      const msgs: Array<{ payload: string }> = await r.json();
      const now = Date.now();
      for (const m of msgs) {
        try {
          const a: Announce = JSON.parse(b64ToUtf8(m.payload));
          if (!a.name) continue;
          live.set((a.pubkey as string) || (a.name as string), { announce: a, at: now });
        } catch {
          /* skip malformed */
        }
      }
      // prune stale
      for (const [k, v] of live) if (now - v.at > STATION_TTL_MS) live.delete(k);
      onStatus({ connected: true });
      onAnnounces(Array.from(live.values()).map((v) => v.announce));
    } catch (e) {
      onStatus({ connected: false, error: String((e as Error).message || e) });
    }
  }

  (async () => {
    try {
      await subscribe();
      onStatus({ connected: true });
    } catch (e) {
      onStatus({ connected: false, error: String((e as Error).message || e) });
    }
    while (!stopped) {
      await tick();
      await new Promise((res) => setTimeout(res, pollMs));
    }
  })();

  return () => {
    stopped = true;
  };
}

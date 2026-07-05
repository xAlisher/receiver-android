// Native discovery — the phone runs its OWN Logos Messaging (Waku) light node via the embedded
// liblogosdelivery.so (JNI → LogosMessaging module). No REST node, no adb reverse: fully P2P (E8).
//
// Flow: setup → new(cluster-2 config) → start → connect(bootstrap peers) → relaySubscribe(/waku/2/rs/2/2)
// → the node emits `logosMessage` for each received WakuMessage → decode payload → announce → ingest.

import {NativeModules, NativeEventEmitter} from 'react-native';
import {Announce} from '../identity/verify';

const {LogosMessaging} = NativeModules as {LogosMessaging: any};

const CLUSTER_ID = 2;
const SHARD = 2;
const PUBSUB_TOPIC = `/waku/2/rs/${CLUSTER_ID}/${SHARD}`;
const CONTENT_TOPIC = '/radio-basecamp/1/directory/json';

// The logos.dev bootstrap peers (same set the desktop receiver dials).
const BOOTSTRAP = [
  '/dns4/delivery-01.do-ams3.logos.dev.status.im/tcp/30303/p2p/16Uiu2HAmTUbnxLGT9JvV6mu9oPyDjqHK4Phs1VDJNUgESgNSkuby',
  '/dns4/delivery-02.do-ams3.logos.dev.status.im/tcp/30303/p2p/16Uiu2HAmMK7PYygBtKUQ8EHp7EfaD3bCEsJrkFooK8RQ2PVpJprH',
  '/dns4/delivery-01.gc-us-central1-a.logos.dev.status.im/tcp/30303/p2p/16Uiu2HAm4S1JYkuzDKLKQvwgAhZKs9otxXqt8SCGtB4hoJP1S397',
  '/dns4/delivery-02.gc-us-central1-a.logos.dev.status.im/tcp/30303/p2p/16Uiu2HAm8Y9kgBNtjxvCnf1X6gnZJW5EGE4UwwCL3CCm55TwqBiH',
  '/dns4/delivery-01.ac-cn-hongkong-c.logos.dev.status.im/tcp/30303/p2p/16Uiu2HAm8YokiNun9BkeA1ZRmhLbtNUvcwRr64F69tYj9fkGyuEP',
  '/dns4/delivery-02.ac-cn-hongkong-c.logos.dev.status.im/tcp/30303/p2p/16Uiu2HAkvwhGHKNry6LACrB8TmEFoCJKEX29XR5dDUzk3UT3UNSE',
];

function log(...a: unknown[]) {
  console.log('[LM]', ...a);
}

function decodeAnnounce(payload: string | number[]): Announce | null {
  const tryParse = (s: string): Announce | null => {
    try {
      return JSON.parse(s) as Announce;
    } catch {
      return null;
    }
  };
  // The message_received event delivers WakuMessage.payload as a UTF-8 byte array. Turn it into text.
  if (Array.isArray(payload)) {
    let txt = '';
    for (let i = 0; i < payload.length; i++) txt += String.fromCharCode(payload[i] & 0xff);
    try {
      txt = decodeURIComponent(escape(txt)); // fix multi-byte UTF-8
    } catch {
      /* already ascii */
    }
    return tryParse(txt);
  }
  // Fallbacks for a string payload: raw JSON, then base64 → utf8 JSON.
  let a = tryParse(payload);
  if (a) return a;
  try {
    const bin = global.atob(payload);
    const txt = decodeURIComponent(escape(bin));
    a = tryParse(txt);
  } catch {
    /* not base64 */
  }
  return a;
}

export function startNativeDiscovery(
  onAnnounces: (list: Announce[]) => void,
  onStatus: (s: {connected: boolean; error?: string}) => void,
): () => void {
  if (!LogosMessaging) {
    onStatus({connected: false, error: 'native module missing'});
    return () => {};
  }
  const emitter = new NativeEventEmitter(LogosMessaging);
  const live = new Map<string, {announce: Announce; seq: number}>();
  let ctx: string | null = null;
  let stopped = false;

  const sub = emitter.addListener('logosMessage', (evt: any) => {
    // evt = { wakuPtr, event }. `event` is a JSON string describing the received message.
    log('event', typeof evt?.event === 'string' ? evt.event.slice(0, 200) : evt);
    try {
      const m = JSON.parse(evt.event);
      // The received-message event carries the WakuMessage; find the payload + content topic.
      const wm = m.wakuMessage || m.message || m;
      const ct = wm.contentTopic || m.contentTopic;
      if (ct && ct !== CONTENT_TOPIC) return; // only the directory topic
      const payload = wm.payload;
      if (!payload) return;
      const a = decodeAnnounce(payload);
      if (!a?.name) return;
      const key = (a.pubkey as string) || (a.name as string);
      const seq = typeof (a as any).seq === 'number' ? (a as any).seq : Date.now();
      const prev = live.get(key);
      if (!prev || seq >= prev.seq) live.set(key, {announce: a, seq});
      onAnnounces(Array.from(live.values()).map(v => v.announce));
    } catch (e) {
      log('decode err', String(e));
    }
  });

  (async () => {
    try {
      await LogosMessaging.setup();
      log('setup ok');
      // Higher-level logosdelivery config — the "logos.dev" preset bakes cluster 2 / shard / network
      // params; entryNodes are the bootstrap peers (same as the desktop receiver's createNode).
      const config = {
        mode: 'Core',
        preset: 'logos.dev',
        relay: true,
        entryNodes: BOOTSTRAP,
      };
      ctx = await LogosMessaging.new(config);
      log('node ctx', ctx);
      const started = await LogosMessaging.start(ctx);
      log('start', JSON.stringify(started));
      // logosdelivery_subscribe takes the CONTENT topic directly (not the pubsub /waku/2/rs/2/2).
      const subRes = await LogosMessaging.relaySubscribe(ctx, CONTENT_TOPIC);
      log('subscribe', CONTENT_TOPIC, JSON.stringify(subRes));
      void PUBSUB_TOPIC;
      onStatus({connected: true});
    } catch (e) {
      log('startup error', String(e));
      onStatus({connected: false, error: String((e as Error).message || e)});
    }
  })();

  return () => {
    stopped = true;
    sub.remove();
    if (ctx) {
      LogosMessaging.stop(ctx).catch(() => {});
    }
  };
}

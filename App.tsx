/**
 * Receiver (Android) — discover & verify decentralized Logos radio stations.
 * MVP UI: ingest announces → verify secp256k1 identity → identity-first station list.
 * Discovery is currently the pre-signed sample set (E2 wires the live Waku/REST source);
 * playback (E5) is stubbed to a "now playing" state until the Tor + ExoPlayer modules land.
 */
import React, {useEffect, useMemo, useState} from 'react';
import {
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Video from 'react-native-video';
import {ingest, Station} from './src/discovery/ingest';
import {SAMPLE_ANNOUNCES} from './src/discovery/sampleAnnounces';
import {startRestDiscovery} from './src/discovery/restSource';
import {Announce} from './src/identity/verify';

// MediaMTX gates onion HLS: /index.m3u8 → 302 → /index.m3u8?cookieCheck=1 (200), and the master then
// hands out session-scoped child URLs. Its Set-Cookie is `Secure`, so it can't ride the HTTP onion —
// but the query param alone yields 200. Pre-supply it so ExoPlayer's first fetch skips the loop.
function withCookieCheck(url: string): string {
  if (!url || url.includes('cookieCheck=')) return url;
  return url + (url.includes('?') ? '&' : '?') + 'cookieCheck=1';
}

const C = {
  bg: '#0d0f12',
  card: '#161a20',
  cardActive: '#1d2129',
  text: '#f2f4f7',
  muted: '#8a929e',
  accent: '#e8833a', // now-playing / Tor
  ok: '#3ecf8e', // verified
  border: '#242a33',
};

function StationRow({
  s,
  playing,
  onToggle,
}: {
  s: Station;
  playing: boolean;
  onToggle: () => void;
}) {
  const subtitle = s.nowPlaying
    ? `Playing now: ${s.nowPlaying}`
    : s.description || s.hostLine;
  return (
    <View style={[styles.row, playing && styles.rowActive]}>
      <View style={styles.rowMain}>
        <View style={styles.nameLine}>
          <Text style={styles.name} numberOfLines={1}>
            {s.name}
          </Text>
          {s.verified ? (
            <Text style={styles.badge}>
              ✓ {s.keySource === 'keycard' ? 'Keycard' : 'signed'}
            </Text>
          ) : (
            <Text style={styles.badgeAnon}>anonymous</Text>
          )}
        </View>
        {!!subtitle && (
          <Text
            style={[styles.sub, s.nowPlaying ? styles.nowPlaying : null]}
            numberOfLines={1}>
            {subtitle}
          </Text>
        )}
        <Text style={styles.host} numberOfLines={1}>
          {s.hostLine}
        </Text>
      </View>
      <TouchableOpacity
        style={[styles.playBtn, playing && styles.stopBtn]}
        onPress={onToggle}
        activeOpacity={0.7}>
        <Text style={[styles.playIcon, playing && styles.stopIcon]}>
          {playing ? '■' : '▶'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

function App(): React.JSX.Element {
  const [announces, setAnnounces] = useState<Announce[]>([]);
  const [status, setStatus] = useState<{connected: boolean; error?: string}>({
    connected: false,
  });
  const [playing, setPlaying] = useState<string | null>(null);

  // E8 ✅ Primary discovery is now the phone's OWN embedded Logos Messaging node (cluster-2 relay via the
  // JNI bridge) — no REST bridge. Received directory announces → decode → verify → identity-first list.
  useEffect(() => {
    let stop = () => {};
    import('./src/discovery/nativeLogosSource')
      .then(m => {
        stop = m.startNativeDiscovery(setAnnounces, setStatus);
      })
      .catch(e => {
        console.log('[LM] load err', String(e));
        // fall back to the REST bridge if the native node fails to load
        stop = startRestDiscovery(setAnnounces, setStatus);
      });
    return () => stop();
  }, []);

  // live announces once they arrive; sample set as an offline fallback so the identity UI always shows
  const live = announces.length > 0;
  const stations = useMemo(
    () => ingest(live ? announces : SAMPLE_ANNOUNCES),
    [announces, live],
  );
  const verifiedCount = stations.filter(s => s.verified).length;
  const playingStation = stations.find(s => (s.pubkey || s.name) === playing);
  const statusText = live
    ? `● ${stations.length} live · ${verifiedCount} verified`
    : status.connected
      ? '◌ connected — waiting for stations'
      : `◌ connecting…${status.error ? ' (' + status.error + ')' : ''}`;

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>Receiver</Text>
        <Text style={styles.tagline}>Discover &amp; listen — decentralized radio</Text>

        <View style={styles.statusRow}>
          <Text style={styles.dirLabel}>Directory: Public</Text>
          <Text style={[styles.discovering, !live && styles.discoveringOff]}>
            {statusText}
          </Text>
        </View>

        {stations.map(s => (
          <StationRow
            key={s.pubkey || s.name}
            s={s}
            playing={playing === (s.pubkey || s.name)}
            onToggle={() =>
              setPlaying(p =>
                p === (s.pubkey || s.name) ? null : s.pubkey || s.name,
              )
            }
          />
        ))}

        <Text style={styles.footer}>
          {live
            ? `${stations.length} live · verified over Waku cluster 2 · forgeries dropped`
            : 'sample data (offline) · forgeries dropped · connecting to Waku…'}
        </Text>
      </ScrollView>

      {/* Audio playback — routed through Tor SOCKS by OnionOkHttpPlugin (E5). Hidden (audio only). */}
      {playingStation?.streamUrl ? (
        <Video
          source={{uri: withCookieCheck(playingStation.streamUrl)}}
          paused={false}
          playInBackground
          playWhenInactive
          // eslint-disable-next-line react-native/no-inline-styles
          style={{width: 0, height: 0}}
          onLoad={() => console.log('[RCV] video onLoad', playingStation.name)}
          onBuffer={e => console.log('[RCV] video onBuffer', e.isBuffering)}
          onError={e => console.log('[RCV] video onError', JSON.stringify(e))}
        />
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: C.bg},
  scroll: {padding: 20, paddingBottom: 40},
  title: {color: C.text, fontSize: 34, fontWeight: '700', marginTop: 12},
  tagline: {color: C.muted, fontSize: 14, marginTop: 2, marginBottom: 20},
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  dirLabel: {color: C.text, fontSize: 15, fontWeight: '600'},
  discovering: {color: C.ok, fontSize: 13},
  discoveringOff: {color: C.muted},
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    padding: 16,
    marginBottom: 12,
  },
  rowActive: {backgroundColor: C.cardActive, borderColor: C.accent},
  rowMain: {flex: 1, marginRight: 12},
  nameLine: {flexDirection: 'row', alignItems: 'center'},
  name: {color: C.text, fontSize: 17, fontWeight: '600', flexShrink: 1},
  badge: {color: C.ok, fontSize: 11, marginLeft: 8, fontWeight: '600'},
  badgeAnon: {color: C.muted, fontSize: 11, marginLeft: 8},
  sub: {color: C.muted, fontSize: 13, marginTop: 4},
  nowPlaying: {color: C.accent},
  host: {color: C.muted, fontSize: 12, marginTop: 3},
  playBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: C.ok,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stopBtn: {borderColor: C.accent},
  playIcon: {color: C.ok, fontSize: 16, marginLeft: 2},
  stopIcon: {color: C.accent, marginLeft: 0},
  footer: {color: C.muted, fontSize: 11, marginTop: 16, textAlign: 'center'},
});

export default App;

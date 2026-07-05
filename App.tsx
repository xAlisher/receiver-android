/**
 * Receiver (Android) — discover & verify decentralized Logos radio stations.
 * Discovery is the phone's OWN embedded Logos Messaging node (cluster-2 relay via the JNI bridge);
 * playback routes onion HLS through Tor. Tap a station → bottom player dock (caching → playing).
 */
import React, {useEffect, useMemo, useRef, useState} from 'react';
import {
  Animated,
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

// MediaMTX gates onion HLS: /index.m3u8 → 302 → ?cookieCheck=1 (200). Its Set-Cookie is `Secure` so it
// can't ride the HTTP onion — but the query param alone yields 200. Pre-supply it so the first fetch skips
// the loop.
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
  caching: '#e6b800', // breathing-yellow caching phase
  ok: '#3ecf8e', // verified
  border: '#242a33',
};

// Seconds the caching phase counts down (mirrors the desktop receiver's listener buffer UX).
const BUFFER_SECS = 12;

// Loading-state quotes, rotated while caching — the parallel-society / sovereign-radio register.
const QUOTES = [
  'No towers, no gatekeepers — just the signal.',
  'Every listener is a node. The network is the audience.',
  'Routed through Tor: origin unknown, on purpose.',
  'Forgeries dropped at the door — only signed voices play.',
  'Tuning the parallel society…',
  'Your IP stays yours. The onion sees to that.',
];

function StationRow({
  s,
  active,
  onSelect,
}: {
  s: Station;
  active: boolean;
  onSelect: () => void;
}) {
  const subtitle = s.nowPlaying || s.description || '';
  const onion = s.privacy === 'onion';
  const idLine = s.fingerprint || s.hostLabel || (onion ? '' : 'LAN');
  return (
    <TouchableOpacity
      style={[styles.row, active && styles.rowActive]}
      activeOpacity={0.7}
      onPress={onSelect}>
      <Text style={styles.name} numberOfLines={1}>
        {s.name}
      </Text>
      {!!subtitle && (
        <Text style={styles.sub} numberOfLines={1}>
          {subtitle}
        </Text>
      )}
      <View style={styles.hostRow}>
        {onion && <Text style={styles.onion}>🧅</Text>}
        {!!idLine && (
          <Text style={styles.host} numberOfLines={1}>
            {idLine}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );
}

function PlayerBar({
  station,
  caching,
  cacheLeft,
  quote,
  onStop,
}: {
  station: Station;
  caching: boolean;
  cacheLeft: number;
  quote: string;
  onStop: () => void;
}) {
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!caching) {
      pulse.setValue(1);
      return;
    }
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 0.3,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: 700,
          useNativeDriver: true,
        }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [caching, pulse]);

  const accent = caching ? C.caching : C.accent;
  return (
    <View style={[styles.playerBar, {borderColor: accent}]}>
      <Animated.Text
        style={[styles.playerIcon, {color: accent, opacity: caching ? pulse : 1}]}>
        {caching ? '◌' : '▶'}
      </Animated.Text>
      <View style={styles.playerMain}>
        <Text style={styles.playerName} numberOfLines={1}>
          {station.name}
        </Text>
        {caching ? (
          <>
            <Text style={[styles.playerStatus, {color: C.caching}]}>
              Caching… {cacheLeft}s
            </Text>
            <Text style={styles.playerQuote} numberOfLines={2}>
              “{quote}”
            </Text>
          </>
        ) : (
          <Text
            style={[styles.playerStatus, {color: C.accent}]}
            numberOfLines={1}>
            {station.nowPlaying ? station.nowPlaying : 'Playing'}
          </Text>
        )}
      </View>
      <TouchableOpacity
        onPress={onStop}
        style={styles.playerStop}
        activeOpacity={0.7}
        hitSlop={{top: 12, bottom: 12, left: 12, right: 12}}>
        <Text style={styles.playerStopIcon}>■</Text>
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
  const [caching, setCaching] = useState(false);
  const [cacheLeft, setCacheLeft] = useState(0);
  const [quoteIdx, setQuoteIdx] = useState(0);

  // Primary discovery: the phone's OWN embedded Logos Messaging node (cluster-2 relay via the JNI bridge),
  // REST bridge as fallback only.
  useEffect(() => {
    let stop = () => {};
    import('./src/discovery/nativeLogosSource')
      .then(m => {
        stop = m.startNativeDiscovery(setAnnounces, setStatus);
      })
      .catch(e => {
        console.log('[LM] load err', String(e));
        stop = startRestDiscovery(setAnnounces, setStatus);
      });
    return () => stop();
  }, []);

  // Caching countdown → flip to playing when it hits 0.
  useEffect(() => {
    if (playing == null || !caching) return;
    if (cacheLeft <= 0) {
      setCaching(false);
      return;
    }
    const t = setTimeout(() => setCacheLeft(n => n - 1), 1000);
    return () => clearTimeout(t);
  }, [playing, caching, cacheLeft]);

  // Rotate the loading quotes while caching.
  useEffect(() => {
    if (playing == null || !caching) return;
    const t = setInterval(() => setQuoteIdx(i => (i + 1) % QUOTES.length), 2600);
    return () => clearInterval(t);
  }, [playing, caching]);

  const live = announces.length > 0;
  const stations = useMemo(
    () => ingest(live ? announces : SAMPLE_ANNOUNCES),
    [announces, live],
  );
  void status; // discovery status still drives setStatus; header indicator removed per design
  const playingStation = stations.find(s => (s.pubkey || s.name) === playing);

  const select = (s: Station) => {
    const key = s.pubkey || s.name;
    if (key === playing) {
      setPlaying(null);
      setCaching(false);
      return;
    }
    setPlaying(key);
    setCaching(true);
    setCacheLeft(BUFFER_SECS);
    setQuoteIdx(0);
  };

  const stop = () => {
    setPlaying(null);
    setCaching(false);
  };

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          playingStation ? styles.scrollWithPlayer : null,
        ]}>
        <Text style={styles.title}>Receiver</Text>
        <Text style={styles.tagline}>
          Decentralised anonymous radio over Tor and Logos Messaging
        </Text>

        <View style={styles.statusRow}>
          <Text style={styles.dirLabel}>Directory: Public</Text>
        </View>

        {stations.map(s => (
          <StationRow
            key={s.pubkey || s.name}
            s={s}
            active={playing === (s.pubkey || s.name)}
            onSelect={() => select(s)}
          />
        ))}
      </ScrollView>

      {/* Audio + player dock — routed through Tor SOCKS by OnionOkHttpPlugin. Video is hidden (audio only);
          onLoad flips caching→playing early if the stream is ready before the countdown ends. */}
      {playingStation ? (
        <>
          <Video
            source={{uri: withCookieCheck(playingStation.streamUrl)}}
            paused={false}
            playInBackground
            playWhenInactive
            // eslint-disable-next-line react-native/no-inline-styles
            style={{width: 0, height: 0}}
            onLoad={() => console.log('[RCV] video onLoad', playingStation.name)}
            onError={e => console.log('[RCV] video onError', JSON.stringify(e))}
          />
          <View style={styles.playerDock}>
            <PlayerBar
              station={playingStation}
              caching={caching}
              cacheLeft={cacheLeft}
              quote={QUOTES[quoteIdx]}
              onStop={stop}
            />
          </View>
        </>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: C.bg},
  scroll: {padding: 20, paddingBottom: 40},
  scrollWithPlayer: {paddingBottom: 130},
  title: {color: C.text, fontSize: 34, fontWeight: '700', marginTop: 12},
  tagline: {color: C.muted, fontSize: 14, marginTop: 4, marginBottom: 20},
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
    backgroundColor: C.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    padding: 16,
    marginBottom: 12,
  },
  rowActive: {backgroundColor: C.cardActive, borderColor: C.accent},
  name: {color: C.text, fontSize: 17, fontWeight: '600'},
  sub: {color: C.muted, fontSize: 13, marginTop: 4},
  hostRow: {flexDirection: 'row', alignItems: 'center', marginTop: 4},
  onion: {fontSize: 12, marginRight: 5, opacity: 0.55},
  host: {color: C.muted, fontSize: 12, flexShrink: 1},
  // Player dock — glued to the bottom of the screen.
  playerDock: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 16,
  },
  playerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.card,
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: {width: 0, height: 4},
    elevation: 8,
  },
  playerIcon: {fontSize: 22, width: 30, textAlign: 'center'},
  playerMain: {flex: 1, marginHorizontal: 10},
  playerName: {color: C.text, fontSize: 16, fontWeight: '600'},
  playerStatus: {fontSize: 13, marginTop: 3, fontWeight: '600'},
  playerQuote: {
    color: C.muted,
    fontSize: 12,
    fontStyle: 'italic',
    marginTop: 4,
  },
  playerStop: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playerStopIcon: {color: C.accent, fontSize: 14},
});

export default App;

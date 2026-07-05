/**
 * Receiver (Android) — discover & verify decentralized Logos radio stations.
 * Discovery is the phone's OWN embedded Logos Messaging node (cluster-2 relay via the JNI bridge);
 * playback routes onion HLS through Tor. Tap a station → bottom player dock (loading → playing).
 */
import React, {useEffect, useRef, useMemo, useState} from 'react';
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
  muted: '#6b7078', // secondary text (darker)
  faint: '#4e535b', // crypto/fingerprint words — darkest, recede into the card
  accent: '#e8833a', // now-playing / Tor
  caching: '#e6b800', // breathing-yellow while the stream loads
  ok: '#3ecf8e', // verified
  border: '#242a33',
};

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
  loading,
  onStop,
}: {
  station: Station;
  loading: boolean;
  onStop: () => void;
}) {
  // Breathe the loading dot until audio starts.
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!loading) {
      pulse.setValue(1);
      return;
    }
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 0.2,
          duration: 650,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: 650,
          useNativeDriver: true,
        }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [loading, pulse]);

  return (
    <View
      style={[styles.playerBar, {borderColor: loading ? C.caching : C.accent}]}>
      <View style={styles.playerMain}>
        <Text style={styles.playerName} numberOfLines={1}>
          {station.name}
        </Text>
        {!!station.nowPlaying && (
          <Text style={styles.playerNow} numberOfLines={1}>
            {station.nowPlaying}
          </Text>
        )}
      </View>
      <TouchableOpacity
        onPress={onStop}
        style={styles.playerRight}
        activeOpacity={0.7}
        hitSlop={{top: 14, bottom: 14, left: 14, right: 14}}>
        {loading ? (
          <Animated.View style={[styles.loadDot, {opacity: pulse}]} />
        ) : (
          <Text style={styles.stopIcon}>■</Text>
        )}
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
  const [loading, setLoading] = useState(false); // true until audio actually starts

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

  const stations = useMemo(() => ingest(announces), [announces]);
  void status; // discovery status still drives setStatus; header indicator removed per design
  const playingStation = stations.find(s => (s.pubkey || s.name) === playing);

  const select = (s: Station) => {
    const key = s.pubkey || s.name;
    if (key === playing) {
      setPlaying(null);
      setLoading(false);
      return;
    }
    setPlaying(key);
    setLoading(true);
  };

  const stop = () => {
    setPlaying(null);
    setLoading(false);
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

        {stations.length === 0 ? (
          <Text style={styles.searching}>Searching for stations…</Text>
        ) : (
          stations.map(s => (
            <StationRow
              key={s.pubkey || s.name}
              s={s}
              active={playing === (s.pubkey || s.name)}
              onSelect={() => select(s)}
            />
          ))
        )}
      </ScrollView>

      {/* Audio + player dock — routed through Tor SOCKS by OnionOkHttpPlugin. Video is hidden (audio only).
          The loading dot breathes until onLoad/onProgress reports real playback, then becomes the stop. */}
      {playingStation ? (
        <>
          <Video
            source={{uri: withCookieCheck(playingStation.streamUrl)}}
            paused={false}
            playInBackground
            playWhenInactive
            progressUpdateInterval={250}
            // eslint-disable-next-line react-native/no-inline-styles
            style={{width: 0, height: 0}}
            onLoad={() => setLoading(false)}
            onProgress={e => {
              if (e.currentTime > 0) setLoading(false);
            }}
            onError={e => console.log('[RCV] video onError', JSON.stringify(e))}
          />
          <View style={styles.playerDock}>
            <PlayerBar station={playingStation} loading={loading} onStop={stop} />
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
  statusRow: {flexDirection: 'row', alignItems: 'center', marginBottom: 14},
  dirLabel: {color: C.text, fontSize: 15, fontWeight: '600'},
  searching: {
    color: C.muted,
    fontSize: 14,
    marginTop: 40,
    textAlign: 'center',
  },
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
  onion: {fontSize: 12, marginRight: 5, opacity: 0.45},
  host: {color: C.faint, fontSize: 12, flexShrink: 1},
  // Player dock — glued to the bottom of the screen.
  playerDock: {position: 'absolute', left: 12, right: 12, bottom: 16},
  playerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.card,
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: {width: 0, height: 4},
    elevation: 8,
  },
  playerMain: {flex: 1, marginRight: 12},
  playerName: {color: C.text, fontSize: 16, fontWeight: '600'},
  playerNow: {color: C.accent, fontSize: 13, marginTop: 3},
  playerRight: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadDot: {
    width: 15,
    height: 15,
    borderRadius: 8,
    backgroundColor: C.caching,
  },
  stopIcon: {color: C.accent, fontSize: 18},
});

export default App;

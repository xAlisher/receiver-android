#!/usr/bin/env bash
# Stand up a nwaku node peered into Logos delivery cluster 2, REST on :8645, for the RN app to poll.
# Then: adb reverse tcp:8645 tcp:8645  (phone → node over USB in dev).
set -e
docker rm -f radio-waku 2>/dev/null || true
PEERS=(
  "/dns4/delivery-01.do-ams3.logos.dev.status.im/tcp/30303/p2p/16Uiu2HAmTUbnxLGT9JvV6mu9oPyDjqHK4Phs1VDJNUgESgNSkuby"
  "/dns4/delivery-02.do-ams3.logos.dev.status.im/tcp/30303/p2p/16Uiu2HAmMK7PYygBtKUQ8EHp7EfaD3bCEsJrkFooK8RQ2PVpJprH"
  "/dns4/delivery-01.gc-us-central1-a.logos.dev.status.im/tcp/30303/p2p/16Uiu2HAm4S1JYkuzDKLKQvwgAhZKs9otxXqt8SCGtB4hoJP1S397"
  "/dns4/delivery-02.gc-us-central1-a.logos.dev.status.im/tcp/30303/p2p/16Uiu2HAm8Y9kgBNtjxvCnf1X6gnZJW5EGE4UwwCL3CCm55TwqBiH"
)
ARGS=""; for p in "${PEERS[@]}"; do ARGS="$ARGS --staticnode=$p"; done
docker run -d --name radio-waku -p 8645:8645 wakuorg/nwaku:latest \
  --cluster-id=2 --shard=2 --relay=true \
  --rest=true --rest-address=0.0.0.0 --rest-port=8645 --rest-allow-origin="*" \
  --nat=any --log-level=INFO $ARGS
echo "nwaku up — REST http://127.0.0.1:8645 · cluster 2 · shard 2 · topic /radio-basecamp/1/directory/json"

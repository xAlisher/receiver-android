// Pre-signed sample announces — 2 verified (autogen+keycard), 1 anonymous v1, 1 forgery (dropped in-app).
import type { Announce } from "../identity/verify";

export const SAMPLE_ANNOUNCES: Announce[] = [
  {
    "name": "Parallel Society Radio",
    "streamUrl": "http://psr7xexamplexonionxaddr.onion/live/audio.m3u8",
    "hostLabel": "onion",
    "nowPlaying": "Kode9 — Live Set (PS06)",
    "description": "Cypherpunk sound system",
    "announceTopic": "/radio-basecamp/1/directory/json",
    "privacy": "onion",
    "v": 2,
    "keySource": "autogen",
    "pubkey": "034f355bdcb7cc0af728ef3cceb9615d90684bb5b2ca5f859ab0f0b704075871aa",
    "sig": "d065cb85e28016640f4790aa7cee02d44cece6dd238ebfc07e305bf38fd6a31c7cb7264f5a8675fb00e7cdbd204b487951a9918d2ed7f67dbb5e9a3acfa9b42a"
  },
  {
    "name": "Station Signed by Keycard",
    "streamUrl": "http://kcxexamplexonionxaddr.onion/live/audio.m3u8",
    "hostLabel": "onion",
    "nowPlaying": "",
    "description": "Hardware-backed identity",
    "announceTopic": "/radio-basecamp/1/directory/json",
    "privacy": "onion",
    "v": 2,
    "keySource": "keycard",
    "pubkey": "02466d7fcae563e5cb09a0d1870bb580344804617879a14949cf22285f1bae3f27",
    "sig": "05d621fb38fddde032e2b805fa29342eeb9abdf960efd2f81926790a81d1963f04e0dd074b68d74fbc6cc444ceb3a7c45efb69503ffdc1cd5d4039d7e0ac52f3"
  },
  {
    "name": "Anonymous LAN Station",
    "streamUrl": "http://192.168.1.50:8080/live/audio.m3u8",
    "hostLabel": "192.168.1.50",
    "nowPlaying": "ambient test tone",
    "description": "",
    "announceTopic": "/radio-basecamp/1/directory/json",
    "privacy": "lan",
    "v": 1
  },
  {
    "name": "Parallel Society Radio (IMPOSTER)",
    "streamUrl": "http://psr7xexamplexonionxaddr.onion/live/audio.m3u8",
    "hostLabel": "onion",
    "nowPlaying": "Kode9 — Live Set (PS06)",
    "description": "Cypherpunk sound system",
    "announceTopic": "/radio-basecamp/1/directory/json",
    "privacy": "onion",
    "v": 2,
    "keySource": "autogen",
    "pubkey": "034f355bdcb7cc0af728ef3cceb9615d90684bb5b2ca5f859ab0f0b704075871aa",
    "sig": "d065cb85e28016640f4790aa7cee02d44cece6dd238ebfc07e305bf38fd6a31c7cb7264f5a8675fb00e7cdbd204b487951a9918d2ed7f67dbb5e9a3acfa9b42a"
  }
];

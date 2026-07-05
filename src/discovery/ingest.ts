// Ingest pipeline — mirrors receiver-basecamp's ingestAnnounce: verify signed announces, DROP forgeries,
// and build the display model (verified badge, PGP fingerprint, "IP hidden by Tor · <fp>" host line).

import { Announce, isSigned, verifyAnnounce, fingerprint } from "../identity/verify";

export interface Station {
  name: string;
  streamUrl: string;
  nowPlaying: string;
  description: string;
  pubkey: string;
  fingerprint: string; // "" when anonymous
  verified: boolean; // true = signed AND signature valid
  keySource: string; // "autogen" | "keycard" | ""
  privacy: string; // "onion" | "lan" | ""
  hostLabel: string;
  hostLine: string; // the identity-first subtitle
}

function isOnion(url: string, privacy?: string): boolean {
  return privacy === "onion" || /\.onion(\b|\/|:)/.test(url || "");
}

/** The subtitle a station shows: Tor stations lead with "IP hidden by Tor", verified ones append the fingerprint. */
function buildHostLine(a: Announce, onion: boolean, fp: string): string {
  if (onion) return fp ? `IP hidden by Tor · ${fp}` : "IP hidden by Tor";
  const host = (a.hostLabel as string) || "";
  return fp ? `${host} · ${fp}` : host || "LAN";
}

/**
 * Turn raw announces into displayable stations. A v>=2 announce with a bad signature is a forgery and is
 * DROPPED (never shown) — exactly like the desktop receiver. Unsigned (v1) announces pass through as
 * anonymous. Deduped by pubkey (verified) or name (anonymous), newest wins.
 */
export function ingest(announces: Announce[]): Station[] {
  const byKey = new Map<string, Station>();
  for (const a of announces) {
    if (!a.name) continue;
    const signed = isSigned(a);
    const verified = signed && verifyAnnounce(a);
    if (signed && !verified) continue; // forgery — drop

    const pubkey = (a.pubkey as string) || "";
    const fp = verified && pubkey ? fingerprint(pubkey) : "";
    const onion = isOnion(a.streamUrl as string, a.privacy as string);
    const station: Station = {
      name: a.name as string,
      streamUrl: (a.streamUrl as string) || "",
      nowPlaying: (a.nowPlaying as string) || "",
      description: (a.description as string) || "",
      pubkey,
      fingerprint: fp,
      verified,
      keySource: (a.keySource as string) || "",
      privacy: (a.privacy as string) || (onion ? "onion" : ""),
      hostLabel: (a.hostLabel as string) || "",
      hostLine: buildHostLine(a, onion, fp),
    };
    byKey.set(verified ? `k:${pubkey}` : `n:${station.name}`, station);
  }
  // verified stations first, then by name
  return Array.from(byKey.values()).sort(
    (x, y) => Number(y.verified) - Number(x.verified) || x.name.localeCompare(y.name)
  );
}

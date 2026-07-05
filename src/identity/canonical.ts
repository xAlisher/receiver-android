// Canonical JSON serialization matching Qt's `QJsonDocument(obj).toJson(QJsonDocument::Compact)`,
// which is what booth-basecamp signs over (the announce object MINUS its "sig" field).
//
// Qt compact JSON = keys sorted ascending, no whitespace, ints as ints. We replicate that here so a
// station signed on desktop verifies byte-for-byte on the phone. (Caveat: exotic non-ASCII escaping
// could differ from Qt; station announces are ASCII in practice. Revisit if unicode names appear.)

export function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value); // string / number / boolean / null
  }
  if (Array.isArray(value)) {
    return "[" + value.map(canonicalize).join(",") + "]";
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort(); // Qt stores/emits object keys sorted ascending
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + canonicalize(obj[k])).join(",") + "}";
}

// The exact bytes booth signs: canonical JSON of the announce with `sig` removed.
export function signedBytes(announce: Record<string, unknown>): Uint8Array {
  const { sig, ...rest } = announce;
  void sig;
  return new TextEncoder().encode(canonicalize(rest));
}

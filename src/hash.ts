import { createHash } from "node:crypto";

/**
 * Normalize signed raw hex for fingerprinting (DC1):
 * strip whitespace, optional 0x, lowercase. Does not hash a partial field bag.
 */
export function normalizeSignedRawHex(payload: string): string {
  let s = payload.replace(/\s+/g, "").toLowerCase();
  if (s.startsWith("0x")) s = s.slice(2);
  return s;
}

/** Stable payload hash = sha256 of normalized signed-raw hex (DC1). */
export function hashPayload(payload: string): string {
  const normalized = normalizeSignedRawHex(payload);
  return createHash("sha256").update(normalized, "utf8").digest("hex");
}

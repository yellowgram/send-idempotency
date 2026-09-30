import { hashPayload } from "./hash.js";
import type { IdempotencyStore } from "./store.js";
import type {
  IdempotencyDenyCode,
  IdempotencyPolicy,
  IdempotencyRecord,
  IdempotencyResult,
} from "./types.js";

/** Max idempotency key length in UTF-8 bytes (DC10). */
export const MAX_KEY_UTF8_BYTES = 255;

export interface IdempotencyInput {
  key?: string | null;
  /**
   * Exact signed raw transaction bytes as hex (with or without 0x).
   * Fingerprint = hash of normalized lowercase hex without whitespace (DC1).
   * Do not pass a partial JSON of to/value/data alone.
   */
  payload: string;
}

function storeDownResult(reason: string): IdempotencyResult {
  return {
    allow: false,
    decision: "deny",
    code: "idempotency_store_down",
    reason,
  };
}

function maybeDegrade(
  policy: IdempotencyPolicy,
  reason: string
): IdempotencyResult | null {
  if (!policy.degradeOnStoreDown) return null;
  console.error(
    `idempotency_degraded: ${reason} (fail-open armed; default is fail-closed)`
  );
  return {
    allow: true,
    decision: "proceed_first",
    reason: `idempotency degraded: ${reason}`,
  };
}

function fromExisting(
  existing: IdempotencyRecord,
  payloadHash: string
): IdempotencyResult {
  if (existing.payloadHash !== payloadHash) {
    return {
      allow: false,
      decision: "deny",
      code: "idempotency_conflict",
      reason: "idempotency key reused with different payload hash",
      record: existing,
    };
  }

  if (existing.status === "in_flight") {
    return {
      allow: false,
      decision: "deny",
      code: "idempotency_in_flight",
      reason:
        "idempotency key in flight — do not submit a second eth_sendRawTransaction",
      record: existing,
    };
  }

  // completed + same hash
  if (existing.terminal === "deny") {
    return {
      allow: false,
      decision: "deny",
      code: existing.denyCode ?? "idempotency_conflict",
      reason: "idempotency replay of prior deny (no re-submit)",
      record: existing,
    };
  }

  // completed terminal allow → replay_same (shape B: allow true + decision discriminant)
  return {
    allow: true,
    decision: "replay_same",
    record: existing,
  };
}

/**
 * Client key → remember hash / prior deny; conflict if payload differs; FC on store-down.
 * First-see claims in_flight atomically; complete via completeIdempotency (DC5/DC6).
 * NOT nonce-lease.
 */
export async function evaluateIdempotency(
  policy: IdempotencyPolicy,
  store: IdempotencyStore,
  input: IdempotencyInput
): Promise<IdempotencyResult> {
  if (!policy.enabled) {
    return { allow: true, decision: "proceed_first" };
  }

  if (store.isDown()) {
    const degraded = maybeDegrade(policy, "store isDown()");
    if (degraded) return degraded;
    return storeDownResult("idempotency store unavailable (fail-closed)");
  }

  const key = input.key?.trim() || "";
  if (!key) {
    if (policy.requireKey) {
      return {
        allow: false,
        decision: "deny",
        code: "idempotency_key_required",
        reason: "idempotency key required",
      };
    }
    // Optional key omitted → no dedup (DC9). Compose may still forward.
    return { allow: true, decision: "proceed_first" };
  }

  if (Buffer.byteLength(key, "utf8") > MAX_KEY_UTF8_BYTES) {
    return {
      allow: false,
      decision: "deny",
      code: "idempotency_key_required",
      reason: `idempotency key exceeds ${MAX_KEY_UTF8_BYTES} UTF-8 bytes`,
    };
  }

  const payloadHash = hashPayload(input.payload);

  let existing: IdempotencyRecord | undefined;
  try {
    existing = await store.get(key);
  } catch {
    const degraded = maybeDegrade(policy, "store get threw");
    if (degraded) return degraded;
    return storeDownResult("idempotency store get failed (fail-closed)");
  }

  if (!existing) {
    const record: IdempotencyRecord = {
      payloadHash,
      status: "in_flight",
    };
    let claimed: boolean;
    try {
      claimed = await store.tryClaim(key, record);
    } catch {
      const degraded = maybeDegrade(policy, "store tryClaim threw");
      if (degraded) return degraded;
      return storeDownResult("idempotency store tryClaim failed (fail-closed)");
    }
    if (claimed) {
      return { allow: true, decision: "proceed_first", record };
    }
    // Lost race — reload and treat as existing (DC5).
    try {
      existing = await store.get(key);
    } catch {
      const degraded = maybeDegrade(policy, "store get threw after claim race");
      if (degraded) return degraded;
      return storeDownResult("idempotency store get failed after claim race");
    }
    if (!existing) {
      return storeDownResult(
        "idempotency store inconsistent after claim race (fail-closed)"
      );
    }
  }

  return fromExisting(existing, payloadHash);
}

export interface CompleteIdempotencyOutcome {
  terminal: "allow" | "deny";
  denyCode?: IdempotencyDenyCode;
}

/**
 * Mark a first-see record completed after a known terminal outcome (DC6).
 * Call after upstream accepted, or after a definite local deny post-ownership.
 * Same key+hash while still in_flight → idempotency_in_flight (fail-closed toward double-submit).
 */
export async function completeIdempotency(
  store: IdempotencyStore,
  key: string,
  outcome: CompleteIdempotencyOutcome
): Promise<void> {
  const trimmed = key.trim();
  const existing = await store.get(trimmed);
  if (!existing) {
    throw new Error("completeIdempotency: no record for key");
  }
  if (existing.status === "completed") {
    return;
  }
  const next: IdempotencyRecord = {
    payloadHash: existing.payloadHash,
    status: "completed",
    terminal: outcome.terminal,
  };
  if (outcome.terminal === "deny" && outcome.denyCode) {
    next.denyCode = outcome.denyCode;
  }
  await store.set(trimmed, next);
}

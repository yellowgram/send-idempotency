export type IdempotencyDenyCode =
  | "idempotency_conflict"
  | "idempotency_store_down"
  | "idempotency_key_required"
  | "idempotency_in_flight";

export type IdempotencyDecision =
  | "proceed_first"
  | "replay_same"
  | "deny";

/** P0 record lifecycle: in_flight → completed (terminal allow or deny). */
export type IdempotencyRecordStatus = "in_flight" | "completed";

export interface IdempotencyRecord {
  payloadHash: string;
  status: IdempotencyRecordStatus;
  /** Present when status === "completed". */
  terminal?: "allow" | "deny";
  denyCode?: IdempotencyDenyCode;
}

export interface IdempotencyPolicy {
  enabled: boolean;
  /** When true, missing key → deny. Default false (key optional). */
  requireKey: boolean;
  /**
   * Opt-in fail-open when the store is down. Default false (fail-closed).
   * When armed, writes one stderr line containing `idempotency_degraded`.
   */
  degradeOnStoreDown?: boolean;
}

export interface IdempotencyResult {
  allow: boolean;
  /** Required discriminant — compose must not forward on allow alone. */
  decision: IdempotencyDecision;
  code?: IdempotencyDenyCode;
  reason?: string;
  record?: IdempotencyRecord;
}

export function defaultIdempotencyPolicy(): IdempotencyPolicy {
  return { enabled: true, requireKey: false, degradeOnStoreDown: false };
}

/**
 * Compose / middleware helper (DC4 shape B, DC7).
 * True only for `proceed_first` (including optional-key pass-through).
 * `replay_same` and all denies must not call eth_sendRawTransaction again.
 */
export function shouldForward(result: IdempotencyResult): boolean {
  return result.decision === "proceed_first";
}

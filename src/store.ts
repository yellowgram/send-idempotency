import type { IdempotencyRecord } from "./types.js";

/**
 * Pluggable store. P0 ships MemoryIdempotencyStore only (DC12).
 * No Redis/SQL adapters, TTL, or fleet sync in this package.
 */
export interface IdempotencyStore {
  get(key: string): Promise<IdempotencyRecord | undefined>;
  /**
   * Atomic first-see claim: insert only if key absent.
   * Returns true if this caller owns the first attempt; false if key already present.
   * Memory adapter is sync between has/set (single-flight for P0 tests).
   */
  tryClaim(key: string, record: IdempotencyRecord): Promise<boolean>;
  /** Update an existing record (in_flight → completed). */
  set(key: string, record: IdempotencyRecord): Promise<void>;
  /** When true, gate fail-closes with idempotency_store_down (unless degrade opt-in). */
  isDown(): boolean;
}

/** In-memory P0 store. No TTL / expiry (DC8). */
export class MemoryIdempotencyStore implements IdempotencyStore {
  private map = new Map<string, IdempotencyRecord>();
  private down = false;

  setDown(down: boolean): void {
    this.down = down;
  }

  isDown(): boolean {
    return this.down;
  }

  async get(key: string): Promise<IdempotencyRecord | undefined> {
    if (this.down) throw new Error("store_down");
    return this.map.get(key);
  }

  async tryClaim(key: string, record: IdempotencyRecord): Promise<boolean> {
    if (this.down) throw new Error("store_down");
    // No await between has and set → atomic on the Node event loop (DC5).
    if (this.map.has(key)) return false;
    this.map.set(key, { ...record });
    return true;
  }

  async set(key: string, record: IdempotencyRecord): Promise<void> {
    if (this.down) throw new Error("store_down");
    this.map.set(key, { ...record });
  }
}

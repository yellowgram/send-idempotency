import { describe, it, expect } from "vitest";
import {
  defaultIdempotencyPolicy,
  evaluateIdempotency,
  completeIdempotency,
  MemoryIdempotencyStore,
  hashPayload,
  normalizeSignedRawHex,
  shouldForward,
  MAX_KEY_UTF8_BYTES,
  type IdempotencyRecord,
  type IdempotencyStore,
} from "../src/api.js";

describe("evaluateIdempotency", () => {
  it("first key proceeds and records in_flight hash", async () => {
    const store = new MemoryIdempotencyStore();
    const r = await evaluateIdempotency(
      defaultIdempotencyPolicy(),
      store,
      { key: "k1", payload: "0xaaa" }
    );
    expect(r.allow).toBe(true);
    expect(r.decision).toBe("proceed_first");
    expect(r.record?.payloadHash).toBe(hashPayload("0xaaa"));
    expect(r.record?.status).toBe("in_flight");
    expect(shouldForward(r)).toBe(true);
  });

  it("same key same payload after complete → replay_same", async () => {
    const store = new MemoryIdempotencyStore();
    const p = defaultIdempotencyPolicy();
    await evaluateIdempotency(p, store, { key: "k1", payload: "0xaaa" });
    await completeIdempotency(store, "k1", { terminal: "allow" });
    const r = await evaluateIdempotency(p, store, {
      key: "k1",
      payload: "0xaaa",
    });
    expect(r.allow).toBe(true);
    expect(r.decision).toBe("replay_same");
    expect(r.record?.status).toBe("completed");
    expect(shouldForward(r)).toBe(false);
  });

  it("same key different payload → conflict", async () => {
    const store = new MemoryIdempotencyStore();
    const p = defaultIdempotencyPolicy();
    await evaluateIdempotency(p, store, { key: "k1", payload: "0xaaa" });
    await completeIdempotency(store, "k1", { terminal: "allow" });
    const r = await evaluateIdempotency(p, store, {
      key: "k1",
      payload: "0xbbb",
    });
    expect(r.allow).toBe(false);
    expect(r.code).toBe("idempotency_conflict");
    expect(shouldForward(r)).toBe(false);
  });

  it("store down → fail-closed", async () => {
    const store = new MemoryIdempotencyStore();
    store.setDown(true);
    const r = await evaluateIdempotency(
      defaultIdempotencyPolicy(),
      store,
      { key: "k1", payload: "0xaaa" }
    );
    expect(r.allow).toBe(false);
    expect(r.code).toBe("idempotency_store_down");
    expect(shouldForward(r)).toBe(false);
  });

  it("missing key when required → deny", async () => {
    const store = new MemoryIdempotencyStore();
    const p = defaultIdempotencyPolicy();
    p.requireKey = true;
    const r = await evaluateIdempotency(p, store, {
      key: "",
      payload: "0xaaa",
    });
    expect(r.allow).toBe(false);
    expect(r.code).toBe("idempotency_key_required");
  });

  it("missing key when optional → proceed (no dedup)", async () => {
    const store = new MemoryIdempotencyStore();
    const r = await evaluateIdempotency(
      defaultIdempotencyPolicy(),
      store,
      { payload: "0xaaa" }
    );
    expect(r.allow).toBe(true);
    expect(r.decision).toBe("proceed_first");
    expect(shouldForward(r)).toBe(true);
  });

  it("disabled → pass-through", async () => {
    const store = new MemoryIdempotencyStore();
    store.setDown(true);
    const p = defaultIdempotencyPolicy();
    p.enabled = false;
    const r = await evaluateIdempotency(p, store, {
      key: "k1",
      payload: "0xaaa",
    });
    expect(r.allow).toBe(true);
    expect(r.decision).toBe("proceed_first");
  });

  it("requireKey default is false", () => {
    expect(defaultIdempotencyPolicy().requireKey).toBe(false);
    expect(defaultIdempotencyPolicy().degradeOnStoreDown).toBe(false);
  });

  // DC13 (1): normalized 0xABC vs abc same hash → replay not conflict
  it("normalized 0xABC vs abc same hash → replay not conflict", async () => {
    const store = new MemoryIdempotencyStore();
    const p = defaultIdempotencyPolicy();
    expect(normalizeSignedRawHex("0xABC")).toBe("abc");
    expect(hashPayload("0xABC")).toBe(hashPayload("abc"));
    expect(hashPayload("0xAbC")).toBe(hashPayload("  ABC  "));
    await evaluateIdempotency(p, store, { key: "k-norm", payload: "0xABC" });
    await completeIdempotency(store, "k-norm", { terminal: "allow" });
    const r = await evaluateIdempotency(p, store, {
      key: "k-norm",
      payload: "abc",
    });
    expect(r.decision).toBe("replay_same");
    expect(r.code).toBeUndefined();
    expect(shouldForward(r)).toBe(false);
  });

  // DC13 (2): concurrent two first-sees → exactly one proceed_first
  it("concurrent two first-sees same key+payload → one proceed_first, other in_flight", async () => {
    const store = new MemoryIdempotencyStore();
    const p = defaultIdempotencyPolicy();
    const input = { key: "race-same", payload: "0xdeadbeef" };
    const [a, b] = await Promise.all([
      evaluateIdempotency(p, store, input),
      evaluateIdempotency(p, store, input),
    ]);
    const decisions = [a.decision, b.decision].sort();
    expect(decisions).toEqual(["deny", "proceed_first"]);
    const proceeds = [a, b].filter((r) => r.decision === "proceed_first");
    const inflight = [a, b].filter((r) => r.code === "idempotency_in_flight");
    expect(proceeds).toHaveLength(1);
    expect(inflight).toHaveLength(1);
    expect(shouldForward(proceeds[0]!)).toBe(true);
    expect(shouldForward(inflight[0]!)).toBe(false);
  });

  // DC13 (3): concurrent same key different payload → conflict for mismatch
  it("concurrent same key different payload → conflict for mismatching caller", async () => {
    const store = new MemoryIdempotencyStore();
    const p = defaultIdempotencyPolicy();
    // Serialize claim first so mismatch sees in_flight or completed with other hash
    const first = await evaluateIdempotency(p, store, {
      key: "race-diff",
      payload: "0xaaa",
    });
    expect(first.decision).toBe("proceed_first");
    const [again, mismatch] = await Promise.all([
      evaluateIdempotency(p, store, { key: "race-diff", payload: "0xaaa" }),
      evaluateIdempotency(p, store, { key: "race-diff", payload: "0xbbb" }),
    ]);
    expect(again.code).toBe("idempotency_in_flight");
    expect(mismatch.code).toBe("idempotency_conflict");
    expect(shouldForward(mismatch)).toBe(false);
  });

  // DC13 (4): shouldForward(replay_same) === false
  it("shouldForward(replay_same) === false", async () => {
    const store = new MemoryIdempotencyStore();
    const p = defaultIdempotencyPolicy();
    await evaluateIdempotency(p, store, { key: "sf", payload: "0x1" });
    await completeIdempotency(store, "sf", { terminal: "allow" });
    const r = await evaluateIdempotency(p, store, { key: "sf", payload: "0x1" });
    expect(r.decision).toBe("replay_same");
    expect(r.allow).toBe(true);
    expect(shouldForward(r)).toBe(false);

    // Simulated forwarder must not send on replay_same
    let upstreamCalls = 0;
    const simulatedForward = (result: typeof r) => {
      if (shouldForward(result)) upstreamCalls += 1;
    };
    simulatedForward(r);
    expect(upstreamCalls).toBe(0);
  });

  // DC13 (5): store get throw → idempotency_store_down
  it("store get throw → idempotency_store_down", async () => {
    const base = new MemoryIdempotencyStore();
    const throwingGet: IdempotencyStore = {
      isDown: () => false,
      get: async () => {
        throw new Error("boom");
      },
      tryClaim: (k, r) => base.tryClaim(k, r),
      set: (k, r) => base.set(k, r),
    };
    const r = await evaluateIdempotency(
      defaultIdempotencyPolicy(),
      throwingGet,
      { key: "k1", payload: "0xaaa" }
    );
    expect(r.allow).toBe(false);
    expect(r.code).toBe("idempotency_store_down");
  });

  // DC13 (6): completed deny replay same hash does not forward
  it("completed deny replay same hash does not forward", async () => {
    const store = new MemoryIdempotencyStore();
    const p = defaultIdempotencyPolicy();
    await evaluateIdempotency(p, store, { key: "deny-k", payload: "0xccc" });
    await completeIdempotency(store, "deny-k", {
      terminal: "deny",
      denyCode: "idempotency_conflict",
    });
    const r = await evaluateIdempotency(p, store, {
      key: "deny-k",
      payload: "0xccc",
    });
    expect(r.allow).toBe(false);
    expect(r.decision).toBe("deny");
    expect(r.code).toBe("idempotency_conflict");
    expect(shouldForward(r)).toBe(false);
  });

  // DC13 (7): key length >255 → deny
  it("key length >255 UTF-8 bytes → deny idempotency_key_required", async () => {
    const store = new MemoryIdempotencyStore();
    const longKey = "k".repeat(MAX_KEY_UTF8_BYTES + 1);
    expect(Buffer.byteLength(longKey, "utf8")).toBe(256);
    const r = await evaluateIdempotency(
      defaultIdempotencyPolicy(),
      store,
      { key: longKey, payload: "0xaaa" }
    );
    expect(r.allow).toBe(false);
    expect(r.code).toBe("idempotency_key_required");
    expect(shouldForward(r)).toBe(false);
  });

  it("in_flight retry same hash → idempotency_in_flight (no second proceed)", async () => {
    const store = new MemoryIdempotencyStore();
    const p = defaultIdempotencyPolicy();
    const first = await evaluateIdempotency(p, store, {
      key: "inflight",
      payload: "0xeee",
    });
    expect(first.decision).toBe("proceed_first");
    const second = await evaluateIdempotency(p, store, {
      key: "inflight",
      payload: "0xeee",
    });
    expect(second.allow).toBe(false);
    expect(second.code).toBe("idempotency_in_flight");
    expect(shouldForward(second)).toBe(false);
  });

  it("degradeOnStoreDown opt-in logs idempotency_degraded and proceeds", async () => {
    const store = new MemoryIdempotencyStore();
    store.setDown(true);
    const p = defaultIdempotencyPolicy();
    p.degradeOnStoreDown = true;
    const errs: string[] = [];
    const orig = console.error;
    console.error = (...args: unknown[]) => {
      errs.push(args.map(String).join(" "));
    };
    try {
      const r = await evaluateIdempotency(p, store, {
        key: "deg",
        payload: "0x1",
      });
      expect(r.allow).toBe(true);
      expect(r.decision).toBe("proceed_first");
      expect(errs.some((e) => e.includes("idempotency_degraded"))).toBe(true);
    } finally {
      console.error = orig;
    }
  });

  it("fingerprint is exact signed raw bytes — re-signed hex conflicts", async () => {
    const store = new MemoryIdempotencyStore();
    const p = defaultIdempotencyPolicy();
    // Two different signed-raw hex strings (simulating re-sign)
    await evaluateIdempotency(p, store, {
      key: "resign",
      payload: "0xf86c0185...",
    });
    await completeIdempotency(store, "resign", { terminal: "allow" });
    const r = await evaluateIdempotency(p, store, {
      key: "resign",
      payload: "0xf86c0299...",
    });
    expect(r.code).toBe("idempotency_conflict");
  });
});

describe("shouldForward compose contract", () => {
  it("only proceed_first forwards", () => {
    expect(
      shouldForward({ allow: true, decision: "proceed_first" })
    ).toBe(true);
    expect(
      shouldForward({ allow: true, decision: "replay_same" })
    ).toBe(false);
    expect(
      shouldForward({
        allow: false,
        decision: "deny",
        code: "idempotency_conflict",
      })
    ).toBe(false);
    expect(
      shouldForward({
        allow: false,
        decision: "deny",
        code: "idempotency_in_flight",
      })
    ).toBe(false);
  });
});

describe("MemoryIdempotencyStore atomic claim", () => {
  it("tryClaim is single-flight", async () => {
    const store = new MemoryIdempotencyStore();
    const rec: IdempotencyRecord = {
      payloadHash: "h",
      status: "in_flight",
    };
    const a = await store.tryClaim("x", rec);
    const b = await store.tryClaim("x", { ...rec, payloadHash: "other" });
    expect(a).toBe(true);
    expect(b).toBe(false);
    const got = await store.get("x");
    expect(got?.payloadHash).toBe("h");
  });
});

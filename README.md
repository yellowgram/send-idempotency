# send-idempotency

More from yellowgram: [OSS tools](https://www.yellowgram.dev/oss).

**Status:** public MIT · npm `send-idempotency@0.1.0` · no Polar

Client **idempotency key** → remember payload hash / prior deny; **conflict** if payload differs; **fail-closed** when the store is down. **NOT** nonce-lease (parked).

> **Charter:** [CHARTER.md](./CHARTER.md) — no Soft\* · no Polar/checkout · no custody

## Quick-start

```bash
npm install
npm test
npm run demo:offline
```

Offline allow / deny / conflict story: [`docs/DEMO.md`](./docs/DEMO.md).

## Honesty (locked)

The idempotency fingerprint is the hash of the exact signed raw transaction bytes. A re-signed transaction is a new payload; reuse the same key only for byte-identical retries.

replay_same means do not call eth_sendRawTransaction again. Checking allow alone is not enough.

P0 has no key TTL. Expiry that forgets a key can turn a retry into a second broadcast; durable TTL needs a later LaunchGate.

When requireKey is false and the client omits a key, this gate does not deduplicate. Agent submit paths that need retry safety must set requireKey true and send a key.

## Compose drop-in (DC4 shape B)

This package is the **idempotency key gate only**. It does not simulate, allowlist destinations, or bound approvals.

Typical send-rail order (siblings **mention only** — not redesigned here):

```
send-allow → send-approve-bound → send-permit2-bound → send-idempotency → (L2 Send Guard / eth_sendRawTransaction)
```

- **send-allow** — destination / native value gate
- **L2 Send Guard** — sim-before-send (separate package)
- **This package** — client key → hash / deny / conflict; use `shouldForward` before any second broadcast

`decision` is a required discriminant. Export `shouldForward(result)` — true **only** for `proceed_first`. Do not forward on `allow` alone.

Lifecycle: first-see writes `in_flight` and returns `proceed_first`; call `completeIdempotency` after a known terminal outcome; same key+hash while `in_flight` → `idempotency_in_flight`.

### Agent submit path (`requireKey` + `shouldForward`)

```ts
import {
  defaultIdempotencyPolicy,
  evaluateIdempotency,
  completeIdempotency,
  MemoryIdempotencyStore,
  shouldForward,
} from "send-idempotency";

// Agent paths that need retry safety: require a client key.
const policy = { ...defaultIdempotencyPolicy(), requireKey: true };
const store = new MemoryIdempotencyStore();

async function submitAgentRaw(key: string, signedRawHex: string) {
  const result = await evaluateIdempotency(policy, store, {
    key,
    payload: signedRawHex, // exact signed raw bytes (fingerprint SoT)
  });

  if (!shouldForward(result)) {
    // replay_same → do NOT call eth_sendRawTransaction again
    // deny → conflict / in_flight / store_down / key_required
    return result;
  }

  // decision === proceed_first only — safe to submit once
  await eth_sendRawTransaction(signedRawHex);
  await completeIdempotency(store, key, { terminal: "allow" });
  return result;
}
```

## Deny codes (P0)

| Code | Meaning |
| --- | --- |
| `idempotency_conflict` | same key, different payload hash |
| `idempotency_store_down` | store unavailable (fail-closed; degrade is opt-in only) |
| `idempotency_key_required` | key missing when required, or key longer than 255 UTF-8 bytes |
| `idempotency_in_flight` | same key already claimed; do not submit again |

## Keys

Opaque, non-secret client strings (prefer UUIDv4 / high-entropy random). Do not put private keys, seed phrases, passwords, or raw signed transactions into the key string. Max 255 UTF-8 bytes.

## Store

P0 ships `MemoryIdempotencyStore` plus `IdempotencyStore`. No Redis/SQL adapters, no TTL prune, no fleet sync in this package.

## License

MIT — [LICENSE](./LICENSE).

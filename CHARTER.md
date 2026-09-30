# send-idempotency — charter fences

**Status:** public GitHub · not on npm · LaunchGate-before-expansion  
**As of:** 2026-09-30 (ET)

This package is a **narrow** agent-ops middleware slice. Keep the surface honest. Public GitHub source is OK. No npm publish and no Polar until founder + LaunchGate.

## Job (P0)

Client **idempotency key** → remember payload hash / prior deny; **conflict** if payload differs on retry; **fail-closed** when the store is down.

- Agent retry ≠ double broadcast
- **NOT** nonce-lease (nonce-lease is PARKED — do not build here)

## Compose slot

```
… → send-approve-bound → send-permit2-bound → … → send-idempotency → … → Guard → submit
```

Orthogonal to Guard (sim) and Allow (dest). Not a mempool hold product.

## In scope (P0)

- Key + payload-hash store (in-memory for P0 scaffold; pluggable interface)
- Fingerprint = hash of exact signed raw bytes (normalized hex)
- Same key + same hash → replay prior decision / short-circuit duplicate submit (`shouldForward` false on `replay_same`)
- Same key + different hash → deny `idempotency_conflict`
- Atomic first-see → `in_flight`; complete → terminal; concurrent → `idempotency_in_flight`
- Store unavailable → **fail-closed** (or explicit degrade flag — default FC)
- offline `demo:offline` + unit tests
- MIT, self-hosted; public GitHub OK; not on npm until founder

## Out of scope / fences

| Fence | Meaning |
| --- | --- |
| **NOT nonce-lease** | Parked. Do not reserve nonces, hold mempool, or invent queue shields here. |
| **No key custody** | No signing. |
| **No Soft\*** | Forbidden. |
| **No Polar / checkout URLs** | None. |
| **No npm / Polar until founder** | Public GitHub OK. No `npm publish`, no Polar/checkout until LaunchGate + founder GO. |
| **No Safe / custody / SaaS / mainnet SLA** | Charter out. |
| **No distributed fleet ledger as product** | P0 is local store + interface; multi-instance fleet budget is separate / deferred. |
| **LaunchGate-before-expansion** | Durable Redis/SQL adapters, TTL productization, fleet sync need LaunchGate. |

## Fail modes (default)

| Case | Default | Notes |
| --- | --- | --- |
| Key conflict (payload hash differs) | **fail-closed** | `idempotency_conflict` |
| Store down / unavailable | **fail-closed** | `idempotency_store_down` |
| Missing key when `required` / key >255 UTF-8 bytes | **fail-closed** | `idempotency_key_required` |
| Concurrent / crash while in_flight | **fail-closed** | `idempotency_in_flight` |
| First seen key | claim `in_flight` + `proceed_first`; complete after terminal outcome | |

## Soft* ban

Forbidden: any Soft* monetization / conversion naming or copy in this package (including hyphenated or spaced Soft* WTP forms). Use Soft* only as the ban token.

## Acceptance sketch (tandem)

Idempotent retry with mutated payload → `idempotency_conflict` (sealed fixture).

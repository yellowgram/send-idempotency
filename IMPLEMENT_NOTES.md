# IMPLEMENT_NOTES — send-idempotency P0

**As of:** 2026-09-30 (ET)  
**Against:** `/workspace/send-idempotency-lg/DESIGN-GATE.md` PASS-with-conditions (DC1–DC15)  
**Artifact:** `/workspace/send-idempotency` (still `"private": true`, no remote, no npm publish)

## What changed vs scaffold

| Area | Scaffold | P0 implement |
| --- | --- | --- |
| Fingerprint | Hash of caller string as-is | Normalize signed-raw hex (strip `0x`/whitespace, lowercase) then sha256 (DC1) |
| Replay | `allow: true` + `replay_same` with comment-only short-circuit | Shape **B**: keep `allow`+`decision` discriminant; export `shouldForward` true only for `proceed_first` (DC4/DC7) |
| First-see | Non-atomic get+set completed `allow` | Atomic `tryClaim` → `in_flight`; `completeIdempotency` → `completed` (DC5/DC6) |
| Concurrent | Both could `proceed_first` | Second same-hash → `idempotency_in_flight`; different hash → `idempotency_conflict` |
| Prior deny | Not persisted | `completed` + `terminal: deny` replays deny; `shouldForward` false |
| Store-down | FC only | FC default; opt-in `degradeOnStoreDown` logs `idempotency_degraded` (DC3) |
| Keys | No length check | >255 UTF-8 bytes → `idempotency_key_required` (DC10) |
| Deny codes | 3 codes | Closed set + `idempotency_in_flight` (DC11); no `idempotency_replay` (shape B) |
| Middleware | Absent | Still evaluate-only; compose owns submit via `shouldForward` (DC15 N/A — no handler) |
| Docs | Scaffold deny table | Verbatim honesty lines DC2/DC4/DC8/DC9 in README; DC4+DC12 in SECURITY |
| package.json | private, no public URLs | Still private; **no** `repository` / `homepage` / `prepublishOnly` |

## DC checklist

| ID | Status | Notes |
| --- | --- | --- |
| DC1 | satisfied | `normalizeSignedRawHex` + `hashPayload`; input documented as exact signed raw hex |
| DC2 | satisfied | Conflict on any normalized-hex change; verbatim fingerprint line in README |
| DC3 | satisfied | Default FC; `degradeOnStoreDown` opt-in only; stderr contains `idempotency_degraded` |
| DC4 | satisfied | Shape B + `shouldForward`; verbatim replay line in README and SECURITY |
| DC5 | satisfied | `tryClaim` atomic; in-flight deny default; tests for race |
| DC6 | satisfied | `in_flight` → `completed`; crash/retry → `idempotency_in_flight`; prior deny replayable |
| DC7 | satisfied | `shouldForward(replay_same) === false` tested; simulated forwarder does not send |
| DC8 | satisfied | No TTL/expiry/prune; verbatim TTL line in README |
| DC9 | satisfied | `requireKey` default false; verbatim optional-key honesty in README |
| DC10 | satisfied | Max 255 UTF-8 bytes; SECURITY/README document non-secret keys |
| DC11 | satisfied | Closed set: conflict, store_down, key_required, in_flight |
| DC12 | satisfied | Interface + Memory only; verbatim store line in SECURITY |
| DC13 | satisfied | All (1)–(8) covered in tests + sealed demo |
| DC14 | satisfied | No nonce/mempool/custody/Polar/public URLs/Soft\* conversion; private; offline demo |
| DC15 | satisfied | No JSON-RPC handler in this P0; evaluate stays pure at edge via store I/O only |

## Rejected (not shipped)

R1–R16 from DESIGN-GATE remain rejected: no nonce-lease, no custody, no key-only store, no fail-open default, no partial-field fingerprint, no replay-as-submit, no TTL product, no Redis/SQL adapter, no fleet ledger, no public remote/npm/Polar, no Soft\* conversion copy, no silent `requireKey` flip, no fold into peer packages.

## Verification (this implement)

- `npm test` — **20 passed** (1 file: evaluate.test.ts)
- `npm run demo:offline` — OK, matches `docs/fixtures/offline.expected.txt`
- Soft*-WTP scan of package (excl. node_modules/dist): **0** hits; Soft* ban-token-only in CHARTER/README/demo/fixture
- `package.json`: `"private": true`; no `repository` / `homepage` / `prepublishOnly`

## DC still open

None of DC1–DC15 are left intentionally open for this P0. Expansion (Redis/SQL adapters, TTL productization, fleet sync, nonce-lease, JSON-RPC middleware handler) remains LaunchGate-gated and out of this implement. Slots 4–5 packages held.

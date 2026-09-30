# Changelog

## 0.1.0

- Non-custodial at-send idempotency: client key → remember payload hash / prior deny
- Conflict if payload differs; fail-closed when store is down; `in_flight` / `shouldForward` compose contract
- NOT nonce-lease (parked); MemoryIdempotencyStore + pluggable interface
- Offline `demo:offline` fixtures + vitest; sealed honesty lines
- Public MIT source on GitHub; **not published to npm**; no Polar

# Changelog

## 0.2.0

- Deprecated. Merged into `l2-send-guard` 1.x, which fixes nested-call decoding, EIP-7702 authorizations, cumulative limits, ungated submit methods and memory-only state. This version behaves like 0.1.0 and emits one `DeprecationWarning` on import.
- Removed internal planning files.

## 0.1.0

- Non-custodial at-send idempotency: client key → remember payload hash / prior deny
- Conflict if payload differs; fail-closed when store is down; `in_flight` / `shouldForward` compose contract
- NOT nonce-lease (parked); MemoryIdempotencyStore + pluggable interface
- Offline `demo:offline` with fixed fixtures, and tests
- MIT licensed

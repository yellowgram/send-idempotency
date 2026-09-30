# Offline demo

No keys, no capital, no public RPC. **NOT** nonce-lease.

```bash
npm ci
npm test
npm run build
npm run demo:offline
```

`demo:offline` exits non-zero if stdout drifts from [`fixtures/offline.expected.txt`](./fixtures/offline.expected.txt).

What it shows (sealed allow **and** deny/conflict):

1. First key → `allow=true` `decision=proceed_first` `shouldForward=true`
2. Retry same payload → `allow=true` `decision=replay_same` `shouldForward=false`
3. Retry mutated payload → deny `idempotency_conflict`
4. Store down → deny `idempotency_store_down`
5. Key required missing → deny `idempotency_key_required`
6. In-flight retry → deny `idempotency_in_flight` (first was `proceed_first`)

Fixture SoT. This package is the idempotency key gate only — compose after send-allow / approval peers; for sim-before-send use L2 Send Guard separately.

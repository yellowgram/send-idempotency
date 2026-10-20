# send-idempotency (deprecated)

**This package is merged into [`l2-send-guard`](https://github.com/yellowgram/l2-safety-proxy) 1.x and gets no more fixes.**
Version 0.2.0 behaves exactly like 0.1.0 and prints one deprecation warning when imported.

## Why

send-idempotency did one slice of a bigger job (idempotency keys for sends). On its own it had gaps that a single tool closes better:

- Keys lived in memory only: after a restart, a retry under the same key with a different transaction was sent. That is the double payment the package existed to stop.
- Memory grew with every key, with no TTL.
- A key whose send timed out stayed in flight forever, with no way to find out what happened.
- There was no proxy, so the key had no standard way to travel with a JSON-RPC send.

`l2-send-guard` 1.x checks every call inside a transaction against one policy file, gates EIP-7702
delegations, keeps rolling caps and idempotency keys in a persistent store, watches what arrives, and
ships a guarded signer that makes the policy binding for whoever holds the key.

## Migrating

```sh
npm uninstall send-idempotency
npm install l2-send-guard
```

What you used here is now the `Idempotency-Key` header on the proxy, `sendRawTransaction({ raw, idempotencyKey })` in `l2-send-guard/sdk`, or `guard.check(raw, { chainId, idempotencyKey })` in the library. A conflict is `-32087`, as before.
The full guide is at https://github.com/yellowgram/l2-safety-proxy#migrating.

## License

MIT

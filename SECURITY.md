# Security

send-idempotency records client idempotency keys and payload hashes to stop double-broadcast on agent retry. It does not custody keys, does not lease nonces, and is not a hosted service or mainnet SLA.

replay_same means do not call eth_sendRawTransaction again. Checking allow alone is not enough.

It ships an in-memory store and a store interface. There are no Redis or SQL adapters and no multi-instance sync; `l2-send-guard` 1.x has persistent file and Postgres stores.

Do not put private keys, seed phrases, passwords, or raw signed transactions into the idempotency key string. Prefer UUIDv4 / high-entropy random. Keys longer than 255 UTF-8 bytes are rejected.

Do not file public issues with funded raw transactions or private keys.

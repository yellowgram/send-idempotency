import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  defaultIdempotencyPolicy,
  evaluateIdempotency,
  completeIdempotency,
  MemoryIdempotencyStore,
  shouldForward,
} from "../dist/api.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const EXPECTED = join(root, "docs/fixtures/offline.expected.txt");
const lines = [];
const out = (s) => {
  lines.push(s);
  process.stdout.write(s + "\n");
};

out("send-idempotency offline demo");
out("no keys · no capital · no public RPC · NOT nonce-lease");
out("");

const store = new MemoryIdempotencyStore();
const p = defaultIdempotencyPolicy();

const r1 = await evaluateIdempotency(p, store, {
  key: "agent-op-1",
  payload: "0xraw1",
});
out(`1 first key → allow=${r1.allow} decision=${r1.decision} shouldForward=${shouldForward(r1)}`);

await completeIdempotency(store, "agent-op-1", { terminal: "allow" });

const r2 = await evaluateIdempotency(p, store, {
  key: "agent-op-1",
  payload: "0xraw1",
});
out(`2 retry same payload → allow=${r2.allow} decision=${r2.decision} shouldForward=${shouldForward(r2)}`);

const r3 = await evaluateIdempotency(p, store, {
  key: "agent-op-1",
  payload: "0xrawMUTATED",
});
out(`3 retry mutated payload → allow=${r3.allow} code=${r3.code}`);

store.setDown(true);
const r4 = await evaluateIdempotency(p, store, {
  key: "agent-op-2",
  payload: "0xraw2",
});
out(`4 store down → allow=${r4.allow} code=${r4.code}`);
store.setDown(false);

p.requireKey = true;
const r5 = await evaluateIdempotency(p, store, {
  key: "",
  payload: "0xraw3",
});
out(`5 key required missing → allow=${r5.allow} code=${r5.code}`);

const r6 = await evaluateIdempotency(defaultIdempotencyPolicy(), store, {
  key: "agent-op-3",
  payload: "0xrawInFlight",
});
const r7 = await evaluateIdempotency(defaultIdempotencyPolicy(), store, {
  key: "agent-op-3",
  payload: "0xrawInFlight",
});
out(`6 in-flight retry → allow=${r7.allow} code=${r7.code} (first was ${r6.decision})`);

out("");
out("charter: no Soft* · no Polar · no custody · LaunchGate-before-expansion");
out("honesty: replay_same means do not call eth_sendRawTransaction again. Checking allow alone is not enough.");

const expected = readFileSync(EXPECTED, "utf8").replace(/\r\n/g, "\n").trimEnd();
const actual = lines.join("\n").trimEnd();
if (actual !== expected) {
  console.error("[demo-offline] DRIFT");
  console.error("--- expected ---\n" + expected);
  console.error("--- actual ---\n" + actual);
  process.exit(1);
}
console.error("[demo-offline] OK — matches offline.expected.txt");

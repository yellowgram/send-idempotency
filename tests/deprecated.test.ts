import { describe, expect, it, vi } from "vitest";

describe("deprecation notice", () => {
  it("warns once per process, pointing at l2-send-guard", async () => {
    const spy = vi.spyOn(process, "emitWarning").mockImplementation(() => {});
    vi.resetModules();
    await import("../src/api.js");
    await import("../src/api.js");
    expect(spy).toHaveBeenCalledTimes(1); // importing the package is enough
    const { warnDeprecated } = await import("../src/deprecated.js");
    warnDeprecated();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(String(spy.mock.calls[0]![0])).toMatch(/send-idempotency is deprecated.*l2-send-guard 1\.x.*#migrating/);
    expect(spy.mock.calls[0]![1]).toMatchObject({ type: "DeprecationWarning" });
    spy.mockRestore();
  });
});

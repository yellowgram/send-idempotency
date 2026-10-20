import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

describe("packaging", () => {
  it("builds dist when packed, so a fresh clone publishes a working tarball", () => {
    expect(pkg.scripts.prepack).toMatch(/npm run build/);
    expect(pkg.files).toContain("dist");
  });
  it("ships the license, readme and changelog", () => {
    for (const f of ["LICENSE", "README.md", "CHANGELOG.md"]) expect(pkg.files).toContain(f);
    expect(pkg.license).toBe("MIT");
    expect(readFileSync(new URL("../LICENSE", import.meta.url), "utf8")).toMatch(/Copyright \(c\) 2026 yellowgram contributors/);
  });
  it("every entry point is inside dist", () => {
    const targets = [pkg.main, ...Object.values(pkg.bin ?? {}), ...Object.values(pkg.exports ?? {}).flatMap((e) => Object.values(e as object))].filter(Boolean);
    expect(targets.length).toBeGreaterThan(0);
    for (const t of targets) expect(String(t)).toMatch(/^\.\/dist\//);
  });
});

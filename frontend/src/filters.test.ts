// R9 (browser side): the TS filters must agree with VC3D/Python on every case
// in the SHARED tests/filter_cases.json — so the two implementations cannot drift.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FILTERS } from "./filters";

const dir = path.dirname(fileURLToPath(import.meta.url));
const cases: Array<{
  name: string;
  statuses: string[];
  vc_gsfs_mode: string | null;
  filter: string;
  keep: boolean;
}> = JSON.parse(readFileSync(path.join(dir, "../../tests/filter_cases.json"), "utf-8"));

describe("filter parity with VC3D / Python", () => {
  for (const c of cases) {
    it(c.name, () => {
      const rec = { statuses: c.statuses, vc_gsfs_mode: c.vc_gsfs_mode };
      expect(FILTERS[c.filter](rec)).toBe(c.keep);
    });
  }
});

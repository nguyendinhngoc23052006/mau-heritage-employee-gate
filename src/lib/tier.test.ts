import { describe, expect, it } from "vitest";
import { canActOn, canAssign, computeTier, ROLE_TIER } from "./tier";

describe("computeTier", () => {
  it("global role wins over everything", () => {
    expect(
      computeTier({
        globalRole: "ceo",
        directorOfCount: 2,
        storeRoles: ["employee"],
      }),
    ).toBe(1);
    expect(
      computeTier({
        globalRole: "sysadmin",
        directorOfCount: 0,
        storeRoles: [],
      }),
    ).toBe(1);
  });
  it("director of any sector is tier 2 even when also a store manager", () => {
    expect(
      computeTier({
        globalRole: null,
        directorOfCount: 1,
        storeRoles: ["manager"],
      }),
    ).toBe(2);
  });
  it("manager or legacy owner on any store is tier 3", () => {
    expect(
      computeTier({
        globalRole: null,
        directorOfCount: 0,
        storeRoles: ["owner"],
      }),
    ).toBe(3);
    expect(
      computeTier({
        globalRole: null,
        directorOfCount: 0,
        storeRoles: ["employee", "manager"],
      }),
    ).toBe(3);
  });
  it("employee-only and unassigned are both tier 4", () => {
    expect(
      computeTier({
        globalRole: null,
        directorOfCount: 0,
        storeRoles: ["employee"],
      }),
    ).toBe(4);
    expect(
      computeTier({
        globalRole: undefined,
        directorOfCount: 0,
        storeRoles: [],
      }),
    ).toBe(4);
  });
});

describe("canActOn — strictly below only", () => {
  it.each([
    [1, 2, true],
    [1, 4, true],
    [2, 3, true],
    [3, 4, true],
    [2, 2, false],
    [3, 3, false],
    [3, 2, false],
    [4, 4, false],
    [2, 1, false],
  ] as const)("tier %i acting on tier %i → %s", (me, target, ok) => {
    expect(canActOn(me, target)).toBe(ok);
  });
});

describe("canAssign — only roles below your own tier", () => {
  it("tier 1 assigns director, manager, employee but never ceo", () => {
    expect(canAssign(1, "director")).toBe(true);
    expect(canAssign(1, "manager")).toBe(true);
    expect(canAssign(1, "employee")).toBe(true);
    expect(canAssign(1, "ceo")).toBe(false);
  });
  it("a director assigns managers and employees, not directors", () => {
    expect(canAssign(2, "manager")).toBe(true);
    expect(canAssign(2, "employee")).toBe(true);
    expect(canAssign(2, "director")).toBe(false);
  });
  it("a manager assigns employees only — no peers", () => {
    expect(canAssign(3, "employee")).toBe(true);
    expect(canAssign(3, "manager")).toBe(false);
    expect(canAssign(3, "owner")).toBe(false);
  });
  it("an employee assigns nothing", () => {
    for (const role of Object.keys(ROLE_TIER) as (keyof typeof ROLE_TIER)[]) {
      expect(canAssign(4, role)).toBe(false);
    }
  });
});

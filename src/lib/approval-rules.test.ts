import { describe, expect, it } from "vitest";
import { canExecute } from "./approval-rules";

describe("canExecute", () => {
  it("allows only approved actions", () => {
    expect(canExecute("APPROVED")).toBe(true);
    expect(canExecute("PENDING")).toBe(false);
    expect(canExecute("REJECTED")).toBe(false);
  });
});

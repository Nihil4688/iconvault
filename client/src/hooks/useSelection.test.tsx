// Tests for the selection hook.
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useSelection } from "./useSelection";

describe("useSelection", () => {
  it("toggles ids on and off", () => {
    const { result } = renderHook(() => useSelection("a"));
    act(() => result.current.toggle("1"));
    act(() => result.current.toggle("2"));
    expect(result.current.ids).toEqual(["1", "2"]);
    expect(result.current.has("1")).toBe(true);
    act(() => result.current.toggle("1"));
    expect(result.current.ids).toEqual(["2"]);
    expect(result.current.size).toBe(1);
  });

  it("selects all and clears", () => {
    const { result } = renderHook(() => useSelection("a"));
    act(() => result.current.selectAll(["1", "2", "3"]));
    expect(result.current.size).toBe(3);
    act(() => result.current.clear());
    expect(result.current.ids).toEqual([]);
  });

  it("starts empty again when the reset key changes", () => {
    const { result, rerender } = renderHook(({ k }) => useSelection(k), { initialProps: { k: "a" } });
    act(() => result.current.selectAll(["1", "2"]));
    expect(result.current.size).toBe(2);
    rerender({ k: "b" });
    expect(result.current.ids).toEqual([]);
    expect(result.current.has("1")).toBe(false);
    act(() => result.current.toggle("9"));
    expect(result.current.ids).toEqual(["9"]);
  });
});

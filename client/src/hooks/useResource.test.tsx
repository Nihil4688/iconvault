// Tests for the data-loading hook: loading, data, errors, changing the key, reloading, and ignoring answers that arrive too late.
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useResource } from "./useResource";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("useResource", () => {
  it("is loading, then has data", async () => {
    const { result } = renderHook(() => useResource("a", async () => "hello"));
    expect(result.current.loading).toBe(true);
    expect(result.current.data).toBeUndefined();
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toBe("hello");
    expect(result.current.error).toBeNull();
  });

  it("does nothing while the key is null", () => {
    let calls = 0;
    const { result } = renderHook(() => useResource(null, async () => (calls += 1)));
    expect(result.current.loading).toBe(false);
    expect(result.current.data).toBeUndefined();
    expect(calls).toBe(0);
  });

  it("reports a failure as an error", async () => {
    const { result } = renderHook(() => useResource("a", async () => Promise.reject(new Error("boom"))));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error?.message).toBe("boom");
    expect(result.current.data).toBeUndefined();
  });

  it("wraps something that is not an Error", async () => {
    const { result } = renderHook(() => useResource("a", () => Promise.reject("plain text")));
    await waitFor(() => expect(result.current.error?.message).toBe("plain text"));
  });

  it("keeps the previous data while a new key loads, and hides the old error", async () => {
    const second = deferred<string>();
    const { result, rerender } = renderHook(({ k }) => useResource(k, () => (k === "first" ? Promise.resolve("one") : second.promise)), {
      initialProps: { k: "first" },
    });
    await waitFor(() => expect(result.current.data).toBe("one"));

    rerender({ k: "second" });
    expect(result.current.loading).toBe(true);
    expect(result.current.data).toBe("one");

    await act(async () => second.resolve("two"));
    expect(result.current.loading).toBe(false);
    expect(result.current.data).toBe("two");
  });

  it("keeps the last good data when a later load fails, and shows the error", async () => {
    let fail = false;
    const { result } = renderHook(() => useResource("a", async () => (fail ? Promise.reject(new Error("later")) : "good")));
    await waitFor(() => expect(result.current.data).toBe("good"));
    fail = true;
    act(() => result.current.reload());
    await waitFor(() => expect(result.current.error?.message).toBe("later"));
    expect(result.current.data).toBe("good");
  });

  it("loads again on reload()", async () => {
    let n = 0;
    const { result } = renderHook(() => useResource("a", async () => (n += 1)));
    await waitFor(() => expect(result.current.data).toBe(1));
    act(() => result.current.reload());
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.data).toBe(2));
  });

  it("ignores an answer that arrives after the key changed", async () => {
    const slow = deferred<string>();
    const fast = deferred<string>();
    const { result, rerender } = renderHook(({ k }) => useResource(k, () => (k === "slow" ? slow.promise : fast.promise)), { initialProps: { k: "slow" } });
    rerender({ k: "fast" });
    await act(async () => fast.resolve("fast answer"));
    await act(async () => slow.resolve("slow answer"));
    expect(result.current.data).toBe("fast answer");
  });

  it("uses the newest load function", async () => {
    const { result, rerender } = renderHook(({ text }) => useResource("a", async () => text), { initialProps: { text: "old" } });
    await waitFor(() => expect(result.current.data).toBe("old"));
    rerender({ text: "new" });
    act(() => result.current.reload());
    await waitFor(() => expect(result.current.data).toBe("new"));
  });
});

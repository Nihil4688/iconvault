// jsdom has no matchMedia. This installs a controllable one so tests can start in light or dark and then flip the "operating system" setting.
export function mockMatchMedia(initialDark: boolean) {
  let dark = initialDark;
  const listeners = new Set<(event: MediaQueryListEvent) => void>();

  window.matchMedia = ((query: string) => ({
    get matches() {
      return query.includes("prefers-color-scheme: dark") ? dark : false;
    },
    media: query,
    onchange: null,
    addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => listeners.add(listener),
    removeEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => listeners.delete(listener),
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;

  return {
    setDark(next: boolean) {
      dark = next;
      listeners.forEach((listener) => listener({ matches: next, media: "(prefers-color-scheme: dark)" } as MediaQueryListEvent));
    },
    listenerCount: () => listeners.size,
  };
}

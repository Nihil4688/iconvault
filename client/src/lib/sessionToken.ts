// Swaps the stored session token for a new one (after "sign out everywhere", which signs the other devices out and hands this one a fresh token). The signed-in user stays as it is.
export function replaceSessionToken(token: string): void {
  try {
    localStorage.setItem("sessionToken", token);
  } catch {
    // Storage can be blocked; the token still works for this page load.
  }
  window.__svgCompilerSessionToken = token;
}

// Page navigation helpers, kept in one place so tests can replace them (jsdom cannot reload a page).

export function reloadPage(): void {
  window.location.reload();
}

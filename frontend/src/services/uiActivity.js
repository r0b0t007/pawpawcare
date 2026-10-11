// What's on screen right now that nothing should interrupt: a toast still
// showing, or an open modal (every Sheet and ConfirmDialog is an
// AnimatedModal). Toast.js and AnimatedModal.js report here; the rating
// prompt (services/storeReview) waits until both are clear.

let toastUntil = 0;
let openModals = 0;

export function noteToast(durationMs, now = Date.now()) {
  toastUntil = Math.max(toastUntil, now + durationMs);
}

export function toastRemainingMs(now = Date.now()) {
  return Math.max(0, toastUntil - now);
}

export function modalOpened() {
  openModals += 1;
}

export function modalClosed() {
  openModals = Math.max(0, openModals - 1);
}

export function isModalOpen() {
  return openModals > 0;
}

export function __resetForTests() {
  toastUntil = 0;
  openModals = 0;
}

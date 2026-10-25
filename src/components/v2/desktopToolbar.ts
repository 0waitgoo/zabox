/** Only a double-click on free toolbar space requests the shared window toggle. */
export function requestToolbarToggle(event: { button: number; target: EventTarget | null; preventDefault(): void }): void {
  if (event.button !== 0 || !(event.target instanceof Element)) return;
  if (event.target.closest('button,a,input,textarea,select,[role="button"],[role="switch"],[role="checkbox"],[contenteditable="true"],[role="alert"]')) return;
  event.preventDefault();
  window.dispatchEvent(new Event('plan-toggle-header'));
}

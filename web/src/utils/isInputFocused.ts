/** Check if the currently focused element is a text input, textarea, or contenteditable */
export function isInputFocused(): boolean {
  const el = document.activeElement;
  return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || (el?.getAttribute('contenteditable') === 'true');
}

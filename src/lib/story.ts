/**
 * One control opens or folds every run of nights on a story line, wherever that line is shown: a warrior's in the
 * dialog or on the warband's page, and the warband's own chronicle. Wired once per page, however many lines it has.
 */
let wired = false;
export function wireNightFolds(): void {
  if (wired) return;
  wired = true;
  document.addEventListener('click', (e) => {
    const button = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-fold-nights]');
    if (!button) return;
    const shown = button.getAttribute('aria-pressed') !== 'true';
    button.setAttribute('aria-pressed', String(shown));
    button.textContent = shown ? 'Fold the nights' : 'Show the nights';
    button.closest('[data-story]')?.querySelectorAll<HTMLDetailsElement>('[data-nights]').forEach((d) => (d.open = shown));
  });
}

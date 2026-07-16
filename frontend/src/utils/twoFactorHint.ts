const STORAGE_KEY = 'villi-2fa-enabled-hint';

/** Remember that this browser has completed 2FA setup (hide login/register promos). */
export function markTwoFactorEnabledHint(): void {
  try {
    localStorage.setItem(STORAGE_KEY, '1');
  } catch {
    /* private mode / blocked storage */
  }
}

export function clearTwoFactorEnabledHint(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function shouldShowTwoFactorSetupHint(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== '1';
  } catch {
    return true;
  }
}

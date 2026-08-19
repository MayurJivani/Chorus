/**
 * Shares text through the OS share sheet where one exists, falling back to the clipboard.
 *
 * Both paths matter: on a phone the share sheet is the difference between "posted it" and
 * "copied something and forgot", while on desktop `navigator.share` is usually absent. A user
 * dismissing the share sheet rejects the promise, which is a cancellation rather than a failure
 * — so it resolves false and the caller shows no confirmation.
 */
export async function shareOrCopy(text: string): Promise<boolean> {
  if (navigator.share) {
    try {
      await navigator.share({ text });
      return true;
    } catch {
      // Dismissed, or unsupported for this payload — fall through to the clipboard.
    }
  }

  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

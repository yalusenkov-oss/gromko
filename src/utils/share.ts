/**
 * Share a URL using the native share API (mobile) or clipboard + toast (desktop).
 */
export async function shareUrl(opts: { title: string; text: string; url: string }): Promise<void> {
  try {
    if (navigator.share) {
      await navigator.share(opts);
      return;
    }
  } catch {
    // share cancelled or not supported — fall through to clipboard
  }

  try {
    await navigator.clipboard.writeText(opts.url);
    showCopiedToast();
  } catch {
    // clipboard failed silently
  }
}

/** Show a small "Ссылка скопирована" toast at the bottom of the screen */
function showCopiedToast() {
  // Remove any existing toast
  const existing = document.getElementById('gromko-share-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.id = 'gromko-share-toast';
  toast.textContent = '✓ Ссылка скопирована';
  Object.assign(toast.style, {
    position: 'fixed',
    bottom: '140px',
    left: '50%',
    transform: 'translateX(-50%)',
    background: 'rgba(34,197,94,0.95)',
    color: 'white',
    padding: '8px 20px',
    borderRadius: '12px',
    fontSize: '14px',
    fontWeight: '600',
    zIndex: '9999',
    pointerEvents: 'none',
    opacity: '0',
    transition: 'opacity 0.2s ease',
    backdropFilter: 'blur(8px)',
    boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
  });

  document.body.appendChild(toast);

  // Animate in
  requestAnimationFrame(() => {
    toast.style.opacity = '1';
  });

  // Animate out after 1.5s
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 1500);
}

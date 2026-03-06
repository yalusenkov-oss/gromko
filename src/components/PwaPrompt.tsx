import { useState, useEffect } from 'react';
import { useStore } from '../store';
import { X, Share, Plus } from 'lucide-react';

/**
 * Shows a one-time prompt after login/register suggesting the user
 * add the site to their home screen as a web app.
 * Only shows on mobile (non-standalone) and if not dismissed before.
 */
export default function PwaPrompt() {
  const { currentUser } = useStore();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Only show on mobile, not in standalone mode, and only once
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches
      || (navigator as any).standalone === true;
    const wasDismissed = localStorage.getItem('pwa-prompt-dismissed');
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

    if (currentUser && isMobile && !isStandalone && !wasDismissed) {
      const timer = setTimeout(() => setVisible(true), 1500);
      return () => clearTimeout(timer);
    }
  }, [currentUser]);

  const dismiss = () => {
    setVisible(false);
    localStorage.setItem('pwa-prompt-dismissed', '1');
  };

  if (!visible) return null;

  const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);

  return (
    <div className="fixed bottom-[calc(120px+env(safe-area-inset-bottom,0px))] left-4 right-4 z-[90] md:hidden animate-in">
      <div className="bg-zinc-900 border border-white/10 rounded-2xl p-4 shadow-2xl shadow-black/60">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 bg-red-500 rounded-xl flex items-center justify-center shrink-0 mt-0.5">
            <Plus size={20} className="text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-white text-sm font-semibold">Добавить на главный экран</h3>
            <p className="text-zinc-400 text-xs mt-1 leading-relaxed">
              {isIOS
                ? <>Нажмите <Share size={12} className="inline text-blue-400 -mt-0.5" /> внизу браузера, затем «На экран Домой» для быстрого доступа</>
                : <>Нажмите ⋮ в меню браузера, затем «Добавить на главный экран» для быстрого доступа</>
              }
            </p>
          </div>
          <button onClick={dismiss} className="w-7 h-7 rounded-full bg-white/5 flex items-center justify-center shrink-0 text-zinc-500 hover:text-white transition-colors">
            <X size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

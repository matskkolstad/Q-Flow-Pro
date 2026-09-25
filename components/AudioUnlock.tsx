import React, { useEffect, useState } from 'react';
import { Volume2 } from 'lucide-react';
import { audioService } from '../services/audioService';
import { useI18n } from '../context/I18nContext';

// Browsers block sound until someone interacts with the page. Displays show this button until then.
export const AudioUnlock: React.FC = () => {
  const { t } = useI18n();
  const [unlocked, setUnlocked] = useState(audioService.isUnlocked());

  useEffect(() => {
    const unsubscribe = audioService.onChange(setUnlocked);
    const unlock = () => { audioService.unlock(); };
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => {
      unsubscribe();
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  if (unlocked) return null;
  return (
    <button
      type="button"
      onClick={() => audioService.unlock()}
      className="fixed top-5 left-1/2 -translate-x-1/2 z-[60] flex items-center gap-3 bg-white text-gray-900 font-bold px-6 py-4 rounded-2xl shadow-2xl border border-gray-200 animate-pulse"
    >
      <Volume2 size={22} className="text-brand-600" /> {t('display.enableSound')}
    </button>
  );
};

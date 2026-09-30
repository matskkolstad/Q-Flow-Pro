import React from 'react';
import { useI18n } from '../context/I18nContext';

// Small NO/EN switch for public screens (kiosk, mobile, login).
export const LanguageToggle: React.FC<{ dark?: boolean; className?: string }> = ({ dark = false, className = '' }) => {
  const { language, setLanguage } = useI18n();
  const base = 'text-xs font-bold px-3 py-1.5 rounded-full border transition';
  const active = dark ? 'bg-white text-gray-900 border-white' : 'bg-brand-50 text-brand-700 border-brand-200';
  const idle = dark ? 'text-white/80 border-white/30 hover:border-white' : 'text-gray-600 border-gray-200 hover:border-brand-200 hover:text-brand-700';
  return (
    <div className={`flex gap-2 ${className}`} role="group" aria-label="Language / Språk">
      <button type="button" onClick={() => setLanguage('no')} aria-pressed={language === 'no'} className={`${base} ${language === 'no' ? active : idle}`}>Norsk</button>
      <button type="button" onClick={() => setLanguage('en')} aria-pressed={language === 'en'} className={`${base} ${language === 'en' ? active : idle}`}>English</button>
    </div>
  );
};

import React from 'react';
import { Layers } from 'lucide-react';

type LogoProps = {
  className?: string;
  textClass?: string;
  brandText?: string;
  brandLogoUrl?: string;
};

export const Logo: React.FC<LogoProps> = ({
  className = "h-10 w-10",
  textClass = "text-2xl font-black text-gray-900",
  brandText = 'Q-Flow Pro',
  brandLogoUrl,
}) => {
  const fallbackText = 'Q-Flow Pro';
  const normalized = typeof brandText === 'string' ? brandText.trim() : '';
  const effectiveText = normalized || fallbackText;
  const altText = effectiveText || fallbackText;
  const showText = effectiveText.length > 0;
  const useDefaultStyle = showText && effectiveText === fallbackText;

  return (
    <div className="inline-flex items-center gap-2 leading-none">
      {brandLogoUrl ? (
        <img
          src={brandLogoUrl}
          alt={altText}
          className={`object-contain rounded-xl shadow-sm bg-white flex-shrink-0 ${className}`}
        />
      ) : (
        <div className={`bg-indigo-600 rounded-xl p-2 text-white flex items-center justify-center shadow-sm flex-shrink-0 ${className}`}>
          <Layers size={24} />
        </div>
      )}
      {showText && (useDefaultStyle ? (
        <span className={`tracking-tight whitespace-nowrap ${textClass}`}>
          Q-Flow
          <span className="text-indigo-600">Pro</span>
        </span>
      ) : (
        <span className={`tracking-tight whitespace-nowrap ${textClass}`}>{effectiveText}</span>
      ))}
    </div>
  );
};

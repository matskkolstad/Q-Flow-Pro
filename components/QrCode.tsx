import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';

// Renders a QR code locally (no external service).
export const QrCode: React.FC<{ value: string; size?: number; className?: string; alt: string }> = ({ value, size = 180, className = '', alt }) => {
  const [dataUrl, setDataUrl] = useState('');
  useEffect(() => {
    let active = true;
    QRCode.toDataURL(value, { width: size, margin: 1 })
      .then((url) => { if (active) setDataUrl(url); })
      .catch(() => { if (active) setDataUrl(''); });
    return () => { active = false; };
  }, [value, size]);
  if (!dataUrl) return <div className={`bg-gray-100 rounded-xl animate-pulse ${className}`} style={{ width: size, height: size }} aria-hidden="true" />;
  return <img src={dataUrl} alt={alt} width={size} height={size} className={className} />;
};

// Public base URL for links/QR codes: the configured public URL, or the address this page was opened on.
export const publicBaseUrl = (configured?: string) => {
  if (configured) return configured.replace(/\/+$/, '');
  if (typeof window === 'undefined') return '';
  return `${window.location.origin}${window.location.pathname.replace(/\/+$/, '')}`;
};

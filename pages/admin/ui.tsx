import React, { useEffect, useState } from 'react';

// Small building blocks shared by the admin screens.

export const Card: React.FC<{ title?: React.ReactNode; description?: React.ReactNode; children: React.ReactNode; className?: string; actions?: React.ReactNode }> = ({ title, description, children, className = '', actions }) => (
  <section className={`bg-white border-2 border-gray-100 rounded-2xl p-5 md:p-6 ${className}`}>
    {(title || actions) && (
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          {title && <h3 className="font-bold text-gray-900 text-lg">{title}</h3>}
          {description && <p className="text-sm text-gray-600 mt-1">{description}</p>}
        </div>
        {actions}
      </div>
    )}
    {children}
  </section>
);

export const PageTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <h2 className="text-2xl md:text-3xl font-black text-gray-900 mb-6">{children}</h2>
);

export const Label: React.FC<{ htmlFor?: string; children: React.ReactNode }> = ({ htmlFor, children }) => (
  <label htmlFor={htmlFor} className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">{children}</label>
);

export const inputClass = 'w-full bg-white border-2 border-gray-200 rounded-xl px-3 py-2.5 focus:ring-4 focus:ring-brand-100 focus:border-brand-500 outline-none font-medium text-gray-900 disabled:bg-gray-50 disabled:text-gray-500';

export const Button: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' | 'ghost'; size?: 'sm' | 'md' | 'lg' }> = ({ variant = 'primary', size = 'md', className = '', ...props }) => {
  const variants = {
    primary: 'bg-brand-600 text-white hover:bg-brand-700 shadow-sm',
    secondary: 'bg-gray-100 text-gray-800 hover:bg-gray-200',
    danger: 'bg-red-50 text-red-700 hover:bg-red-100 border border-red-100',
    ghost: 'text-gray-600 hover:text-gray-900 hover:bg-gray-100',
  };
  const sizes = { sm: 'px-3 py-1.5 text-xs', md: 'px-4 py-2.5 text-sm', lg: 'px-6 py-4 text-lg' };
  return (
    <button
      type="button"
      {...props}
      className={`inline-flex items-center justify-center gap-2 rounded-xl font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${variants[variant]} ${sizes[size]} ${className}`}
    />
  );
};

export const Toggle: React.FC<{ checked: boolean; onChange: (checked: boolean) => void; label: React.ReactNode; description?: React.ReactNode; disabled?: boolean }> = ({ checked, onChange, label, description, disabled }) => (
  <label className={`flex items-start justify-between gap-4 py-2 ${disabled ? 'opacity-60' : 'cursor-pointer'}`}>
    <span>
      <span className="block font-bold text-gray-800">{label}</span>
      {description && <span className="block text-xs text-gray-500 mt-0.5">{description}</span>}
    </span>
    <input type="checkbox" className="mt-1 h-5 w-5 accent-brand-600 shrink-0" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
  </label>
);

// Shows "Saved" for a moment after an action succeeds.
export const useSavedFlag = () => {
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    if (!saved) return undefined;
    const timer = setTimeout(() => setSaved(false), 2500);
    return () => clearTimeout(timer);
  }, [saved]);
  return [saved, () => setSaved(true)] as const;
};

export const SavedHint: React.FC<{ show: boolean; text: string }> = ({ show, text }) => (
  show ? <span className="text-sm text-green-600 font-bold" role="status">{text}</span> : null
);

export const StatusDot: React.FC<{ online: boolean; label: string }> = ({ online, label }) => (
  <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-bold uppercase tracking-wide ${online ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
    <span className={`h-2 w-2 rounded-full ${online ? 'bg-green-500' : 'bg-red-500'}`}></span>
    {label}
  </span>
);

export const ColorSwatch: React.FC<{ color: string; className?: string }> = ({ color, className = 'w-5 h-5' }) => (
  <span className={`inline-block rounded-md border border-black/10 ${className}`} style={{ backgroundColor: color }} />
);

// Devices count as online when they sent a heartbeat recently (heartbeats every 15 s).
export const ONLINE_THRESHOLD_MS = 45_000;
export const isRecentlySeen = (lastSeen?: number) => !!lastSeen && Date.now() - lastSeen < ONLINE_THRESHOLD_MS;

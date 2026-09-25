import React from 'react';

// Service colours are either a hex colour (#2563eb) or a legacy Tailwind class (bg-blue-600).
export const isHex = (value?: string) => typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value);

const LEGACY_HEX: Record<string, string> = {
  'bg-blue-600': '#2563eb',
  'bg-red-600': '#dc2626',
  'bg-green-600': '#16a34a',
  'bg-emerald-600': '#059669',
  'bg-purple-600': '#9333ea',
  'bg-yellow-500': '#eab308',
  'bg-pink-600': '#db2777',
  'bg-gray-600': '#4b5563',
  'bg-gray-500': '#6b7280',
};

export const serviceHex = (color?: string) => (isHex(color) ? color! : LEGACY_HEX[color || ''] || '#6b7280');

// Props for an element that uses the service colour as background.
export const serviceBg = (color?: string, className = ''): { className: string; style?: React.CSSProperties } => (
  { className, style: { backgroundColor: serviceHex(color) } }
);

const hexToRgb = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

const mix = (rgb: number[], target: number[], amount: number) => rgb.map((c, i) => Math.round(c + (target[i] - c) * amount));

// Tailwind's indigo, used when no brand colour is set (keeps the original look exactly).
const DEFAULT_SCALE: Record<number, string> = {
  50: '238 242 255', 100: '224 231 255', 200: '199 210 254', 300: '165 180 252', 400: '129 140 248',
  500: '99 102 241', 600: '79 70 229', 700: '67 56 202', 800: '55 48 163', 900: '49 46 129',
};

// Builds a 50–900 scale around the brand colour (600 = the chosen colour) as "r g b" triplets.
export const brandScale = (hex?: string): Record<number, string> => {
  if (!isHex(hex)) return DEFAULT_SCALE;
  const base = hexToRgb(hex!);
  const white = [255, 255, 255];
  const black = [0, 0, 0];
  const steps: Record<number, number[]> = {
    50: mix(base, white, 0.93),
    100: mix(base, white, 0.86),
    200: mix(base, white, 0.72),
    300: mix(base, white, 0.52),
    400: mix(base, white, 0.28),
    500: mix(base, white, 0.12),
    600: base,
    700: mix(base, black, 0.15),
    800: mix(base, black, 0.3),
    900: mix(base, black, 0.45),
  };
  return Object.fromEntries(Object.entries(steps).map(([k, v]) => [Number(k), v.join(' ')]));
};

export const applyBrandColor = (hex?: string) => {
  if (typeof document === 'undefined') return;
  const scale = brandScale(hex);
  Object.entries(scale).forEach(([step, rgb]) => {
    document.documentElement.style.setProperty(`--brand-${step}`, rgb);
  });
};

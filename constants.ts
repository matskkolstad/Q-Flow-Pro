import { Service, Counter, User } from './types';

export const INITIAL_SERVICES: Service[] = [
  { id: 's1', name: 'Kundeservice', prefix: 'K', color: 'bg-blue-600', estimatedTimePerPersonMinutes: 5, isOpen: true },
  { id: 's2', name: 'Teknisk Support', prefix: 'T', color: 'bg-purple-600', estimatedTimePerPersonMinutes: 15, isOpen: true },
  { id: 's3', name: 'Levering & Retur', prefix: 'L', color: 'bg-emerald-600', estimatedTimePerPersonMinutes: 3, isOpen: true },
];

export const INITIAL_COUNTERS: Counter[] = [
  { id: 'c1', name: 'Skranke 1', activeServiceIds: ['s1', 's3'], isOnline: true },
  { id: 'c2', name: 'Skranke 2', activeServiceIds: ['s1', 's2', 's3'], isOnline: true },
  { id: 'c3', name: 'VIP Skranke', activeServiceIds: ['s2'], isOnline: false },
];

export const INITIAL_USERS: User[] = [
  { id: 'u1', name: 'Admin Bruker', role: 'ADMIN', username: 'admin' },
  { id: 'u2', name: 'Operatør Kari', role: 'OPERATOR', username: 'kari' },
  { id: 'u3', name: 'Operatør Ola', role: 'OPERATOR', username: 'ola' },
];

export const SOUNDS = {
  // A clear, resonant two-tone chime (Airport style)
  ding: 'https://cdn.freesound.org/previews/352/352651_4019029-lq.mp3', 
  // Mechanical receipt printer sound
  print: 'https://cdn.freesound.org/previews/337/337049_3232293-lq.mp3',
  // Soft interaction click
  alert: 'https://cdn.freesound.org/previews/253/253174_4404552-lq.mp3',
};
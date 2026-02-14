import { Ticket } from '../types';

// Send print via backend to avoid browser CORS/mixed-content problems
export const printTicket = async (
  ipAddress: string,
  ticket: Ticket,
  serviceName: string,
  waitTime: number,
  language: 'en' | 'no',
  brandText?: string,
  brandLogoUrl?: string,
): Promise<boolean> => {
  try {
    const res = await fetch('/api/print-ticket', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ipAddress, ticket, serviceName, waitTime, language, brandText, brandLogoUrl })
    });
    if (!res.ok) return false;
    const data = await res.json();
    return Boolean(data?.ok);
  } catch (error) {
    console.error('Printer request failed:', error);
    return false;
  }
};
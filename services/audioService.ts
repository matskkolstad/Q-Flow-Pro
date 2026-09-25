// Sounds are synthesized with the Web Audio API, so screens work without internet access.
// Browsers only allow audio after a user gesture; call unlock() from a click/tap handler.

type Effect = 'ding' | 'print' | 'alert';

class AudioService {
  private ctx: AudioContext | null = null;
  private voices: SpeechSynthesisVoice[] = [];
  private listeners = new Set<(unlocked: boolean) => void>();

  constructor() {
    if (typeof window === 'undefined') return;
    if ('speechSynthesis' in window) {
      this.voices = window.speechSynthesis.getVoices();
      window.speechSynthesis.onvoiceschanged = () => {
        this.voices = window.speechSynthesis.getVoices();
      };
    }
  }

  private context(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      this.ctx = new Ctor();
      this.ctx.onstatechange = () => this.notify();
    }
    return this.ctx;
  }

  private notify() {
    const unlocked = this.isUnlocked();
    this.listeners.forEach((fn) => fn(unlocked));
  }

  isUnlocked(): boolean {
    return this.context()?.state === 'running';
  }

  // Subscribe to lock/unlock changes (returns an unsubscribe function).
  onChange(fn: (unlocked: boolean) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  async unlock(): Promise<boolean> {
    const ctx = this.context();
    if (!ctx) return false;
    try {
      if (ctx.state !== 'running') await ctx.resume();
      // A silent tick completes the unlock on iOS.
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      gain.gain.value = 0;
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.01);
    } catch {
      // ignore
    }
    this.notify();
    return this.isUnlocked();
  }

  private tone(ctx: AudioContext, freq: number, start: number, duration: number, volume = 0.3, type: OscillatorType = 'sine') {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(gain).connect(ctx.destination);
    osc.start(start);
    osc.stop(start + duration + 0.05);
  }

  // Resolves when the effect has finished playing.
  playEffect(type: Effect): Promise<void> {
    const ctx = this.context();
    if (!ctx || ctx.state !== 'running') return Promise.resolve();
    const t = ctx.currentTime + 0.02;
    let length = 0;
    if (type === 'ding') {
      // Two-tone airport-style chime
      this.tone(ctx, 880, t, 0.9, 0.35);
      this.tone(ctx, 659.25, t + 0.45, 1.2, 0.35);
      length = 1.7;
    } else if (type === 'print') {
      for (let i = 0; i < 6; i += 1) this.tone(ctx, 1400 + (i % 2) * 200, t + i * 0.06, 0.05, 0.08, 'square');
      length = 0.45;
    } else {
      this.tone(ctx, 440, t, 0.25, 0.3, 'triangle');
      this.tone(ctx, 440, t + 0.3, 0.25, 0.3, 'triangle');
      length = 0.6;
    }
    return new Promise((resolve) => setTimeout(resolve, length * 1000));
  }

  private pickVoice(language: 'en' | 'no') {
    const prefixes = language === 'en' ? ['en-gb', 'en-us', 'en'] : ['nb', 'no', 'nn'];
    const preferred = ['google', 'natural', 'microsoft'];
    const candidates = this.voices.filter((v) => prefixes.some((p) => (v.lang || '').toLowerCase().startsWith(p)));
    return candidates.sort((a, b) => {
      const score = (v: SpeechSynthesisVoice) => preferred.findIndex((p) => v.name.toLowerCase().includes(p));
      const sa = score(a) === -1 ? 99 : score(a);
      const sb = score(b) === -1 ? 99 : score(b);
      return sa - sb;
    })[0];
  }

  // Chime (optional) followed by a spoken announcement.
  async announce(text: string, language: 'en' | 'no' = 'no', chime = true) {
    if (chime) await this.playEffect('ding');
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    const synth = window.speechSynthesis;
    if (synth.speaking) synth.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    const voice = this.pickVoice(language);
    if (voice) utterance.voice = voice;
    utterance.lang = language === 'en' ? 'en-GB' : 'nb-NO';
    utterance.rate = 0.95;
    utterance.pitch = language === 'en' ? 0.98 : 1.05;
    utterance.volume = 1.0;
    synth.speak(utterance);
  }
}

export const audioService = new AudioService();

import { SOUNDS } from '../constants';

class AudioService {
  private synth: SpeechSynthesis;
  private voices: SpeechSynthesisVoice[] = [];
  private unlocked = false;

  constructor() {
    this.synth = window.speechSynthesis;
    // Prime voices immediately (some browsers need an initial call)
    this.voices = this.synth.getVoices();
    if (speechSynthesis.onvoiceschanged !== undefined) {
      speechSynthesis.onvoiceschanged = () => {
        this.voices = this.synth.getVoices();
      };
    }
  }

  // Try to unlock audio after user gesture (required on some browsers)
  unlock(): Promise<void> {
    if (this.unlocked) return Promise.resolve();
    return new Promise(resolve => {
      const audio = new Audio(SOUNDS.ding);
      audio.volume = 0; // silent unlock attempt
      audio.play().catch(() => {}).finally(() => {
        audio.pause();
        this.unlocked = true;
        resolve();
      });
    });
  }

  playEffect(type: 'ding' | 'print' | 'alert'): Promise<void> {
    return new Promise(async (resolve) => {
      await this.unlock();
      const audio = new Audio(SOUNDS[type]);
      audio.volume = 0.8; // Increased volume
      
      audio.onended = () => resolve();
      audio.onerror = () => resolve(); // Resolve anyway on error
      
      audio.play().catch(e => {
        console.log("Audio interaction required:", e);
        resolve();
      });
    });
  }

  async announce(text: string, language: 'en' | 'no' = 'no') {
    await this.unlock();
    if (this.synth.speaking) {
      this.synth.cancel();
    }

    // 1. Play Chime first
    await this.playEffect('ding');

    // 2. Then Speak
    const utterThis = new SpeechSynthesisUtterance(text);

    // Prefer language-appropriate voice; bias to natural-sounding variants
    const preferredNames = ['google', 'natural', 'aria', 'jenny', 'guy', 'samantha', 'karen', 'daniel', 'emma'];
    const scoreVoice = (voice: SpeechSynthesisVoice, langs: string[]) => {
      const lang = (voice.lang || '').toLowerCase();
      let score = 0;
      if (langs.some(l => lang.startsWith(l))) score += 5;
      if (lang.includes('en-gb')) score += 2;
      if (lang.includes('en-us')) score += 2;
      if (lang.includes('nb') || lang.includes('no') || lang.includes('nn')) score += 2;
      const name = (voice.name || '').toLowerCase();
      if (preferredNames.some(p => name.includes(p))) score += 3;
      if (name.includes('google')) score += 2;
      if (name.includes('microsoft')) score += 1;
      return score;
    };

    const pickBest = (langs: string[]) => {
      return this.voices
        .map(v => ({ v, s: scoreVoice(v, langs) }))
        .sort((a, b) => b.s - a.s)
        .find(entry => entry.s > 0)?.v;
    };

    const voice = language === 'en'
      ? pickBest(['en-gb', 'en-us', 'en']) || pickBest(['nb-no', 'no-no', 'nb', 'nn', 'no'])
      : pickBest(['nb-no', 'no-no', 'nb', 'nn', 'no']) || pickBest(['en-gb', 'en-us', 'en']);

    if (voice) {
      utterThis.voice = voice;
    }

    utterThis.lang = language === 'en' ? 'en-GB' : 'nb-NO';

    // Softer tuning; slightly deeper for English
    if (language === 'en') {
      utterThis.rate = 0.95;
      utterThis.pitch = 0.98;
    } else {
      utterThis.rate = 0.95;
      utterThis.pitch = 1.05;
    }
    utterThis.volume = 1.0;
    
    this.synth.speak(utterThis);
  }
}

export const audioService = new AudioService();
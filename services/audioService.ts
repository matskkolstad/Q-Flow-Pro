import { SOUNDS } from '../constants';

class AudioService {
  private synth: SpeechSynthesis;
  private voices: SpeechSynthesisVoice[] = [];
  private unlocked = false;

  constructor() {
    this.synth = window.speechSynthesis;
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

  async announce(text: string) {
    await this.unlock();
    if (this.synth.speaking) {
      this.synth.cancel();
    }

    // 1. Play Chime first
    await this.playEffect('ding');

    // 2. Then Speak
    const utterThis = new SpeechSynthesisUtterance(text);
    
    // Prefer Norwegian Google voice or generic Norwegian
    const norwegianVoice = this.voices.find(v => v.name.includes('Google') && v.lang.includes('no')) ||
                           this.voices.find(v => v.lang === 'no-NO') || 
                           this.voices.find(v => v.lang === 'nb-NO');
    
    if (norwegianVoice) {
      utterThis.voice = norwegianVoice;
    }

    utterThis.rate = 0.9; 
    utterThis.pitch = 1.0;
    utterThis.volume = 1.0;
    
    this.synth.speak(utterThis);
  }
}

export const audioService = new AudioService();
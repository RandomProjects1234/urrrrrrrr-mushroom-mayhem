export class AudioManager {
  constructor() { this.volume = 0.45; this.context = null; this.voices = 0; }
  unlock() {
    try {
      if (!this.context) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;
        this.context = new AudioContext(); this.master = this.context.createGain();
        this.master.gain.value = this.volume; this.master.connect(this.context.destination);
        this.noise = this.context.createBuffer(1, this.context.sampleRate * 0.4, this.context.sampleRate);
        const data = this.noise.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      }
      this.context.resume().catch(() => {});
    } catch { /* Audio is optional; blocked or unavailable devices never stop gameplay. */ }
  }
  setVolume(volume) { this.volume = volume; if (this.master) this.master.gain.value = volume; }
  tone(frequency, duration, type = 'sine', end = frequency, volume = 0.3, delay = 0) {
    if (!this.context || this.context.state !== 'running' || this.voices >= 24) return;
    const at = this.context.currentTime + delay;
    const oscillator = this.context.createOscillator(), gain = this.context.createGain();
    oscillator.type = type; oscillator.frequency.setValueAtTime(frequency, at);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, end), at + duration);
    gain.gain.setValueAtTime(volume, at); gain.gain.exponentialRampToValueAtTime(0.001, at + duration);
    oscillator.connect(gain); gain.connect(this.master); oscillator.start(at); oscillator.stop(at + duration);
    this.voices++; oscillator.onended = () => { this.voices--; oscillator.disconnect(); gain.disconnect(); };
  }
  play(type, attenuation = 1) {
    if (!this.context || attenuation <= 0 || !this.volume) return;
    try {
      const v = 0.22 * attenuation;
      if (type === 'explosion' || type === 'stomp') {
        this.tone(type === 'stomp' ? 75 : 115, 0.4, 'triangle', 25, v * 2);
        if (this.voices >= 24) return;
        const source = this.context.createBufferSource(), filter = this.context.createBiquadFilter(), gain = this.context.createGain();
        source.buffer = this.noise; filter.type = 'lowpass'; filter.frequency.value = 650;
        gain.gain.setValueAtTime(v, this.context.currentTime); gain.gain.exponentialRampToValueAtTime(0.001, this.context.currentTime + 0.35);
        source.connect(filter); filter.connect(gain); gain.connect(this.master); source.start();
        this.voices++; source.onended = () => { this.voices--; source.disconnect(); filter.disconnect(); gain.disconnect(); };
      } else if (type === 'urrrr') {
        this.tone(140, 1.2, 'sawtooth', 42, v * 0.7);
        this.tone(146, 1.2, 'sawtooth', 46, v * 0.5);
      } else if (type === 'pickup') {
        this.tone(500, 0.12, 'square', 650, v * 0.4); this.tone(800, 0.17, 'square', 1100, v * 0.4, 0.1);
      } else if (type === 'end') {
        [440, 554, 659, 880].forEach((frequency, i) => this.tone(frequency, 0.4, 'triangle', frequency, v, i * 0.12));
      } else if (type === 'jump') this.tone(180, 0.16, 'sine', 420, v);
      else if (type === 'launch') this.tone(550, 0.35, 'triangle', 70, v);
      else this.tone(360, 0.06, 'square', 290, v * 0.3);
    } catch { /* Synthesized sound requires no files, network, or copyrighted assets. */ }
  }
  dispose() { this.context?.close().catch(() => {}); }
}

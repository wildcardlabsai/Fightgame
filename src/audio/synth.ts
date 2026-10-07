/** Procedural sound design: every cue is synthesised with Web Audio, so there are no audio files to ship or license. */
import type { AudioBackend } from './audioManager'
import type { CueId } from './cues'

type Wave = OscillatorType

/** Level of the ambient bed relative to the fight-bus gain (kept well under the effects). */
const AMB_PEAK = 0.9
/**
 * Per-cue make-up gain. Measured at the speaker output in a real browser: the original UI cues peaked around −28 dBFS, which is
 * effectively inaudible on laptop speakers. These bring UI to roughly −17…−14 dBFS, effects to −10…−6 and fight moments to −6…−3,
 * while the compressor keeps stacked cues from clipping.
 */
const BOOST: Partial<Record<CueId, number>> = {
  click: 3.6, navigate: 3.6, tab: 3.6, dropdown: 3.6, toggle: 3.6, modalOpen: 3.4, modalClose: 3.4, save: 3, notification: 3, warning: 2.6, success: 2.8, error: 2.6,
  contractAccepted: 2.4, contractRejected: 2.4, fightScheduled: 2.6, eventIntro: 2.2, eventStarted: 2, mainEvent: 1.8, fightTransition: 2.4, resultAnnounce: 2.2, eventCompleted: 2.2,
  crowdAmbience: 5, bell: 1.9, roundEnd: 1.7, crowd: 4.5, knockdown: 1.7, ko: 1.6, decision: 2.2, fightIntro: 2, punch: 2.6, count: 3, getUp: 2.4, stoppage: 1.8, titleAnnounce: 2.2, revenue: 2.6, majorResult: 2.2, finalBell: 2.0,
}

export class WebAudioBackend implements AudioBackend {
  private ctx: AudioContext | null = null
  private out: GainNode | null = null
  private noiseBuf: AudioBuffer | null = null
  private analyser: AnalyserNode | null = null
  private stateCb: (() => void) | null = null
  private amb: { src: AudioBufferSourceNode; gain: GainNode; lfo: OscillatorNode | null } | null = null
  onState(cb: () => void): void { this.stateCb = cb }
  private buf: Float32Array<ArrayBuffer> | null = null
  get ready(): boolean { return !!this.ctx && this.ctx.state === 'running' }

  unlock(): void {
    try {
      if (!this.ctx) {
        const AC = (typeof window !== 'undefined' && (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)) || null
        if (!AC) return
        this.ctx = new AC()
        const comp = this.ctx.createDynamicsCompressor() // keeps stacked cues from clipping
        this.out = this.ctx.createGain()
        this.out.gain.value = 0.9
        this.analyser = this.ctx.createAnalyser()
        this.analyser.fftSize = 1024
        this.buf = new Float32Array(this.analyser.fftSize) as Float32Array<ArrayBuffer>
        this.out.connect(comp).connect(this.analyser).connect(this.ctx.destination)
        this.ctx.onstatechange = () => this.stateCb?.()
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume().then(() => this.stateCb?.())
    } catch { /* audio is optional: never break the game */ }
  }

  /** Peak absolute sample level (0–1) of what is being sent to the speakers right now. Used to PROVE sound is produced. */
  peak(): number {
    if (!this.analyser || !this.buf) return 0
    this.analyser.getFloatTimeDomainData(this.buf)
    let m = 0
    for (let i = 0; i < this.buf.length; i++) { const v = Math.abs(this.buf[i]); if (v > m) m = v }
    return m
  }
  get state(): string { return this.ctx?.state ?? 'none' }

  stopAll(): void {
    try { if (this.out && this.ctx) { this.out.gain.cancelScheduledValues(this.ctx.currentTime); this.out.gain.setValueAtTime(0, this.ctx.currentTime); this.out.gain.linearRampToValueAtTime(0.9, this.ctx.currentTime + 0.12) } } catch { /* ignore */ }
  }

  play(cue: CueId, gain: number): void {
    if (!this.ctx || !this.out) return
    const go = () => { try { this.render(cue, gain * (BOOST[cue] ?? 1)) } catch { /* ignore */ } }
    if (this.ctx.state === 'running') { go(); return }
    // The context may still be resuming right after the first click: play as soon as it is running instead of dropping the cue.
    if (this.ctx.state === 'suspended') void this.ctx.resume().then(() => { if (this.ctx?.state === 'running') go() }).catch(() => undefined)
  }

  /**
   * Looping arena bed: a seamless noise loop shaped into a crowd murmur, with a slow swell. Sits well below the effects.
   * `reducedMotion` keeps it steady (no swelling).
   */
  startAmbience(gain: number): void {
    if (!this.ctx || !this.out) return
    if (this.amb) { this.amb.gain.gain.setTargetAtTime(gain * AMB_PEAK, this.ctx.currentTime, 0.2); return }
    try {
      const c = this.ctx
      this.ensureNoise()
      const src = c.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true
      const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 220
      const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 700; bp.Q.value = 0.35
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2600
      const g = c.createGain(); g.gain.setValueAtTime(0.0001, c.currentTime); g.gain.setTargetAtTime(gain * AMB_PEAK, c.currentTime, 0.8)
      let lfo: OscillatorNode | null = null
      const reduced = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
      if (!reduced) {
        lfo = c.createOscillator(); lfo.frequency.value = 0.13
        const depth = c.createGain(); depth.gain.value = gain * AMB_PEAK * 0.35
        lfo.connect(depth).connect(g.gain); lfo.start()
      }
      src.connect(hp).connect(bp).connect(lp).connect(g).connect(this.out)
      src.start()
      this.amb = { src, gain: g, lfo }
    } catch { /* ignore */ }
  }
  setAmbienceGain(gain: number): void { if (this.amb && this.ctx) this.amb.gain.gain.setTargetAtTime(gain * AMB_PEAK, this.ctx.currentTime, 0.15) }
  stopAmbience(): void {
    if (!this.amb || !this.ctx) return
    const a = this.amb; this.amb = null
    try { a.gain.gain.cancelScheduledValues(this.ctx.currentTime); a.gain.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.12); const stopAt = this.ctx.currentTime + 0.6; a.src.stop(stopAt); a.lfo?.stop(stopAt) } catch { /* ignore */ }
  }
  get ambienceRunning(): boolean { return !!this.amb }
  private ensureNoise(): void {
    const c = this.ctx!
    if (this.noiseBuf) return
    const len = c.sampleRate * 2
    this.noiseBuf = c.createBuffer(1, len, c.sampleRate)
    const d = this.noiseBuf.getChannelData(0)
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1
  }

  // ---- building blocks ----
  private tone(freq: number, start: number, dur: number, gain: number, type: Wave = 'sine', slideTo?: number): void {
    const c = this.ctx!, t = c.currentTime + start
    const o = c.createOscillator(), g = c.createGain()
    o.type = type
    o.frequency.setValueAtTime(freq, t)
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur)
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + Math.min(0.012, dur / 3))
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    o.connect(g).connect(this.out!)
    o.start(t); o.stop(t + dur + 0.02)
  }

  private noise(start: number, dur: number, gain: number, freq: number, q = 0.8, type: BiquadFilterType = 'bandpass', swell = false): void {
    const c = this.ctx!, t = c.currentTime + start
    this.ensureNoise()
    const s = c.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q
    const g = c.createGain()
    g.gain.setValueAtTime(0.0001, t)
    if (swell) { g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + dur * 0.55); g.gain.exponentialRampToValueAtTime(0.0001, t + dur) }
    else { g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur) }
    s.connect(f).connect(g).connect(this.out!)
    s.start(t, Math.random()); s.stop(t + dur + 0.02)
  }

  private bell(g: number, t = 0): void {
    for (const [mult, amp, dur] of [[1, 1, 1.6], [2.4, 0.5, 1.1], [3.8, 0.28, 0.7]] as const) this.tone(660 * mult, t, dur, g * 0.35 * amp, 'sine')
  }

  private render(cue: CueId, g: number): void {
    switch (cue) {
      case 'click': this.tone(1500, 0, 0.035, g * 0.18, 'triangle'); break
      case 'navigate': this.tone(520, 0, 0.07, g * 0.2, 'triangle'); this.tone(780, 0.045, 0.08, g * 0.16, 'triangle'); break
      case 'tab': this.tone(980, 0, 0.05, g * 0.18, 'triangle'); break
      case 'dropdown': this.tone(640, 0, 0.05, g * 0.16, 'sine', 820); break
      case 'toggle': this.tone(720, 0, 0.04, g * 0.18, 'square'); this.tone(1080, 0.04, 0.05, g * 0.12, 'square'); break
      case 'modalOpen': this.tone(420, 0, 0.12, g * 0.18, 'sine', 680); break
      case 'modalClose': this.tone(620, 0, 0.1, g * 0.15, 'sine', 380); break
      case 'save': this.tone(660, 0, 0.09, g * 0.2, 'sine'); this.tone(990, 0.08, 0.14, g * 0.2, 'sine'); break
      case 'notification': this.tone(880, 0, 0.1, g * 0.2, 'sine'); this.tone(1175, 0.09, 0.14, g * 0.17, 'sine'); break
      case 'warning': this.tone(466, 0, 0.14, g * 0.24, 'triangle'); this.tone(466, 0.2, 0.18, g * 0.24, 'triangle'); break
      case 'success': this.tone(523, 0, 0.1, g * 0.2, 'sine'); this.tone(659, 0.09, 0.1, g * 0.2, 'sine'); this.tone(784, 0.18, 0.2, g * 0.2, 'sine'); break
      case 'error': this.tone(300, 0, 0.16, g * 0.22, 'sawtooth', 220); break
      case 'contractAccepted': this.tone(392, 0, 0.12, g * 0.22, 'sine'); this.tone(523, 0.1, 0.12, g * 0.22, 'sine'); this.tone(659, 0.2, 0.28, g * 0.24, 'sine'); this.tone(1047, 0.2, 0.4, g * 0.1, 'sine'); break
      case 'contractRejected': this.tone(330, 0, 0.14, g * 0.22, 'triangle'); this.tone(247, 0.13, 0.26, g * 0.22, 'triangle'); break
      case 'fightScheduled': this.tone(587, 0, 0.08, g * 0.2, 'triangle'); this.tone(740, 0.08, 0.14, g * 0.2, 'triangle'); this.noise(0.02, 0.05, g * 0.05, 3000); break
      case 'eventIntro': this.noise(0, 1.4, g * 0.16, 700, 0.5, 'bandpass', true); this.tone(196, 0, 1.0, g * 0.12, 'sawtooth'); this.tone(294, 0.15, 0.9, g * 0.1, 'sawtooth'); break
      case 'eventStarted': this.bell(g * 0.7); this.noise(0.1, 1.5, g * 0.14, 900, 0.5, 'bandpass', true); break
      case 'mainEvent': this.tone(130, 0, 1.4, g * 0.2, 'sawtooth', 196); this.tone(196, 0.5, 1.1, g * 0.16, 'sawtooth', 294); this.noise(0, 1.8, g * 0.2, 1100, 0.5, 'bandpass', true); this.bell(g * 0.6, 1.2); break
      case 'fightTransition': this.noise(0, 0.35, g * 0.16, 1800, 1.2); this.tone(220, 0, 0.3, g * 0.1, 'sine', 440); break
      case 'resultAnnounce': this.tone(392, 0, 0.14, g * 0.2, 'triangle'); this.tone(523, 0.16, 0.14, g * 0.2, 'triangle'); this.tone(784, 0.32, 0.4, g * 0.22, 'triangle'); break
      case 'eventCompleted': this.tone(523, 0, 0.2, g * 0.2, 'sine'); this.tone(659, 0.2, 0.2, g * 0.2, 'sine'); this.tone(784, 0.4, 0.2, g * 0.2, 'sine'); this.tone(1047, 0.6, 0.6, g * 0.22, 'sine'); this.noise(0, 1.8, g * 0.1, 1000, 0.5, 'bandpass', true); break
      case 'crowdAmbience': this.noise(0, 3, g * 0.1, 650, 0.4, 'bandpass', true); break
      case 'bell': this.bell(g); break
      case 'roundEnd': for (let i = 0; i < 3; i++) this.bell(g * 0.9, i * 0.45); break
      case 'crowd': this.noise(0, 1.6, g * 0.22, 900, 0.5, 'bandpass', true); break
      case 'knockdown': this.tone(95, 0, 0.35, g * 0.45, 'sine', 45); this.noise(0, 0.25, g * 0.3, 260, 0.9, 'lowpass'); this.noise(0.1, 1.2, g * 0.16, 1000, 0.5, 'bandpass', true); break
      case 'ko': this.tone(90, 0, 0.5, g * 0.5, 'sine', 40); this.noise(0, 0.3, g * 0.35, 240, 0.9, 'lowpass'); this.noise(0.15, 2.2, g * 0.22, 1000, 0.5, 'bandpass', true); break
      case 'fightIntro': this.tone(120, 0, 0.22, g * 0.4, 'sine', 48); this.tone(120, 0.4, 0.22, g * 0.4, 'sine', 48); this.tone(120, 0.8, 0.3, g * 0.45, 'sine', 44); this.tone(98, 0.1, 1.5, g * 0.16, 'sawtooth', 196); this.noise(0, 1.8, g * 0.2, 900, 0.5, 'bandpass', true); break
      case 'punch': this.tone(150, 0, 0.12, g * 0.4, 'sine', 62); this.noise(0, 0.07, g * 0.3, 380, 0.8, 'lowpass'); this.noise(0.02, 0.18, g * 0.1, 1400, 0.6); break
      case 'count': this.tone(760, 0, 0.05, g * 0.3, 'square'); this.noise(0, 0.04, g * 0.18, 2200, 1.4); break
      case 'getUp': this.tone(300, 0, 0.28, g * 0.2, 'triangle', 540); this.noise(0.05, 1, g * 0.2, 900, 0.5, 'bandpass', true); break
      case 'stoppage': for (let i = 0; i < 3; i++) this.bell(g * 0.7, i * 0.22); this.tone(110, 0.2, 0.9, g * 0.2, 'sawtooth', 70); this.noise(0.1, 1.8, g * 0.2, 500, 0.5, 'lowpass', true); break
      case 'titleAnnounce': this.tone(392, 0, 0.25, g * 0.22, 'sawtooth'); this.tone(494, 0.2, 0.25, g * 0.22, 'sawtooth'); this.tone(587, 0.4, 0.25, g * 0.22, 'sawtooth'); this.tone(784, 0.6, 0.7, g * 0.26, 'sawtooth'); this.noise(0.5, 1.4, g * 0.12, 1000, 0.5, 'bandpass', true); break
      case 'finalBell': for (let i = 0; i < 3; i++) this.bell(g * 0.85, i * 0.5); this.noise(0.1, 1.6, g * 0.1, 900, 0.5, 'bandpass', true); break
      case 'majorResult': this.tone(330, 0, 0.18, g * 0.22, 'triangle'); this.tone(494, 0.18, 0.18, g * 0.22, 'triangle'); this.tone(660, 0.36, 0.5, g * 0.24, 'triangle'); this.noise(0.3, 1.5, g * 0.16, 900, 0.5, 'bandpass', true); break
      case 'revenue': this.tone(1568, 0, 0.07, g * 0.2, 'triangle'); this.tone(2093, 0.07, 0.07, g * 0.2, 'triangle'); this.tone(2637, 0.14, 0.3, g * 0.22, 'triangle'); break
      case 'decision': this.tone(440, 0, 0.18, g * 0.2, 'triangle'); this.tone(554, 0.2, 0.18, g * 0.2, 'triangle'); this.tone(659, 0.4, 0.5, g * 0.22, 'triangle'); this.noise(0.4, 1.4, g * 0.14, 900, 0.5, 'bandpass', true); break
    }
  }
}

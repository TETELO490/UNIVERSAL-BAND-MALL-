import { BuiltInSoundId, NewOrderSoundConfig } from '../types';
import { ensureNotificationsPermission } from './nativePermissions';

// Audio synthesizer & custom audio player for zero-latency gate sounds and Admin order ringtones

let audioCtx: AudioContext | null = null;
let activeCustomAudio: HTMLAudioElement | null = null;

export interface SoundOptionMeta {
  id: BuiltInSoundId;
  label: string;
  description: string;
}

export const BUILT_IN_ORDER_SOUNDS: SoundOptionMeta[] = [
  {
    id: 'loud-ringtone',
    label: 'Classic Loud Ringtone',
    description: 'High-volume dual-tone phone ring that cuts through crowd noise',
  },
  {
    id: 'urgent-bell',
    label: 'Urgent Event Desk Bell',
    description: 'Bright repeating triple metallic bell chime',
  },
  {
    id: 'cash-register',
    label: 'PayShap Cash Chime',
    description: 'Crisp rising register alert when a customer queues payment',
  },
  {
    id: 'marimba-alert',
    label: 'Festive Marimba Melody',
    description: 'Upbeat 5-note marimba riff for new ticket orders',
  },
  {
    id: 'siren-ping',
    label: 'Loud Dispatch Alert',
    description: 'Rapid attention-grabbing two-tone dispatch ring',
  },
];

export const DEFAULT_NEW_ORDER_SOUND: NewOrderSoundConfig = {
  mode: 'preset',
  presetId: 'loud-ringtone',
  volume: 1,
};

const getAudioContext = (): AudioContext | null => {
  if (typeof window === 'undefined') return null;
  try {
    if (!audioCtx) {
      const AudioContextClass =
        window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AudioContextClass) {
        audioCtx = new AudioContextClass();
      }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      void audioCtx.resume();
    }
    return audioCtx;
  } catch (e) {
    console.warn('AudioContext not supported or blocked:', e);
    return null;
  }
};

export const unlockAdminAudio = async (): Promise<boolean> => {
  const ctx = getAudioContext();
  if (!ctx) return false;
  try {
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }
    return true;
  } catch {
    return false;
  }
};

export const stopActiveOrderSound = () => {
  if (activeCustomAudio) {
    try {
      activeCustomAudio.pause();
      activeCustomAudio.currentTime = 0;
    } catch {}
    activeCustomAudio = null;
  }
};

const playTone = (
  ctx: AudioContext,
  freq: number,
  startOffset: number,
  duration: number,
  type: OscillatorType = 'sine',
  peakGain: number = 0.75
) => {
  const start = ctx.currentTime + startOffset;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  gain.gain.setValueAtTime(0.001, start);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.05, Math.min(1, peakGain)), start + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(start);
  osc.stop(start + duration + 0.02);
};

export const playPresetOrderRingtone = (
  presetId: BuiltInSoundId = 'loud-ringtone',
  volume: number = 1
) => {
  const ctx = getAudioContext();
  if (!ctx) return;
  const vol = Math.max(0.1, Math.min(1, volume));

  try {
    switch (presetId) {
      case 'urgent-bell': {
        for (let r = 0; r < 3; r++) {
          const offset = r * 0.45;
          playTone(ctx, 1174.66, offset, 0.35, 'triangle', 0.9 * vol);
          playTone(ctx, 1567.98, offset + 0.04, 0.32, 'sine', 0.65 * vol);
        }
        break;
      }
      case 'cash-register': {
        for (let r = 0; r < 2; r++) {
          const offset = r * 0.55;
          playTone(ctx, 987.77, offset, 0.14, 'triangle', 0.8 * vol);
          playTone(ctx, 1318.51, offset + 0.12, 0.38, 'sine', 0.9 * vol);
          playTone(ctx, 1975.53, offset + 0.14, 0.34, 'sine', 0.55 * vol);
        }
        break;
      }
      case 'marimba-alert': {
        const notes = [523.25, 659.25, 783.99, 1046.5, 783.99, 1046.5];
        notes.forEach((n, idx) => {
          playTone(ctx, n, idx * 0.14, 0.22, 'triangle', 0.85 * vol);
        });
        break;
      }
      case 'siren-ping': {
        for (let r = 0; r < 4; r++) {
          const offset = r * 0.32;
          playTone(ctx, 880, offset, 0.14, 'square', 0.55 * vol);
          playTone(ctx, 1174.66, offset + 0.15, 0.15, 'square', 0.55 * vol);
        }
        break;
      }
      case 'loud-ringtone':
      default: {
        // Classic crisp double phone ring cadence (loud & unmistakable)
        for (let burst = 0; burst < 3; burst++) {
          const base = burst * 0.55;
          playTone(ctx, 880, base, 0.18, 'triangle', 0.85 * vol);
          playTone(ctx, 1108.73, base, 0.18, 'sine', 0.7 * vol);
          playTone(ctx, 880, base + 0.22, 0.2, 'triangle', 0.85 * vol);
          playTone(ctx, 1108.73, base + 0.22, 0.2, 'sine', 0.7 * vol);
        }
        break;
      }
    }
  } catch (e) {
    console.warn('Preset ringtone error:', e);
  }
};

export const playNewOrderSound = (config?: NewOrderSoundConfig | null) => {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate([350, 150, 350, 150, 500]);
    }
  } catch {}

  stopActiveOrderSound();
  const vol = Math.max(0.1, Math.min(1, config?.volume ?? 1));

  if (config?.mode === 'custom' && config.customDataUrl) {
    try {
      const audio = new Audio(config.customDataUrl);
      audio.volume = vol;
      activeCustomAudio = audio;
      const playPromise = audio.play();
      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch(() => {
          playPresetOrderRingtone(config.presetId || 'loud-ringtone', vol);
        });
      }
      return;
    } catch {
      playPresetOrderRingtone(config.presetId || 'loud-ringtone', vol);
      return;
    }
  }

  playPresetOrderRingtone(config?.presetId || 'loud-ringtone', vol);
};

/**
 * Distinct celebratory sound when a ticket transitions to PAID via TymeBank SMS
 */
export const playTicketPaidSuccessSound = () => {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate([120, 80, 220]);
    }
  } catch {}

  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    const chord = [523.25, 659.25, 783.99, 1046.5];
    chord.forEach((freq, idx) => {
      playTone(ctx, freq, idx * 0.09, 0.35, 'triangle', 0.75);
    });
  } catch (e) {
    console.warn('Paid success chime error:', e);
  }
};

export const requestAdminNotificationPermission = async (): Promise<
  NotificationPermission | 'unsupported'
> => {
  const res = await ensureNotificationsPermission();
  if (res.granted) return 'granted';
  if (typeof window !== 'undefined' && !('Notification' in window) && res.denied) {
    return 'denied';
  }
  return 'denied';
};

export const triggerBackgroundNotification = async (
  title: string,
  body: string,
  tag?: string
) => {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;

  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg && typeof reg.showNotification === 'function') {
        await reg.showNotification(title, {
          body,
          icon: '/icon-192.png',
          badge: '/icon-192.png',
          tag: tag || 'universal-band-alert',
          requireInteraction: true,
          renotify: true,
          silent: false,
          vibrate: [800, 400, 800, 1200],
        } as NotificationOptions);
        return;
      }
    }
  } catch {}

  try {
    new Notification(title, {
      body,
      icon: '/icon-192.png',
      tag: tag || 'universal-band-alert',
      requireInteraction: true,
      silent: false,
    });
  } catch {}
};

/**
 * Short tap beep when tag is detected (800Hz, 60ms)
 */
export const playTapBeep = () => {
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, ctx.currentTime);
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.06);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.06);
  } catch (e) {
    console.warn('Audio beep error:', e);
  }
};

/**
 * Harmonious two-tone success chime (C5 523Hz -> E5 659Hz)
 */
export const playSuccessChime = () => {
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    const now = ctx.currentTime;
    // Tone 1
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(523.25, now);
    gain1.gain.setValueAtTime(0.4, now);
    gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.15);

    // Tone 2
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(659.25, now + 0.12);
    gain2.gain.setValueAtTime(0.4, now + 0.12);
    gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.35);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.12);
    osc2.stop(now + 0.35);
  } catch (e) {
    console.warn('Audio success chime error:', e);
  }
};

/**
 * Low buzzing double-tone for errors (150Hz square wave)
 */
export const playErrorBuzzer = () => {
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    const now = ctx.currentTime;
    // Buzz 1
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sawtooth';
    osc1.frequency.setValueAtTime(160, now);
    gain1.gain.setValueAtTime(0.4, now);
    gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.12);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.12);

    // Buzz 2
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sawtooth';
    osc2.frequency.setValueAtTime(130, now + 0.16);
    gain2.gain.setValueAtTime(0.4, now + 0.16);
    gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.32);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.16);
    osc2.stop(now + 0.32);
  } catch (e) {
    console.warn('Audio error buzzer error:', e);
  }
};

let activePaymentAlarmInterval: ReturnType<typeof setInterval> | null = null;
let isPaymentAlarmActiveState: boolean = false;
let loopingRingtoneAudio: HTMLAudioElement | null = null;
let cachedRingtoneWavUrl: string | null = null;
let keepAliveAudio: HTMLAudioElement | null = null;
let cachedSilentWavUrl: string | null = null;
let adminWakeLockSentinel: any = null;

function encodePcmToWavDataUrl(samples: Float32Array, sampleRate: number): string {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const dataSize = samples.length * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeStr(36, 'data');
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }

  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return `data:audio/wav;base64,${btoa(binary)}`;
}

/**
 * Generates a loud WhatsApp-style incoming-call ringtone WAV data URL in memory
 * so HTML5 <audio loop> keeps ringing even when the phone screen is locked/sleeping.
 */
function getWhatsAppStyleRingtoneUrl(): string {
  if (cachedRingtoneWavUrl) return cachedRingtoneWavUrl;
  const sampleRate = 16000;
  const durationSec = 2.6;
  const totalSamples = Math.floor(sampleRate * durationSec);
  const samples = new Float32Array(totalSamples);

  // Classic energetic double-burst phone ringtone (like WhatsApp incoming call)
  const notes = [
    { start: 0.0, dur: 0.18, f1: 784, f2: 1046.5 },
    { start: 0.2, dur: 0.18, f1: 987.77, f2: 1318.5 },
    { start: 0.42, dur: 0.28, f1: 1174.66, f2: 1567.98 },
    { start: 0.9, dur: 0.18, f1: 784, f2: 1046.5 },
    { start: 1.1, dur: 0.18, f1: 987.77, f2: 1318.5 },
    { start: 1.32, dur: 0.34, f1: 1174.66, f2: 1567.98 },
  ];

  for (const note of notes) {
    const startIdx = Math.floor(note.start * sampleRate);
    const endIdx = Math.min(totalSamples, Math.floor((note.start + note.dur) * sampleRate));
    for (let i = startIdx; i < endIdx; i++) {
      const t = (i - startIdx) / sampleRate;
      const env = Math.min(1, t * 40) * Math.min(1, (note.dur - t) * 20);
      const val =
        (Math.sin(2 * Math.PI * note.f1 * t) * 0.55 +
          Math.sin(2 * Math.PI * note.f2 * t) * 0.45) *
        env *
        0.95;
      samples[i] = Math.max(-1, Math.min(1, samples[i] + val));
    }
  }

  cachedRingtoneWavUrl = encodePcmToWavDataUrl(samples, sampleRate);
  return cachedRingtoneWavUrl;
}

function getSilentKeepAliveUrl(): string {
  if (cachedSilentWavUrl) return cachedSilentWavUrl;
  const sampleRate = 8000;
  const samples = new Float32Array(sampleRate); // 1 second of near-silence
  for (let i = 0; i < samples.length; i++) {
    samples[i] = 0.00001 * Math.sin((2 * Math.PI * 20 * i) / sampleRate);
  }
  cachedSilentWavUrl = encodePcmToWavDataUrl(samples, sampleRate);
  return cachedSilentWavUrl;
}

/**
 * Keeps the admin audio session and WakeLock alive in the background so mobile browsers/PWAs
 * do not suspend Firestore ticket listeners or block ringing when the phone screen sleeps.
 */
export const startAdminBackgroundKeepAlive = async () => {
  if (typeof window === 'undefined') return;
  void unlockAdminAudio();

  try {
    if (!keepAliveAudio) {
      keepAliveAudio = new Audio(getSilentKeepAliveUrl());
      keepAliveAudio.loop = true;
      keepAliveAudio.volume = 0.01;
      (keepAliveAudio as any).playsInline = true;
    }
    if (keepAliveAudio.paused) {
      await keepAliveAudio.play().catch(() => {});
    }
  } catch {}

  try {
    if ('mediaSession' in navigator && typeof MediaMetadata !== 'undefined') {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: 'Universal Band Mall — Live Ticket Alerts',
        artist: 'Background Ringing Active',
        album: 'Admin Monitor',
      });
      navigator.mediaSession.playbackState = 'playing';
    }
  } catch {}

  try {
    if ('wakeLock' in navigator && !adminWakeLockSentinel) {
      adminWakeLockSentinel = await (navigator as any).wakeLock.request('screen');
      adminWakeLockSentinel?.addEventListener?.('release', () => {
        adminWakeLockSentinel = null;
      });
    }
  } catch {}
};

export const stopAdminBackgroundKeepAlive = () => {
  try {
    if (keepAliveAudio) {
      keepAliveAudio.pause();
      keepAliveAudio.currentTime = 0;
    }
  } catch {}
  try {
    if (adminWakeLockSentinel) {
      void adminWakeLockSentinel.release();
      adminWakeLockSentinel = null;
    }
  } catch {}
};

/**
 * Starts a loud WhatsApp-style looping alarm ringtone that continues indefinitely
 * (even when the phone is sleeping/backgrounded) until explicitly stopped.
 */
export const startLoopingPaymentAlarm = (config?: Partial<NewOrderSoundConfig> | null) => {
  stopLoopingPaymentAlarm();
  isPaymentAlarmActiveState = true;
  void unlockAdminAudio();

  const resolvedConfig: NewOrderSoundConfig = {
    ...DEFAULT_NEW_ORDER_SOUND,
    ...(config || {}),
  };

  // 1. Primary native looping <audio loop> ringtone (keeps playing even when screen is off!)
  try {
    const audioSrc =
      resolvedConfig.mode === 'custom' && resolvedConfig.customDataUrl
        ? resolvedConfig.customDataUrl
        : getWhatsAppStyleRingtoneUrl();
    loopingRingtoneAudio = new Audio(audioSrc);
    loopingRingtoneAudio.loop = true;
    loopingRingtoneAudio.volume = Math.max(0.5, Math.min(1, resolvedConfig.volume ?? 1));
    (loopingRingtoneAudio as any).playsInline = true;
    void loopingRingtoneAudio.play().catch(() => {
      // Fallback to Web Audio synthesizer if HTML5 audio play is blocked
      playNewOrderSound(resolvedConfig);
    });
  } catch {
    playNewOrderSound(resolvedConfig);
  }

  // 2. Update MediaSession so lock screen shows incoming ticket alert
  try {
    if ('mediaSession' in navigator && typeof MediaMetadata !== 'undefined') {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: 'NEW TICKET — WAITING FOR PAYMENT',
        artist: 'Universal Band Mall Alert',
        album: 'Tap to Approve Payment',
      });
      navigator.mediaSession.playbackState = 'playing';
    }
  } catch {}

  // 3. WhatsApp-style repeating vibration pattern
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate([800, 400, 800, 1200]);
    }
  } catch {}

  // 4. Repeating safety interval for vibration + Web Audio backup
  activePaymentAlarmInterval = setInterval(() => {
    if (!isPaymentAlarmActiveState) {
      if (activePaymentAlarmInterval) clearInterval(activePaymentAlarmInterval);
      return;
    }
    if (!loopingRingtoneAudio || loopingRingtoneAudio.paused) {
      playNewOrderSound(resolvedConfig);
    }
    try {
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        navigator.vibrate([800, 400, 800, 1200]);
      }
    } catch {}
  }, 2600);
};

/**
 * Stops the looping alarm song and cancels vibration.
 */
export const stopLoopingPaymentAlarm = () => {
  isPaymentAlarmActiveState = false;
  if (activePaymentAlarmInterval) {
    clearInterval(activePaymentAlarmInterval);
    activePaymentAlarmInterval = null;
  }
  if (loopingRingtoneAudio) {
    try {
      loopingRingtoneAudio.pause();
      loopingRingtoneAudio.currentTime = 0;
    } catch {}
    loopingRingtoneAudio = null;
  }
  stopActiveOrderSound();
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(0);
    }
  } catch {}
};

export const isPaymentAlarmPlaying = (): boolean => {
  return isPaymentAlarmActiveState;
};

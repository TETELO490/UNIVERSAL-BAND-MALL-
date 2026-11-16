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
        });
        return;
      }
    }
  } catch {}

  try {
    new Notification(title, {
      body,
      icon: '/icon-192.png',
      tag: tag || 'universal-band-alert',
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

/**
 * Starts a loud looping alarm song that continues indefinitely until explicitly stopped.
 */
export const startLoopingPaymentAlarm = (config?: Partial<NewOrderSoundConfig> | null) => {
  stopLoopingPaymentAlarm();
  isPaymentAlarmActiveState = true;
  void unlockAdminAudio();

  const resolvedConfig: NewOrderSoundConfig = {
    ...DEFAULT_NEW_ORDER_SOUND,
    ...(config || {}),
  };

  // Play immediately
  playNewOrderSound(resolvedConfig);

  // Vibrate if supported
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate([1000, 400, 1000, 400]);
    }
  } catch {}

  // Repeating loop every 2.4 seconds until user presses STOP
  activePaymentAlarmInterval = setInterval(() => {
    if (!isPaymentAlarmActiveState) {
      if (activePaymentAlarmInterval) clearInterval(activePaymentAlarmInterval);
      return;
    }
    playNewOrderSound(resolvedConfig);
    try {
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        navigator.vibrate([1000, 400, 1000, 400]);
      }
    } catch {}
  }, 2400);
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

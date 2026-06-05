/**
 * AudioController.js
 * ------------------
 * Manages audio playback concurrency for incoming Push Notifications.
 * If multiple orders arrive at the exact same time, this queue ensures
 * they play sequentially rather than overlapping into distorted noise.
 */

import { getAudioFromLocalDB } from "./audioStorage";

class AudioController {
  constructor() {
    this.queue = [];
    this.isPlaying = false;
    this.audioRef = null;
  }

  /**
   * Queue a new audio playback.
   * @param {string} type - 'orderAlert' or 'customerAlert'
   * @param {number} duration - Playback duration in seconds
   */
  async playNotification(type = 'orderAlert', duration = 15, audioUrl = null) {
    this.queue.push({ type, duration, audioUrl });
    if (!this.isPlaying) {
      this.processQueue();
    }
  }

  /**
   * Force stop the currently playing alert and clear the queue.
   */
  stopAll() {
    this.queue = [];
    if (this.audioRef) {
      this.audioRef.pause();
      this.audioRef.currentTime = 0;
      this.audioRef = null;
    }
    this.isPlaying = false;
  }

  async processQueue() {
    if (this.queue.length === 0) {
      this.isPlaying = false;
      return;
    }

    this.isPlaying = true;
    const current = this.queue.shift();
    await this.playSound(current.type, current.duration, current.audioUrl);
    
    // Slight gap between consecutive alerts
    await new Promise(res => setTimeout(res, 500));
    
    this.processQueue();
  }

  playSound(type, duration, audioUrl) {
    return new Promise(async (resolve) => {
      // Respect the global mute toggle if present
      if (localStorage.getItem("fw_admin_muted") === "true") {
        return resolve();
      }

      if (audioUrl && audioUrl !== "local" && audioUrl !== "") {
        let finalAudioUrl = audioUrl;

        // Check for localDB fallback prefix
        if (audioUrl.startsWith("localDB:")) {
          const key = audioUrl.split(":")[1];
          try {
            const blob = await getAudioFromLocalDB(key);
            if (blob) {
              finalAudioUrl = URL.createObjectURL(blob);
            } else {
              console.warn("Local DB audio blob not found, falling back to default beep.");
              return this.playFallbackBeep(resolve, duration);
            }
          } catch (err) {
            console.error("Failed to retrieve audio from IndexedDB:", err);
            return this.playFallbackBeep(resolve, duration);
          }
        }

        try {
          const audio = new Audio(finalAudioUrl);
          this.audioRef = audio;
          audio.loop = true;
          audio.play().catch((err) => {
            console.error("Audio playback blocked by browser:", err);
            resolve();
          });

          setTimeout(() => {
            if (this.audioRef === audio) {
              audio.pause();
              audio.currentTime = 0;
              this.audioRef = null;
            }
            // Cleanup ephemeral blob URL if it was created
            if (audioUrl.startsWith("localDB:")) {
              URL.revokeObjectURL(finalAudioUrl);
            }
            resolve();
          }, duration * 1000);
        } catch (err) {
          console.error("Failed to load custom audio:", err);
          this.playFallbackBeep(resolve, duration);
        }
      } else {
        this.playFallbackBeep(resolve, duration);
      }
    });
  }

  playFallbackBeep(resolve, duration) {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const tones = [
        { freq: 880, start: 0,    duration: 0.15 },
        { freq: 660, start: 0.2,  duration: 0.15 },
        { freq: 880, start: 0.4,  duration: 0.15 },
      ];
      
      tones.forEach(({ freq, start, toneDur }) => {
        const osc  = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, ctx.currentTime + start);
        gain.gain.setValueAtTime(0.3, ctx.currentTime + start);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + (toneDur || 0.15));
        osc.start(ctx.currentTime + start);
        osc.stop(ctx.currentTime + start + (toneDur || 0.15) + 0.05);
      });

      // The fallback beep is short, we don't necessarily loop it for the full duration here
      // unless we set an interval. For simplicity, we just play the tones once and wait 2 seconds.
      setTimeout(resolve, 2000);
    } catch {
      // Audio API not supported
      resolve();
    }
  }
}

// Export as singleton
export const audioController = new AudioController();

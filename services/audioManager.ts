import { AudioMetrics } from '../types';

export class AudioManager {
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private microphoneSource: MediaStreamAudioSourceNode | null = null;
  private dataArray: Uint8Array | null = null;
  private stream: MediaStream | null = null;
  private nextStartTime: number = 0;

  public isInitialized = false;

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    // Prefer 16kHz for speech processing to match Gemini input recommendations
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    this.audioContext = new AudioContextClass({ sampleRate: 16000 });

    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 512;
    this.analyser.smoothingTimeConstant = 0.8;

    this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.microphoneSource = this.audioContext.createMediaStreamSource(this.stream);
      this.microphoneSource.connect(this.analyser);

      this.isInitialized = true;
    } catch (err) {
      console.error("Error accessing microphone:", err);
      throw err;
    }
  }

  getAudioContext(): AudioContext | null {
    return this.audioContext;
  }

  getInputStream(): MediaStream | null {
    return this.stream;
  }

  getMetrics(): AudioMetrics {
    if (!this.analyser || !this.dataArray) {
      return { bass: 0, mid: 0, treble: 0, volume: 0 };
    }

    this.analyser.getByteFrequencyData(this.dataArray);

    const length = this.dataArray.length;
    const bassRange = Math.floor(length * 0.1); // 0-10%
    const midRange = Math.floor(length * 0.25); // 10-35%
    // remaining is treble

    let bassSum = 0;
    let midSum = 0;
    let trebleSum = 0;

    for (let i = 0; i < length; i++) {
      const val = this.dataArray[i] / 255.0;
      if (i < bassRange) bassSum += val;
      else if (i < bassRange + midRange) midSum += val;
      else trebleSum += val;
    }

    const bass = bassSum / bassRange;
    const mid = midSum / midRange;
    const treble = trebleSum / (length - bassRange - midRange);
    const volume = (bass + mid + treble) / 3;

    return { bass, mid, treble, volume };
  }



  cleanup() {
    this.stream?.getTracks().forEach(track => track.stop());
    this.audioContext?.close();
    this.isInitialized = false;
  }
}

export const audioManager = new AudioManager();
/**
 * @typedef {Object} AudioMetrics
 * @property {number} bass
 * @property {number} mid
 * @property {number} treble
 * @property {number} volume
 * @property {number} frequency
 */

export class AudioManager {
  constructor() {
    /** @type {AudioContext | null} */
    this.audioContext = null;
    /** @type {AnalyserNode | null} */
    this.analyser = null;
    /** @type {MediaStreamAudioSourceNode | null} */
    this.microphoneSource = null;
    /** @type {Uint8Array | null} */
    this.dataArray = null;
    /** @type {MediaStream | null} */
    this.stream = null;

    this.isInitialized = false;
  }

  /**
   * Initialize the audio manager
   * @returns {Promise<void>}
   */
  async initialize() {
    if (this.isInitialized) return;

    // Prefer 16kHz for speech processing to match Gemini input recommendations
    const AudioContextClass = window.AudioContext || /** @type {any} */ (window).webkitAudioContext;
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

  /**
   * @returns {AudioContext | null}
   */
  getAudioContext() {
    return this.audioContext;
  }

  /**
   * @returns {MediaStream | null}
   */
  getInputStream() {
    return this.stream;
  }

  /**
   * @returns {AudioMetrics}
   */
  getMetrics() {
    if (!this.analyser || !this.dataArray) {
      return { bass: 0, mid: 0, treble: 0, volume: 0, frequency: 0 };
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

    // Calculate dominant frequency
    let maxVal = -1;
    let maxIndex = -1;
    for (let i = 0; i < length; i++) {
      if (this.dataArray[i] > maxVal) {
        maxVal = this.dataArray[i];
        maxIndex = i;
      }
    }

    const nyquist = this.audioContext.sampleRate / 2;
    const frequency = maxIndex * (nyquist / length);

    return { bass, mid, treble, volume, frequency };
  }

  cleanup() {
    this.stream?.getTracks().forEach(track => track.stop());
    this.audioContext?.close();
    this.isInitialized = false;
  }
}

export const audioManager = new AudioManager();

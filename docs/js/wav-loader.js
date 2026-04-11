/**
 * AcousticFDTD — WAV File Loader & Musical Tone Generator
 *
 * Provides the ability to import WAV files as custom source signals
 * and generate musical tones (notes, chords) with ADSR envelopes.
 *
 * @author Elías Gabriel Ferrer Jorge
 */

"use strict";

class WavLoader {

    /**
     * Parse a WAV file from an ArrayBuffer.
     * Supports 8-bit, 16-bit, 24-bit, 32-bit PCM and 32-bit float.
     *
     * @param {ArrayBuffer} buffer - WAV file data
     * @returns {{ sampleRate: number, channels: number, bitDepth: number, data: Float64Array }}
     */
    static parseWAV(buffer) {
        const view = new DataView(buffer);

        // Validate RIFF header
        const riff = String.fromCharCode(
            view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
        if (riff !== "RIFF") {
            throw new Error("Not a valid WAV file: missing RIFF header");
        }

        const wave = String.fromCharCode(
            view.getUint8(8), view.getUint8(9), view.getUint8(10), view.getUint8(11));
        if (wave !== "WAVE") {
            throw new Error("Not a valid WAV file: missing WAVE format");
        }

        // Find fmt and data chunks
        let fmtOffset = -1;
        let dataOffset = -1;
        let dataSize = 0;
        let offset = 12;

        while (offset < buffer.byteLength - 8) {
            const chunkId = String.fromCharCode(
                view.getUint8(offset), view.getUint8(offset + 1),
                view.getUint8(offset + 2), view.getUint8(offset + 3));
            const chunkSize = view.getUint32(offset + 4, true);

            if (chunkId === "fmt ") {
                fmtOffset = offset + 8;
            } else if (chunkId === "data") {
                dataOffset = offset + 8;
                dataSize = chunkSize;
            }

            offset += 8 + chunkSize;
            // Chunks are 2-byte aligned
            if (chunkSize % 2 !== 0) offset++;
        }

        if (fmtOffset === -1) throw new Error("WAV file missing fmt chunk");
        if (dataOffset === -1) throw new Error("WAV file missing data chunk");

        // Parse fmt chunk
        const audioFormat = view.getUint16(fmtOffset, true);
        const numChannels = view.getUint16(fmtOffset + 2, true);
        const sampleRate = view.getUint32(fmtOffset + 4, true);
        const bitsPerSample = view.getUint16(fmtOffset + 14, true);

        if (numChannels === 0) throw new Error("WAV file has 0 channels");
        if (sampleRate === 0) throw new Error("WAV file has 0 sample rate");

        // Validate format (1 = PCM, 3 = IEEE Float)
        if (audioFormat !== 1 && audioFormat !== 3) {
            throw new Error("Unsupported WAV format: " + audioFormat + " (only PCM and IEEE Float supported)");
        }

        const bytesPerSample = bitsPerSample / 8;
        const numSamples = Math.floor(dataSize / (numChannels * bytesPerSample));
        const data = new Float64Array(numSamples);

        // Read samples (mix to mono if stereo)
        let readOffset = dataOffset;
        for (let i = 0; i < numSamples; i++) {
            let sample = 0;
            for (let ch = 0; ch < numChannels; ch++) {
                let chSample = 0;
                if (audioFormat === 3 && bitsPerSample === 32) {
                    // 32-bit IEEE float
                    chSample = view.getFloat32(readOffset, true);
                } else if (bitsPerSample === 8) {
                    // 8-bit unsigned
                    chSample = (view.getUint8(readOffset) - 128) / 128.0;
                } else if (bitsPerSample === 16) {
                    // 16-bit signed
                    chSample = view.getInt16(readOffset, true) / 32768.0;
                } else if (bitsPerSample === 24) {
                    // 24-bit signed (little-endian)
                    let val = view.getUint8(readOffset) |
                              (view.getUint8(readOffset + 1) << 8) |
                              (view.getUint8(readOffset + 2) << 16);
                    if (val >= 0x800000) val -= 0x1000000;
                    chSample = val / 8388608.0;
                } else if (bitsPerSample === 32) {
                    // 32-bit signed PCM
                    chSample = view.getInt32(readOffset, true) / 2147483648.0;
                }
                readOffset += bytesPerSample;
                sample += chSample;
            }
            // Average channels for mono mix
            data[i] = sample / numChannels;
        }

        return { sampleRate, channels: numChannels, bitDepth: bitsPerSample, data };
    }

    /**
     * Resample audio data to match the solver's sample rate using linear interpolation.
     *
     * @param {Float64Array} data - Input audio samples
     * @param {number} srcRate - Source sample rate (Hz)
     * @param {number} targetRate - Target sample rate (Hz)
     * @returns {Float64Array} Resampled audio data
     */
    static resample(data, srcRate, targetRate) {
        if (Math.abs(srcRate - targetRate) < 0.01) {
            return new Float64Array(data);
        }

        const ratio = srcRate / targetRate;
        const outLen = Math.floor(data.length / ratio);
        const out = new Float64Array(outLen);

        for (let i = 0; i < outLen; i++) {
            const srcIdx = i * ratio;
            const lo = Math.floor(srcIdx);
            const hi = Math.min(lo + 1, data.length - 1);
            const frac = srcIdx - lo;
            out[i] = (1 - frac) * data[lo] + frac * data[hi];
        }

        return out;
    }

    /**
     * Normalize audio data to a target peak amplitude.
     * @param {Float64Array} data - Audio samples (modified in-place)
     * @param {number} targetPeak - Target peak amplitude (default: 1.0)
     */
    static normalize(data, targetPeak) {
        targetPeak = targetPeak || 1.0;
        let maxAbs = 0;
        for (let i = 0; i < data.length; i++) {
            const a = Math.abs(data[i]);
            if (a > maxAbs) maxAbs = a;
        }
        if (maxAbs < 1e-30) return;
        const scale = targetPeak / maxAbs;
        for (let i = 0; i < data.length; i++) {
            data[i] *= scale;
        }
    }
}


class ToneGenerator {

    /** Standard musical note frequencies (A4 = 440 Hz) */
    static NOTE_FREQUENCIES = {
        "C2": 65.41, "C#2": 69.30, "D2": 73.42, "D#2": 77.78, "E2": 82.41,
        "F2": 87.31, "F#2": 92.50, "G2": 98.00, "G#2": 103.83, "A2": 110.00,
        "A#2": 116.54, "B2": 123.47,
        "C3": 130.81, "C#3": 138.59, "D3": 146.83, "D#3": 155.56, "E3": 164.81,
        "F3": 174.61, "F#3": 185.00, "G3": 196.00, "G#3": 207.65, "A3": 220.00,
        "A#3": 233.08, "B3": 246.94,
        "C4": 261.63, "C#4": 277.18, "D4": 293.66, "D#4": 311.13, "E4": 329.63,
        "F4": 349.23, "F#4": 369.99, "G4": 392.00, "G#4": 415.30, "A4": 440.00,
        "A#4": 466.16, "B4": 493.88,
        "C5": 523.25, "C#5": 554.37, "D5": 587.33, "D#5": 622.25, "E5": 659.26,
        "F5": 698.46, "F#5": 739.99, "G5": 783.99, "G#5": 830.61, "A5": 880.00,
        "A#5": 932.33, "B5": 987.77,
        "C6": 1046.50, "C#6": 1108.73, "D6": 1174.66, "D#6": 1244.51, "E6": 1318.51,
        "F6": 1396.91, "F#6": 1479.98, "G6": 1567.98, "G#6": 1661.22, "A6": 1760.00,
        "A#6": 1864.66, "B6": 1975.53
    };

    /** Waveform types: sine, square, sawtooth, triangle */
    static WAVEFORMS = ["sine", "square", "sawtooth", "triangle"];

    /**
     * Generate an ADSR envelope.
     * @param {number} totalSamples - Total envelope length in samples
     * @param {number} sampleRate - Sample rate
     * @param {Object} adsr - { attack, decay, sustain, release } in seconds
     * @returns {Float64Array}
     */
    static generateEnvelope(totalSamples, sampleRate, adsr) {
        const env = new Float64Array(totalSamples);
        const aS = Math.floor(adsr.attack * sampleRate);
        const dS = Math.floor(adsr.decay * sampleRate);
        const rS = Math.floor(adsr.release * sampleRate);
        const sLevel = adsr.sustain; // 0–1
        const sustainEnd = totalSamples - rS;

        for (let i = 0; i < totalSamples; i++) {
            if (i < aS) {
                // Attack
                env[i] = i / aS;
            } else if (i < aS + dS) {
                // Decay
                const t = (i - aS) / dS;
                env[i] = 1.0 - t * (1.0 - sLevel);
            } else if (i < sustainEnd) {
                // Sustain
                env[i] = sLevel;
            } else {
                // Release
                const t = (i - sustainEnd) / rS;
                env[i] = sLevel * (1.0 - Math.min(t, 1.0));
            }
        }

        return env;
    }

    /**
     * Generate a single oscillator waveform.
     * @param {string} waveform - 'sine', 'square', 'sawtooth', 'triangle'
     * @param {number} frequency - Hz
     * @param {number} duration - seconds
     * @param {number} sampleRate - Hz
     * @returns {Float64Array}
     */
    static generateWaveform(waveform, frequency, duration, sampleRate) {
        const N = Math.floor(duration * sampleRate);
        const data = new Float64Array(N);
        const angFreq = 2 * Math.PI * frequency;

        switch (waveform) {
            case "square":
                for (let i = 0; i < N; i++) {
                    data[i] = Math.sin(angFreq * i / sampleRate) >= 0 ? 1.0 : -1.0;
                }
                break;
            case "sawtooth":
                for (let i = 0; i < N; i++) {
                    const phase = (frequency * i / sampleRate) % 1.0;
                    data[i] = 2.0 * phase - 1.0;
                }
                break;
            case "triangle":
                for (let i = 0; i < N; i++) {
                    const phase = (frequency * i / sampleRate) % 1.0;
                    data[i] = 1.0 - 4.0 * Math.abs(phase - 0.5);
                }
                break;
            case "sine":
            default:
                for (let i = 0; i < N; i++) {
                    data[i] = Math.sin(angFreq * i / sampleRate);
                }
                break;
        }

        return data;
    }

    /**
     * Generate a musical tone with ADSR envelope.
     *
     * @param {Object} config
     * @param {string} config.note - Musical note name (e.g. "A4", "C#3") or frequency in Hz
     * @param {string} config.waveform - 'sine', 'square', 'sawtooth', 'triangle' (default: 'sine')
     * @param {number} config.duration - Duration in seconds
     * @param {number} config.sampleRate - Target sample rate
     * @param {number} config.amplitude - Peak amplitude (default: 1.0)
     * @param {Object} [config.adsr] - ADSR envelope { attack, decay, sustain, release }
     * @returns {Float64Array}
     */
    static generateTone(config) {
        let frequency;
        if (typeof config.note === "string" && ToneGenerator.NOTE_FREQUENCIES[config.note]) {
            frequency = ToneGenerator.NOTE_FREQUENCIES[config.note];
        } else if (typeof config.note === "number") {
            frequency = config.note;
        } else {
            frequency = 440; // Default A4
        }

        const waveform = config.waveform || "sine";
        const duration = config.duration || 0.5;
        const sampleRate = config.sampleRate || 44100;
        const amplitude = config.amplitude || 1.0;

        const wave = ToneGenerator.generateWaveform(waveform, frequency, duration, sampleRate);

        // Apply ADSR envelope
        const adsr = config.adsr || { attack: 0.01, decay: 0.05, sustain: 0.8, release: 0.05 };
        const env = ToneGenerator.generateEnvelope(wave.length, sampleRate, adsr);

        for (let i = 0; i < wave.length; i++) {
            wave[i] *= env[i] * amplitude;
        }

        return wave;
    }

    /**
     * Generate a chord (multiple notes simultaneously).
     *
     * @param {Object} config
     * @param {string[]} config.notes - Array of note names or frequencies
     * @param {string} config.waveform - Waveform type
     * @param {number} config.duration - Duration in seconds
     * @param {number} config.sampleRate - Target sample rate
     * @param {number} config.amplitude - Peak amplitude per note
     * @param {Object} [config.adsr] - ADSR envelope
     * @returns {Float64Array}
     */
    static generateChord(config) {
        const notes = config.notes || ["C4", "E4", "G4"];
        const N = Math.floor((config.duration || 0.5) * (config.sampleRate || 44100));
        const chord = new Float64Array(N);

        for (const note of notes) {
            const tone = ToneGenerator.generateTone({
                note: note,
                waveform: config.waveform,
                duration: config.duration,
                sampleRate: config.sampleRate,
                amplitude: (config.amplitude || 1.0) / notes.length,
                adsr: config.adsr
            });
            for (let i = 0; i < N && i < tone.length; i++) {
                chord[i] += tone[i];
            }
        }

        return chord;
    }

    /**
     * Generate a glottal pulse waveform (simplified LF model).
     * Simulates vocal cord vibration for vocal tract modeling.
     *
     * @param {number} f0 - Fundamental frequency (Hz) (default: 120 Hz male, 220 Hz female)
     * @param {number} duration - Duration in seconds
     * @param {number} sampleRate - Target sample rate
     * @param {number} amplitude - Peak amplitude
     * @returns {Float64Array}
     */
    static generateGlottalPulse(f0, duration, sampleRate, amplitude) {
        f0 = f0 || 120;
        duration = duration || 0.5;
        sampleRate = sampleRate || 44100;
        amplitude = amplitude || 1.0;

        const N = Math.floor(duration * sampleRate);
        const data = new Float64Array(N);
        const T0 = 1.0 / f0; // Period
        const Tp = 0.4 * T0;  // Peak time (40% into glottal cycle)
        const Tn = 0.16 * T0; // Return phase duration

        for (let i = 0; i < N; i++) {
            const t = i / sampleRate;
            const tMod = t % T0; // Phase within current cycle

            if (tMod < Tp) {
                // Opening phase: rising sinusoid
                data[i] = amplitude * 0.5 * (1 - Math.cos(Math.PI * tMod / Tp));
            } else if (tMod < Tp + Tn) {
                // Closing phase: rapid falling
                const tc = (tMod - Tp) / Tn;
                data[i] = amplitude * Math.cos(Math.PI * tc / 2);
            } else {
                // Closed phase
                data[i] = 0;
            }
        }

        return data;
    }

    /**
     * Get a list of all available note names.
     * @returns {string[]}
     */
    static getNoteNames() {
        return Object.keys(ToneGenerator.NOTE_FREQUENCIES);
    }

    /**
     * Get common preset tones for the UI.
     * @returns {Object[]}
     */
    static getPresets() {
        return [
            { name: "A4 (Concert Pitch)", note: "A4", waveform: "sine" },
            { name: "C Major Chord", notes: ["C4", "E4", "G4"], waveform: "sine", type: "chord" },
            { name: "A Minor Chord", notes: ["A3", "C4", "E4"], waveform: "sine", type: "chord" },
            { name: "Bass E2", note: "E2", waveform: "sine" },
            { name: "Soprano C6", note: "C6", waveform: "sine" },
            { name: "Square A4", note: "A4", waveform: "square" },
            { name: "Sawtooth A4", note: "A4", waveform: "sawtooth" },
            { name: "Glottal Pulse (Male)", type: "glottal", f0: 120 },
            { name: "Glottal Pulse (Female)", type: "glottal", f0: 220 },
            { name: "Whispered /a/", type: "noise", bandwidth: [300, 3000] }
        ];
    }

    /**
     * Generate an orca (killer whale) echolocation click train.
     * Broadband impulsive signal: ~20 clicks, 500μs each, 2ms spacing,
     * 20kHz center frequency, Hann envelope per click.
     *
     * @param {number} duration - Total duration in seconds (default: 0.05)
     * @param {number} sampleRate - Sample rate in Hz
     * @param {number} amplitude - Peak amplitude (default: 1.0)
     * @returns {Float64Array}
     */
    static generateOrcaClick(duration, sampleRate, amplitude) {
        duration = duration || 0.05;
        sampleRate = sampleRate || 44100;
        amplitude = amplitude || 1.0;

        const N = Math.floor(duration * sampleRate);
        const data = new Float64Array(N);

        const clickDuration = 0.0005;  // 500 μs per click
        const clickSpacing = 0.002;    // 2 ms between clicks
        const centerFreq = 20000;      // 20 kHz center frequency
        const clickSamples = Math.floor(clickDuration * sampleRate);
        const spacingSamples = Math.floor(clickSpacing * sampleRate);
        const numClicks = Math.min(20, Math.floor(N / spacingSamples));

        for (let c = 0; c < numClicks; c++) {
            const startSample = c * spacingSamples;
            for (let i = 0; i < clickSamples && (startSample + i) < N; i++) {
                // Hann envelope
                const env = 0.5 * (1 - Math.cos(2 * Math.PI * i / clickSamples));
                const t = (startSample + i) / sampleRate;
                // Limit center freq to Nyquist
                const freq = Math.min(centerFreq, sampleRate * 0.45);
                data[startSample + i] = amplitude * env * Math.sin(2 * Math.PI * freq * t);
            }
        }

        return data;
    }

    /**
     * Generate an orca whistle — logarithmic frequency sweep from 1kHz to 18kHz
     * with ADSR amplitude envelope.
     *
     * @param {number} duration - Total duration in seconds (default: 0.5)
     * @param {number} sampleRate - Sample rate in Hz
     * @param {number} amplitude - Peak amplitude (default: 1.0)
     * @returns {Float64Array}
     */
    static generateOrcaWhistle(duration, sampleRate, amplitude) {
        duration = duration || 0.5;
        sampleRate = sampleRate || 44100;
        amplitude = amplitude || 1.0;

        const N = Math.floor(duration * sampleRate);
        const data = new Float64Array(N);

        const f0 = 1000;   // Start frequency 1kHz
        const f1 = Math.min(18000, sampleRate * 0.45);  // End frequency, limited to Nyquist
        const attackTime = 0.02;
        const releaseTime = 0.05;
        const attackSamples = Math.floor(attackTime * sampleRate);
        const releaseSamples = Math.floor(releaseTime * sampleRate);
        const releaseStart = N - releaseSamples;

        // Logarithmic frequency sweep
        const logRatio = Math.log(f1 / f0);
        let phase = 0;

        for (let i = 0; i < N; i++) {
            const t = i / sampleRate;
            // Instantaneous frequency: log sweep
            const tNorm = i / N;
            const freq = f0 * Math.exp(logRatio * tNorm);
            phase += 2 * Math.PI * freq / sampleRate;

            // ADSR envelope (attack, sustain, release)
            let env = 1.0;
            if (i < attackSamples) {
                env = i / attackSamples;
            } else if (i >= releaseStart) {
                env = (N - i) / releaseSamples;
            }

            data[i] = amplitude * env * Math.sin(phase);
        }

        return data;
    }
}

if (typeof module !== "undefined") {
    module.exports = { WavLoader, ToneGenerator };
}

/**
 * AcousticFDTD — Web Audio Engine
 *
 * Converts simulation microphone data to audio signals playable through
 * the browser's Web Audio API. Also supports WAV file export.
 *
 * @author Elías Gabriel Ferrer Jorge
 */

"use strict";

class AudioEngine {
    constructor() {
        this.audioCtx = null;
        this.isPlaying = false;
    }

    /** Initialize the AudioContext (must be called from a user gesture) */
    init() {
        if (!this.audioCtx) {
            this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (this.audioCtx.state === "suspended") {
            this.audioCtx.resume();
        }
    }

    /**
     * Play microphone data as audio.
     * @param {number[]} data - Pressure samples
     * @param {number} sampleRate - Sample rate Hz
     * @param {number} gain - Volume gain multiplier
     */
    play(data, sampleRate, gain) {
        this.init();

        if (this.isPlaying) {
            this.stop();
        }

        const N = data.length;
        if (N === 0) return;

        // Use the simulation sample rate or re-sample to 44100
        const targetRate = this.audioCtx.sampleRate;
        const resampleRatio = targetRate / sampleRate;
        const outLen = Math.floor(N * resampleRatio);

        const buffer = this.audioCtx.createBuffer(1, outLen, targetRate);
        const channelData = buffer.getChannelData(0);

        // Normalize
        let maxAbs = 0;
        for (let i = 0; i < N; i++) {
            const a = Math.abs(data[i]);
            if (a > maxAbs) maxAbs = a;
        }
        if (maxAbs < 1e-30) maxAbs = 1e-30;

        const normGain = gain / maxAbs;

        // Linear interpolation resampling
        for (let i = 0; i < outLen; i++) {
            const srcIdx = i / resampleRatio;
            const lo = Math.floor(srcIdx);
            const hi = Math.min(lo + 1, N - 1);
            const frac = srcIdx - lo;
            channelData[i] = ((1 - frac) * data[lo] + frac * data[hi]) * normGain;
        }

        // Play
        this.sourceNode = this.audioCtx.createBufferSource();
        this.sourceNode.buffer = buffer;
        this.sourceNode.connect(this.audioCtx.destination);
        this.sourceNode.start(0);
        this.isPlaying = true;

        this.sourceNode.onended = () => {
            this.isPlaying = false;
        };
    }

    /** Stop current playback */
    stop() {
        if (this.sourceNode && this.isPlaying) {
            try { this.sourceNode.stop(); } catch (_e) { /* ignore */ }
            this.isPlaying = false;
        }
    }

    /**
     * Export microphone data as a WAV file and trigger download.
     * @param {number[]} data - Pressure samples
     * @param {number} sampleRate - Sample rate Hz
     * @param {string} filename - Output filename
     */
    exportWAV(data, sampleRate, filename) {
        const N = data.length;
        if (N === 0) return;

        // Normalize to 16-bit
        let maxAbs = 0;
        for (let i = 0; i < N; i++) {
            const a = Math.abs(data[i]);
            if (a > maxAbs) maxAbs = a;
        }
        if (maxAbs < 1e-30) maxAbs = 1e-30;

        const numChannels = 1;
        const bitsPerSample = 16;
        const bytesPerSample = bitsPerSample / 8;
        const blockAlign = numChannels * bytesPerSample;
        const byteRate = Math.floor(sampleRate) * blockAlign;
        const dataSize = N * blockAlign;
        const totalSize = 44 + dataSize;

        const buffer = new ArrayBuffer(totalSize);
        const view = new DataView(buffer);

        // WAV header
        this._writeString(view, 0, "RIFF");
        view.setUint32(4, totalSize - 8, true);
        this._writeString(view, 8, "WAVE");
        this._writeString(view, 12, "fmt ");
        view.setUint32(16, 16, true);  // Chunk size
        view.setUint16(20, 1, true);   // PCM format
        view.setUint16(22, numChannels, true);
        view.setUint32(24, Math.floor(sampleRate), true);
        view.setUint32(28, byteRate, true);
        view.setUint16(32, blockAlign, true);
        view.setUint16(34, bitsPerSample, true);
        this._writeString(view, 36, "data");
        view.setUint32(40, dataSize, true);

        // Write samples
        let offset = 44;
        for (let i = 0; i < N; i++) {
            let sample = (data[i] / maxAbs) * 0.95;
            sample = Math.max(-1, Math.min(1, sample));
            view.setInt16(offset, Math.floor(sample * 32767), true);
            offset += 2;
        }

        // Download
        const blob = new Blob([buffer], { type: "audio/wav" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename || "fdtd_output.wav";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    _writeString(view, offset, str) {
        for (let i = 0; i < str.length; i++) {
            view.setUint8(offset + i, str.charCodeAt(i));
        }
    }
}

if (typeof module !== "undefined") {
    module.exports = { AudioEngine };
}

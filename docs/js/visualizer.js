/**
 * AcousticFDTD — Canvas-based Pressure Field Visualizer
 *
 * Renders 2D pressure field slices as colormap images on HTML Canvas.
 * Also plots microphone time-series and FFT spectra.
 *
 * @author Elías Gabriel Ferrer Jorge
 */

"use strict";

class Visualizer {
    /**
     * @param {HTMLCanvasElement} canvas - Main pressure field canvas
     * @param {HTMLCanvasElement} timeCanvas - Microphone time-series canvas
     * @param {HTMLCanvasElement} fftCanvas - FFT spectrum canvas
     */
    constructor(canvas, timeCanvas, fftCanvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext("2d");
        this.timeCanvas = timeCanvas;
        this.timeCtx = timeCanvas ? timeCanvas.getContext("2d") : null;
        this.fftCanvas = fftCanvas;
        this.fftCtx = fftCanvas ? fftCanvas.getContext("2d") : null;

        this.colorScale = 1.0;
        this.colormap = "blueRed";  // 'blueRed', 'hot', 'grayscale'
    }

    setColorScale(val) {
        this.colorScale = val;
    }

    /**
     * Map a pressure value to an RGB color.
     * @param {number} val - Pressure value
     * @param {number} maxVal - Maximum absolute value for normalization
     * @returns {number[]} [r, g, b]
     */
    pressureToColor(val, maxVal) {
        const nv = Math.max(-1, Math.min(1, val / maxVal)); // Normalize to [-1, 1]

        if (this.colormap === "blueRed") {
            // Blue (negative) → Black (zero) → Red (positive)
            if (nv >= 0) {
                const t = nv;
                return [
                    Math.floor(255 * t),
                    Math.floor(30 * t),
                    Math.floor(10 * (1 - t))
                ];
            } else {
                const t = -nv;
                return [
                    Math.floor(10 * (1 - t)),
                    Math.floor(30 * t),
                    Math.floor(255 * t)
                ];
            }
        } else if (this.colormap === "hot") {
            const t = (nv + 1) / 2; // Map to [0, 1]
            return [
                Math.floor(255 * Math.min(1, t * 3)),
                Math.floor(255 * Math.max(0, Math.min(1, (t - 0.33) * 3))),
                Math.floor(255 * Math.max(0, (t - 0.66) * 3))
            ];
        } else {
            // Grayscale
            const g = Math.floor(128 + 127 * nv);
            return [g, g, g];
        }
    }

    /**
     * Render a 2D pressure slice to the main canvas.
     * @param {Object} slice - { data: Float64Array, width, height }
     * @param {Object} markers - { sources: [{ix,iy}], receivers: [{ix,iy}] }
     */
    renderSlice(slice, markers) {
        const { data, width, height } = slice;
        const cw = this.canvas.width;
        const ch = this.canvas.height;

        const cellW = cw / width;
        const cellH = ch / height;

        // Find max for normalization
        let maxVal = 0;
        for (let i = 0; i < data.length; i++) {
            const a = Math.abs(data[i]);
            if (a > maxVal) maxVal = a;
        }
        if (maxVal < 1e-20) maxVal = 1e-20;
        maxVal /= this.colorScale;

        // Create image
        const imgData = this.ctx.createImageData(cw, ch);

        for (let gy = 0; gy < height; gy++) {
            for (let gx = 0; gx < width; gx++) {
                const val = data[gx + gy * width];
                const [r, g, b] = this.pressureToColor(val, maxVal);

                // Fill the cell pixels
                const px0 = Math.floor(gx * cellW);
                const px1 = Math.ceil((gx + 1) * cellW);
                const py0 = Math.floor(gy * cellH);
                const py1 = Math.ceil((gy + 1) * cellH);

                for (let py = py0; py < py1; py++) {
                    for (let px = px0; px < px1; px++) {
                        const idx = (py * cw + px) * 4;
                        imgData.data[idx] = r;
                        imgData.data[idx + 1] = g;
                        imgData.data[idx + 2] = b;
                        imgData.data[idx + 3] = 255;
                    }
                }
            }
        }

        this.ctx.putImageData(imgData, 0, 0);

        // Draw markers
        if (markers) {
            if (markers.sources) {
                this.ctx.fillStyle = "#FFD700";
                this.ctx.strokeStyle = "#000";
                this.ctx.lineWidth = 2;
                for (const s of markers.sources) {
                    const cx = (s.ix + 0.5) * cellW;
                    const cy = (s.iy + 0.5) * cellH;
                    this.ctx.beginPath();
                    this.ctx.arc(cx, cy, Math.max(4, cellW * 0.4), 0, 2 * Math.PI);
                    this.ctx.fill();
                    this.ctx.stroke();
                    // Draw speaker icon (triangle)
                    this.ctx.fillStyle = "#333";
                    this.ctx.beginPath();
                    const sz = Math.max(3, cellW * 0.25);
                    this.ctx.moveTo(cx - sz, cy - sz);
                    this.ctx.lineTo(cx + sz, cy);
                    this.ctx.lineTo(cx - sz, cy + sz);
                    this.ctx.closePath();
                    this.ctx.fill();
                    this.ctx.fillStyle = "#FFD700";
                }
            }
            if (markers.receivers) {
                this.ctx.fillStyle = "#00FF88";
                this.ctx.strokeStyle = "#000";
                this.ctx.lineWidth = 2;
                for (const r of markers.receivers) {
                    const cx = (r.ix + 0.5) * cellW;
                    const cy = (r.iy + 0.5) * cellH;
                    this.ctx.beginPath();
                    this.ctx.arc(cx, cy, Math.max(4, cellW * 0.4), 0, 2 * Math.PI);
                    this.ctx.fill();
                    this.ctx.stroke();
                    // Draw mic icon (circle)
                    this.ctx.fillStyle = "#333";
                    this.ctx.beginPath();
                    this.ctx.arc(cx, cy, Math.max(2, cellW * 0.15), 0, 2 * Math.PI);
                    this.ctx.fill();
                    this.ctx.fillStyle = "#00FF88";
                }
            }
        }

        // Draw border
        this.ctx.strokeStyle = "#555";
        this.ctx.lineWidth = 1;
        this.ctx.strokeRect(0, 0, cw, ch);
    }

    /**
     * Plot microphone time series data.
     * @param {number[]} data - Pressure samples
     * @param {number} dt - Time step
     */
    plotTimeSeries(data, dt) {
        if (!this.timeCtx || !data || data.length === 0) return;

        const ctx = this.timeCtx;
        const w = this.timeCanvas.width;
        const h = this.timeCanvas.height;

        ctx.fillStyle = "#1a1a2e";
        ctx.fillRect(0, 0, w, h);

        // Axes
        ctx.strokeStyle = "#555";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(40, 0);
        ctx.lineTo(40, h - 20);
        ctx.lineTo(w, h - 20);
        ctx.stroke();

        // Labels
        ctx.fillStyle = "#aaa";
        ctx.font = "11px monospace";
        ctx.fillText("p [Pa]", 0, 12);
        ctx.fillText("t [s]", w - 40, h - 4);

        if (data.length < 2) return;

        // Find max for scaling
        let maxVal = 0;
        for (let i = 0; i < data.length; i++) {
            const a = Math.abs(data[i]);
            if (a > maxVal) maxVal = a;
        }
        if (maxVal < 1e-20) maxVal = 1e-20;

        const plotW = w - 50;
        const plotH = h - 30;
        const midY = 10 + plotH / 2;

        // Draw zero line
        ctx.strokeStyle = "#444";
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(40, midY);
        ctx.lineTo(w, midY);
        ctx.stroke();
        ctx.setLineDash([]);

        // Plot signal
        ctx.strokeStyle = "#00d4ff";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let i = 0; i < data.length; i++) {
            const x = 45 + (i / data.length) * plotW;
            const y = midY - (data[i] / maxVal) * (plotH / 2 - 5);
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.stroke();

        // Scale labels
        ctx.fillStyle = "#888";
        ctx.font = "10px monospace";
        const totalTime = data.length * dt;
        ctx.fillText("0", 42, h - 6);
        ctx.fillText(totalTime.toFixed(4) + "s", w - 60, h - 6);
        ctx.fillText("+" + maxVal.toExponential(1), 0, 22);
        ctx.fillText("-" + maxVal.toExponential(1), 0, h - 24);
    }

    /**
     * Plot FFT spectrum.
     * @param {number[]} data - Time-domain pressure samples
     * @param {number} sampleRate - Sample rate in Hz
     */
    plotFFT(data, sampleRate) {
        if (!this.fftCtx || !data || data.length < 4) return;

        const ctx = this.fftCtx;
        const w = this.fftCanvas.width;
        const h = this.fftCanvas.height;

        ctx.fillStyle = "#1a1a2e";
        ctx.fillRect(0, 0, w, h);

        // Compute FFT using simple DFT (for small N) or radix-2 FFT
        const N = data.length;
        const fftMag = this._computeFFTMag(data);
        const halfN = Math.floor(N / 2);

        // Axes
        ctx.strokeStyle = "#555";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(40, 0);
        ctx.lineTo(40, h - 20);
        ctx.lineTo(w, h - 20);
        ctx.stroke();

        ctx.fillStyle = "#aaa";
        ctx.font = "11px monospace";
        ctx.fillText("|P(f)|", 0, 12);
        ctx.fillText("f [Hz]", w - 50, h - 4);

        if (halfN < 2) return;

        // Find max magnitude
        let maxMag = 0;
        for (let i = 1; i < halfN; i++) {
            if (fftMag[i] > maxMag) maxMag = fftMag[i];
        }
        if (maxMag < 1e-20) maxMag = 1e-20;

        const plotW = w - 50;
        const plotH = h - 30;

        // Plot bars or line
        ctx.strokeStyle = "#ff6b6b";
        ctx.fillStyle = "rgba(255, 107, 107, 0.3)";
        ctx.lineWidth = 1;

        ctx.beginPath();
        const maxFreq = sampleRate / 2;
        for (let i = 0; i < halfN; i++) {
            const x = 45 + (i / halfN) * plotW;
            const barH = (fftMag[i] / maxMag) * plotH;
            const y = 5 + plotH - barH;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.stroke();

        // Fill under curve
        ctx.lineTo(45 + plotW, 5 + plotH);
        ctx.lineTo(45, 5 + plotH);
        ctx.closePath();
        ctx.fill();

        // Frequency labels
        ctx.fillStyle = "#888";
        ctx.font = "10px monospace";
        ctx.fillText("0", 42, h - 6);
        ctx.fillText(Math.floor(maxFreq) + "Hz", w - 55, h - 6);
    }

    /**
     * Simple FFT magnitude computation.
     * Uses the Cooley-Tukey radix-2 algorithm where possible.
     * @param {number[]} data
     * @returns {Float64Array}
     */
    _computeFFTMag(data) {
        const N = data.length;
        // Pad to next power of 2
        let n2 = 1;
        while (n2 < N) n2 <<= 1;

        const re = new Float64Array(n2);
        const im = new Float64Array(n2);
        for (let i = 0; i < N; i++) re[i] = data[i];

        // In-place iterative FFT
        // Bit-reversal
        let j = 0;
        for (let i = 0; i < n2; i++) {
            if (i < j) {
                let tmp = re[i]; re[i] = re[j]; re[j] = tmp;
                tmp = im[i]; im[i] = im[j]; im[j] = tmp;
            }
            let m = n2 >> 1;
            while (m >= 1 && j >= m) {
                j -= m;
                m >>= 1;
            }
            j += m;
        }

        // Butterfly
        for (let size = 2; size <= n2; size <<= 1) {
            const halfSize = size >> 1;
            const angle = -2 * Math.PI / size;
            const wRe = Math.cos(angle);
            const wIm = Math.sin(angle);
            for (let i = 0; i < n2; i += size) {
                let curRe = 1, curIm = 0;
                for (let k = 0; k < halfSize; k++) {
                    const a = i + k;
                    const b = a + halfSize;
                    const tRe = curRe * re[b] - curIm * im[b];
                    const tIm = curRe * im[b] + curIm * re[b];
                    re[b] = re[a] - tRe;
                    im[b] = im[a] - tIm;
                    re[a] += tRe;
                    im[a] += tIm;
                    const newRe = curRe * wRe - curIm * wIm;
                    curIm = curRe * wIm + curIm * wRe;
                    curRe = newRe;
                }
            }
        }

        // Magnitude
        const mag = new Float64Array(n2);
        for (let i = 0; i < n2; i++) {
            mag[i] = Math.sqrt(re[i] * re[i] + im[i] * im[i]) / N;
        }
        return mag;
    }

    /** Set the color scale multiplier */
    setColorScale(scale) {
        this.colorScale = Math.max(0.01, scale);
    }
}

if (typeof module !== "undefined") {
    module.exports = { Visualizer };
}

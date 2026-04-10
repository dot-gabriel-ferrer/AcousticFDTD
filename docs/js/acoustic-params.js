/**
 * AcousticFDTD -- Acoustic Parameter Computation Module
 *
 * Computes room acoustic parameters from impulse responses
 * recorded at microphone positions during FDTD simulation.
 *
 * Implements ISO 3382-1 compliant parameter extraction:
 *   - RT60 (T20, T30) via Schroeder backward integration
 *   - Early Decay Time (EDT)
 *   - Clarity C80
 *   - Definition D50
 *   - Centre Time Ts
 *   - Sound Pressure Level (SPL)
 *   - Energy Decay Curve (EDC)
 *
 * @author Elias Gabriel Ferrer Jorge
 */

"use strict";

class AcousticParameters {
    /**
     * @param {number[]} impulseResponse - Recorded pressure samples from mic
     * @param {number} sampleRate - Sample rate in Hz (1/dt of FDTD)
     */
    constructor(impulseResponse, sampleRate) {
        this.ir = impulseResponse;
        this.fs = sampleRate;
        this.N = impulseResponse.length;
        this._edc = null; // lazy computed
    }

    /**
     * Schroeder backward integration => Energy Decay Curve (EDC)
     * EDC(t) = integral from t to infinity of h^2(tau) dtau
     * Returns EDC in dB normalized to 0 dB at t=0
     * @returns {Float64Array}
     */
    computeEDC() {
        if (this._edc) return this._edc;
        
        const N = this.N;
        const edc = new Float64Array(N);
        
        // Backward integration of squared impulse response
        edc[N - 1] = this.ir[N - 1] * this.ir[N - 1];
        for (let i = N - 2; i >= 0; i--) {
            edc[i] = edc[i + 1] + this.ir[i] * this.ir[i];
        }
        
        // Convert to dB, normalized so edc[0] = 0 dB
        const edc0 = edc[0];
        if (edc0 < 1e-30) {
            this._edc = edc; // silence - return zeros
            return edc;
        }
        
        for (let i = 0; i < N; i++) {
            edc[i] = 10 * Math.log10(Math.max(edc[i] / edc0, 1e-12));
        }
        
        this._edc = edc;
        return edc;
    }

    /**
     * Reverberation time via linear regression on EDC
     * @param {string} method - 'T20' (extrapolate -5 to -25 dB) or 'T30' (extrapolate -5 to -35 dB)
     * @returns {number} RT60 in seconds, or -1 if insufficient decay
     */
    computeRT60(method = 'T30') {
        const edc = this.computeEDC();
        
        let startDB, endDB;
        if (method === 'T20') {
            startDB = -5;
            endDB = -25;
        } else {
            startDB = -5;
            endDB = -35;
        }
        
        // Find sample indices where EDC crosses the start and end thresholds
        let iStart = -1, iEnd = -1;
        for (let i = 0; i < this.N; i++) {
            if (iStart < 0 && edc[i] <= startDB) iStart = i;
            if (iEnd < 0 && edc[i] <= endDB) iEnd = i;
        }
        
        if (iStart < 0 || iEnd < 0 || iEnd <= iStart) return -1;
        
        // Linear regression on the EDC segment [iStart, iEnd]
        const n = iEnd - iStart + 1;
        let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
        for (let i = iStart; i <= iEnd; i++) {
            const x = i / this.fs;
            const y = edc[i];
            sumX += x;
            sumY += y;
            sumXY += x * y;
            sumX2 += x * x;
        }
        
        const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
        
        if (slope >= 0) return -1; // EDC not decaying
        
        // RT60 = time for 60 dB decay
        const rt60 = -60.0 / slope;
        return rt60 > 0 ? rt60 : -1;
    }

    /**
     * Early Decay Time - time for first 10 dB of decay, extrapolated to 60 dB
     * @returns {number} EDT in seconds, or -1 if insufficient data
     */
    computeEDT() {
        const edc = this.computeEDC();
        
        let i10 = -1;
        for (let i = 0; i < this.N; i++) {
            if (edc[i] <= -10) {
                i10 = i;
                break;
            }
        }
        
        if (i10 < 1) return -1;
        
        // Linear regression from 0 to -10 dB
        const n = i10 + 1;
        let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
        for (let i = 0; i <= i10; i++) {
            const x = i / this.fs;
            const y = edc[i];
            sumX += x;
            sumY += y;
            sumXY += x * y;
            sumX2 += x * x;
        }
        
        const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
        
        if (slope >= 0) return -1;
        
        return -60.0 / slope;
    }

    /**
     * Clarity C80 - ratio of early (0-80ms) to late (80ms+) energy
     * C80 = 10 * log10( integral_0^80ms h^2 / integral_80ms^inf h^2 )
     * @returns {number} C80 in dB
     */
    computeC80() {
        const n80 = Math.min(Math.floor(0.08 * this.fs), this.N);
        
        let earlyEnergy = 0;
        let lateEnergy = 0;
        
        for (let i = 0; i < n80; i++) {
            earlyEnergy += this.ir[i] * this.ir[i];
        }
        for (let i = n80; i < this.N; i++) {
            lateEnergy += this.ir[i] * this.ir[i];
        }
        
        if (lateEnergy < 1e-30) return Infinity;
        return 10 * Math.log10(earlyEnergy / lateEnergy);
    }

    /**
     * Definition D50 - ratio of early (0-50ms) to total energy
     * D50 = integral_0^50ms h^2 / integral_0^inf h^2
     * @returns {number} D50 as percentage (0-100)
     */
    computeD50() {
        const n50 = Math.min(Math.floor(0.05 * this.fs), this.N);
        
        let earlyEnergy = 0;
        let totalEnergy = 0;
        
        for (let i = 0; i < this.N; i++) {
            const e = this.ir[i] * this.ir[i];
            totalEnergy += e;
            if (i < n50) earlyEnergy += e;
        }
        
        if (totalEnergy < 1e-30) return 0;
        return (earlyEnergy / totalEnergy) * 100;
    }

    /**
     * Centre Time Ts - first moment of the squared impulse response
     * Ts = integral_0^inf t*h^2(t)dt / integral_0^inf h^2(t)dt
     * @returns {number} Ts in milliseconds
     */
    computeTs() {
        let num = 0;
        let den = 0;
        
        for (let i = 0; i < this.N; i++) {
            const e = this.ir[i] * this.ir[i];
            num += (i / this.fs) * e;
            den += e;
        }
        
        if (den < 1e-30) return 0;
        return (num / den) * 1000; // convert to ms
    }

    /**
     * Peak Sound Pressure Level
     * @returns {number} SPL in dB (ref 20 uPa)
     */
    computeSPL() {
        let maxP = 0;
        for (let i = 0; i < this.N; i++) {
            const a = Math.abs(this.ir[i]);
            if (a > maxP) maxP = a;
        }
        if (maxP < 1e-30) return -Infinity;
        return 20 * Math.log10(maxP / 20e-6);
    }

    /**
     * Compute all parameters at once
     * @returns {Object} All acoustic parameters
     */
    computeAll() {
        return {
            rt60_T20: this.computeRT60('T20'),
            rt60_T30: this.computeRT60('T30'),
            edt: this.computeEDT(),
            c80: this.computeC80(),
            d50: this.computeD50(),
            ts: this.computeTs(),
            spl: this.computeSPL(),
            edc: this.computeEDC()
        };
    }
}

if (typeof module !== "undefined") {
    module.exports = { AcousticParameters };
}

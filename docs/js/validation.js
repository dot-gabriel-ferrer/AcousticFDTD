// validation.js — Pre-flight simulation checks
// Part of AcousticFDTD Web Simulator

class SimValidator {
  /**
   * Run all pre-flight checks on a simulation configuration.
   * @param {Object} config
   * @returns {{ errors: string[], warnings: string[], info: string[] }}
   */
  static validate(config) {
    const errors = [];
    const warnings = [];
    const info = [];

    const dims = config.dims || [1, 1, 1];
    const dres = config.dres || 0.01;
    const c0 = config.c0 || 343;
    const rho = config.rho || 1.21;
    const boundary = config.boundary || 'rigid';
    const wallReflection = config.wallReflection != null ? config.wallReflection : 1.0;
    const srcFreq = config.srcFreq || 1000;
    const srcType = config.srcType || 'sine';
    const srcPos = config.srcPos || [0.5, 0.5, 0.5];
    const mics = config.mics || [];
    const simTime = config.simTime || 0.01;
    const algorithm = config.algorithm || 'standard';
    const simDimension = config.simDimension || 3;
    const geometryMesh = config.geometryMesh || null;

    const nx = Math.floor(dims[0] / dres);
    const ny = Math.floor(dims[1] / dres);
    const nz = Math.floor(dims[2] / dres);

    // Active dimensions based on simDimension
    const activeCounts = simDimension === 1 ? [nx]
      : simDimension === 2 ? [nx, ny]
      : [nx, ny, nz];

    // 1. Grid too small
    for (let i = 0; i < activeCounts.length; i++) {
      const label = ['X', 'Y', 'Z'][i];
      if (activeCounts[i] < 3) {
        errors.push(
          `Grid ${label} has only ${activeCounts[i]} nodes (minimum 3). ` +
          `Increase room dimension ${label} or decrease spatial resolution (dres=${dres}m).`
        );
      }
    }

    // 2. Source frequency vs max frequency
    const maxFreq = c0 / (2 * Math.sqrt(3) * dres);
    if (srcFreq > maxFreq) {
      errors.push(
        `Source frequency ${srcFreq} Hz exceeds maximum resolvable frequency ` +
        `${maxFreq.toFixed(1)} Hz for dres=${dres}m. Decrease dres or lower frequency.`
      );
    } else if (srcFreq > 0.8 * maxFreq) {
      warnings.push(
        `Source frequency ${srcFreq} Hz is above 80% of max frequency ` +
        `${maxFreq.toFixed(1)} Hz. Results may show numerical dispersion. ` +
        `Consider decreasing dres for more accuracy.`
      );
    }

    // 3. Memory estimate
    const totalNodes = (simDimension === 1) ? nx
      : (simDimension === 2) ? nx * ny
      : nx * ny * nz;
    const memBytes = 9 * totalNodes * 8; // 9 Float64Arrays × totalNodes × 8 bytes
    const memMB = memBytes / (1024 * 1024);
    if (memMB > 2000) {
      errors.push(
        `Estimated memory usage ${memMB.toFixed(0)} MB exceeds 2 GB limit. ` +
        `Total grid nodes: ${totalNodes.toLocaleString()}. Increase dres or reduce room size.`
      );
    } else if (memMB > 500) {
      warnings.push(
        `High memory usage estimated: ${memMB.toFixed(0)} MB ` +
        `(${totalNodes.toLocaleString()} nodes). May cause browser slowdown.`
      );
    }

    // 4. Wall reflection out of range
    if (wallReflection > 1.0) {
      errors.push(
        `Wall reflection coefficient ${wallReflection} is greater than 1.0 (energy gain). ` +
        `Set to a value between 0.0 and 1.0.`
      );
    } else if (wallReflection < 0) {
      errors.push(
        `Wall reflection coefficient ${wallReflection} is negative. ` +
        `Set to a value between 0.0 and 1.0.`
      );
    }

    // 5. Source position outside room
    const srcLabels = ['X', 'Y', 'Z'];
    for (let i = 0; i < 3; i++) {
      if (srcPos[i] < 0 || srcPos[i] > dims[i]) {
        errors.push(
          `Source position ${srcLabels[i]}=${srcPos[i]}m is outside room ` +
          `(0 to ${dims[i]}m). Move source inside room boundaries.`
        );
      }
    }

    // 6. Mic positions outside room
    mics.forEach((mic, idx) => {
      const mx = mic.x != null ? mic.x : 0;
      const my = mic.y != null ? mic.y : 0;
      const mz = mic.z != null ? mic.z : 0;
      const mPos = [mx, my, mz];
      for (let i = 0; i < 3; i++) {
        if (mPos[i] < 0 || mPos[i] > dims[i]) {
          warnings.push(
            `Microphone ${idx + 1} position ${srcLabels[i]}=${mPos[i]}m ` +
            `is outside room (0 to ${dims[i]}m). Position will be clamped.`
          );
          break; // one warning per mic
        }
      }
    });

    // 7. Resolution too coarse for loaded geometry
    if (geometryMesh) {
      const minDim = Math.min(...dims);
      const nodesAcross = minDim / dres;
      if (nodesAcross < 10) {
        warnings.push(
          `Resolution may be too coarse for geometry: only ${nodesAcross.toFixed(1)} ` +
          `nodes across smallest room dimension (${minDim}m). ` +
          `Recommend at least 10 nodes. Decrease dres to ${(minDim / 10).toFixed(4)}m or smaller.`
        );
      }
    }

    // 8. Simulation estimated time too long
    const algoFactors = {
      standard: 1, compact: 3.5, iwb: 2, dwm: 1.2, 'high-order': 2.5
    };
    const algoFactor = algoFactors[algorithm] || 1;
    const dt = Math.sqrt(3) * 0.5 * dres / c0;
    const maxSteps = Math.ceil(simTime / dt);
    const estSeconds = (maxSteps * totalNodes * algoFactor) / 5e7;
    if (estSeconds > 300) {
      warnings.push(
        `Estimated computation time ~${SimValidator._formatTime(estSeconds)} ` +
        `(${maxSteps.toLocaleString()} steps × ${totalNodes.toLocaleString()} nodes). ` +
        `Consider increasing dres or reducing simTime.`
      );
    }
    info.push(
      `Estimated: ${maxSteps.toLocaleString()} steps, ` +
      `${totalNodes.toLocaleString()} nodes, ~${SimValidator._formatTime(estSeconds)}.`
    );

    // 9. Algorithm CFL limit check
    const cflLimits = {
      standard: 1 / Math.sqrt(3),
      dwm: 1 / Math.sqrt(3),
      compact: 1.0,
      iwb: 1.0,
      'high-order': 0.49
    };
    const scMax = cflLimits[algorithm] || (1 / Math.sqrt(3));
    const sc = 0.5; // default Courant number
    if (sc > scMax) {
      errors.push(
        `Courant number sc=${sc.toFixed(3)} exceeds CFL limit ${scMax.toFixed(4)} ` +
        `for ${algorithm} algorithm. Simulation will be unstable.`
      );
    }
    info.push(
      `CFL: sc=${sc.toFixed(3)}, limit=${scMax.toFixed(4)} (${algorithm}). ` +
      `Margin: ${((1 - sc / scMax) * 100).toFixed(1)}%.`
    );

    // 10. Grid too large for geometry features
    if (geometryMesh && dres > Math.min(...dims) / 10) {
      warnings.push(
        `Spatial resolution dres=${dres}m may be too coarse to capture geometry ` +
        `features. Smallest room dimension: ${Math.min(...dims)}m. ` +
        `Recommend dres ≤ ${(Math.min(...dims) / 10).toFixed(4)}m.`
      );
    }

    return { errors, warnings, info };
  }

  /**
   * Format seconds into a human-readable string.
   * @param {number} s
   * @returns {string}
   */
  static _formatTime(s) {
    if (s < 1) return `${(s * 1000).toFixed(0)}ms`;
    if (s < 60) return `${s.toFixed(1)}s`;
    if (s < 3600) return `${Math.floor(s / 60)}m ${Math.floor(s % 60)}s`;
    return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
  }
}

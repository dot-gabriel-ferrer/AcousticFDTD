// param-guidance.js — Real-time parameter guidance for the simulator UI
// Part of AcousticFDTD Web Simulator

class ParamGuidance {
  /**
   * Compute guidance metrics for the current parameter set.
   * @param {Object} params - {dims, dres, c0, rho, algorithm, simTime, srcFreq, simDimension}
   * @returns {Object} guidance
   */
  static compute(params) {
    const dims = params.dims || [1, 1, 1];
    const dres = params.dres || 0.01;
    const c0 = params.c0 || 343;
    const algorithm = params.algorithm || 'standard';
    const simTime = params.simTime || 0.01;
    const srcFreq = params.srcFreq || 1000;
    const simDimension = params.simDimension || 3;

    // Grid
    const nx = Math.floor(dims[0] / dres);
    const ny = Math.floor(dims[1] / dres);
    const nz = Math.floor(dims[2] / dres);
    const totalNodes = simDimension === 1 ? nx
      : simDimension === 2 ? nx * ny
      : nx * ny * nz;
    const minActive = simDimension === 1 ? nx
      : simDimension === 2 ? Math.min(nx, ny)
      : Math.min(nx, ny, nz);
    const gridStatus = minActive < 3 ? 'red' : minActive < 10 ? 'yellow' : 'green';

    // Time step and max frequency
    const dt = Math.sqrt(3) * 0.5 * dres / c0;
    const maxFreq = c0 / (2 * Math.sqrt(3) * dres);
    const freqStatus = srcFreq > maxFreq ? 'red'
      : srcFreq > 0.8 * maxFreq ? 'yellow' : 'green';

    // Memory
    const memBytes = 9 * totalNodes * 8;
    const memMB = memBytes / (1024 * 1024);
    const memStatus = memMB > 2000 ? 'red' : memMB > 500 ? 'yellow' : 'green';

    // Time estimate
    const algoFactors = {
      standard: 1.0, compact: 3.5, iwb: 2.0, dwm: 1.2, 'high-order': 2.5
    };
    const algoFactor = algoFactors[algorithm] || 1.0;
    const maxSteps = Math.ceil(simTime / dt);
    const estSeconds = (maxSteps * totalNodes * algoFactor) / 5e7;
    const timeStatus = estSeconds > 300 ? 'red' : estSeconds > 60 ? 'yellow' : 'green';

    // CFL
    const cflInfo = ParamGuidance._getCFLInfo(algorithm);

    return {
      grid: { nx, ny, nz, totalNodes, status: gridStatus },
      dt,
      maxFreq,
      freqStatus,
      memory: { mb: memMB, status: memStatus },
      time: { seconds: estSeconds, steps: maxSteps, status: timeStatus },
      cfl: cflInfo,
      algorithm
    };
  }

  /**
   * Get CFL and stencil info for an algorithm.
   * @param {string} algorithm
   * @returns {{ scMax: number, stencil: string, order: string }}
   */
  static _getCFLInfo(algorithm) {
    const table = {
      standard:     { scMax: 1 / Math.sqrt(3), stencil: '7-pt',   order: 'O(2,2)' },
      compact:      { scMax: 1.0,               stencil: '27-pt',  order: 'O(2,2)+' },
      iwb:          { scMax: 1.0,               stencil: '13-pt',  order: 'O(2,2)++' },
      dwm:          { scMax: 1 / Math.sqrt(3), stencil: '6-port', order: 'W-type' },
      'high-order': { scMax: 0.49,              stencil: '13-pt',  order: 'O(4,2)' }
    };
    return table[algorithm] || table.standard;
  }

  /**
   * Format seconds into a human-readable string.
   * @param {number} s
   * @returns {string}
   */
  static formatTime(s) {
    if (s < 0.001) return '<1ms';
    if (s < 1) return `${(s * 1000).toFixed(0)}ms`;
    if (s < 60) return `${s.toFixed(1)}s`;
    if (s < 3600) {
      const m = Math.floor(s / 60);
      const sec = Math.floor(s % 60);
      return sec > 0 ? `${m}m ${sec}s` : `${m}m`;
    }
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }

  /**
   * Get tooltip help text for a parameter name.
   * @param {string} paramName
   * @returns {string}
   */
  static tooltip(paramName) {
    const tips = {
      dres:
        'Spatial resolution (Δx) in meters. Smaller values give finer grids and ' +
        'higher maximum frequency, but increase memory and computation time cubically. ' +
        'Typical range: 0.005–0.05 m.',

      simTime:
        'Total simulated time in seconds. Determines the number of time steps. ' +
        'Longer simulations capture more reflections and reverb tail, but take longer. ' +
        'Typical range: 0.005–0.5 s.',

      srcFreq:
        'Source frequency in Hz. Must be below the grid\'s maximum resolvable frequency ' +
        '(fmax = c / 2√3·Δx). Higher frequencies need finer spatial resolution.',

      dims:
        'Room dimensions in meters [X, Y, Z]. Larger rooms require more grid nodes. ' +
        'Memory grows as X×Y×Z / Δx³.',

      boundary:
        'Boundary condition type. "Rigid" reflects all energy (hard wall). ' +
        '"Absorbing" reduces reflections at boundaries. ' +
        '"PML" (Perfectly Matched Layer) absorbs outgoing waves with minimal reflection.',

      wallReflection:
        'Wall reflection coefficient (0–1). 1.0 = perfect reflection (hard wall), ' +
        '0.0 = full absorption (anechoic). Typical room: 0.7–0.95.',

      algorithm:
        'FDTD algorithm variant. Standard (7-pt): fastest, basic accuracy. ' +
        'Compact (27-pt): isotropic, slower. IWB (13-pt): interpolated, good balance. ' +
        'DWM: digital waveguide mesh. High-order (13-pt): 4th-order spatial accuracy.',

      medium:
        'Propagation medium. Air: c=343 m/s, ρ=1.21 kg/m³. ' +
        'Water: c=1482 m/s, ρ=998 kg/m³. Helium: c=1007 m/s, ρ=0.164 kg/m³. ' +
        'Steel: c=5960 m/s, ρ=7850 kg/m³. Custom: enter your own values.'
    };
    return tips[paramName] || '';
  }
}

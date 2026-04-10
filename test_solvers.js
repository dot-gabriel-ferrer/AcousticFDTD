/**
 * Solver Stability & Correctness Tests
 *
 * Runs each benchmark solver for N steps and checks:
 *   1. No NaN/Infinity (divergence check)
 *   2. Max pressure stays bounded (stability check)
 *   3. Source injection produces non-zero field (propagation check)
 *   4. Receiver records data (recording check)
 *
 * Usage: node test_solvers.js
 */

"use strict";

const path = require("path");

const {
    StandardFDTD, CompactFDTD, InterpolatedWidebandFDTD,
    RectilinearDWM, HighOrderFDTD
} = require(path.join(__dirname, "docs", "js", "benchmark.js"));

const { FDTDSolver } = require(path.join(__dirname, "docs", "js", "fdtd-solver.js"));

// ============================================================
// Test Configuration
// ============================================================

const TEST_CONFIG = {
    dims: [0.5, 0.5, 0.5],
    dres: 0.05,
    c0: 343,
    rho: 1.225,
    sc: 0.5,
    boundary: "reflective",
    wallReflection: 1.0
};

const SOURCE = {
    position: [0.25, 0.25, 0.25],
    frequency: 500,
    amplitude: 1.0,
    type: "gaussian",
    injection: "soft"
};

const RECEIVER = {
    position: [0.35, 0.35, 0.25],
    label: "TestMic"
};

const NUM_STEPS = 200;
const MAX_PRESSURE = 1e6;  // Anything above this is divergence

// ============================================================
// Test Runner
// ============================================================

function testSolver(SolverClass, name) {
    const result = {
        name: name,
        passed: true,
        errors: [],
        maxPressure: 0,
        receiverSamples: 0,
        fieldNonZero: false,
        stepsCompleted: 0
    };

    try {
        const solver = new SolverClass(TEST_CONFIG);
        solver.addSource(SOURCE);
        solver.addReceiver(RECEIVER);

        result.dt = solver.dt;
        result.sc = solver.sc;
        result.grid = solver.nx + "x" + solver.ny + "x" + solver.nz;

        for (let step = 0; step < NUM_STEPS; step++) {
            solver.calcStep();
            result.stepsCompleted++;

            // Check for NaN/Infinity in pressure field every 20 steps
            if (step % 20 === 0) {
                let pArr;
                if (solver.p) {
                    pArr = solver.p[solver.n !== undefined ? solver.n : (solver.timeIdx % 3)];
                } else if (solver.pJunction) {
                    pArr = solver.pJunction;
                }

                if (pArr) {
                    let maxP = 0;
                    for (let i = 0; i < pArr.length; i++) {
                        const v = pArr[i];
                        if (isNaN(v) || !isFinite(v)) {
                            result.passed = false;
                            result.errors.push("NaN/Inf at step " + step + ", idx " + i);
                            return result;
                        }
                        const absV = Math.abs(v);
                        if (absV > maxP) maxP = absV;
                    }
                    result.maxPressure = Math.max(result.maxPressure, maxP);

                    if (maxP > MAX_PRESSURE) {
                        result.passed = false;
                        result.errors.push("Diverged at step " + step + ": maxP = " + maxP.toExponential(3));
                        return result;
                    }
                }
            }
        }

        // Check receiver recorded data
        if (solver.receivers.length > 0 && solver.receivers[0].data.length > 0) {
            result.receiverSamples = solver.receivers[0].data.length;

            // Check that at least some samples are non-zero
            let hasNonZero = false;
            for (const v of solver.receivers[0].data) {
                if (Math.abs(v) > 1e-20) { hasNonZero = true; break; }
            }
            result.fieldNonZero = hasNonZero;
            if (!hasNonZero) {
                result.passed = false;
                result.errors.push("Receiver data is all zeros - source not propagating");
            }
        } else {
            result.passed = false;
            result.errors.push("No receiver data recorded");
        }

        // Final pressure check
        const slice = solver.getSlice("xy", Math.floor(solver.nz / 2));
        if (slice && slice.data) {
            let sliceMax = 0;
            for (let i = 0; i < slice.data.length; i++) {
                const a = Math.abs(slice.data[i]);
                if (a > sliceMax) sliceMax = a;
            }
            if (sliceMax < 1e-20) {
                result.errors.push("Warning: slice data all zeros at end");
            }
        }

    } catch (err) {
        result.passed = false;
        result.errors.push("Exception: " + err.message);
    }

    return result;
}

// ============================================================
// Run All Tests
// ============================================================

console.log("=".repeat(65));
console.log("  SOLVER STABILITY TEST SUITE");
console.log("  Grid: " + Math.floor(0.5/0.05) + "x" + Math.floor(0.5/0.05) + "x" + Math.floor(0.5/0.05) +
            " | Steps: " + NUM_STEPS + " | Source: Gaussian 500Hz");
console.log("=".repeat(65));
console.log();

const solvers = [
    [FDTDSolver, "FDTDSolver (production Yee)"],
    [StandardFDTD, "StandardFDTD (benchmark Yee)"],
    [CompactFDTD, "CompactFDTD (KW 27-pt)"],
    [InterpolatedWidebandFDTD, "IWB-FDTD (interpolated)"],
    [RectilinearDWM, "DWM (rectilinear)"],
    [HighOrderFDTD, "HighOrder FDTD O(4,2)"]
];

let allPassed = true;
const results = [];

for (const [SolverClass, name] of solvers) {
    const result = testSolver(SolverClass, name);
    results.push(result);

    const status = result.passed ? "PASS" : "FAIL";
    const icon = result.passed ? "[OK]" : "[!!]";

    console.log(icon + " " + name);
    console.log("    Status: " + status +
                " | Steps: " + result.stepsCompleted + "/" + NUM_STEPS +
                " | Max P: " + result.maxPressure.toExponential(3));
    console.log("    Sc=" + (result.sc || "?") +
                " | dt=" + (result.dt ? (result.dt * 1e6).toFixed(2) + "us" : "?") +
                " | Grid: " + (result.grid || "?") +
                " | Rec: " + result.receiverSamples + " samples" +
                " | NonZero: " + result.fieldNonZero);

    if (result.errors.length > 0) {
        for (const err of result.errors) {
            console.log("    ERROR: " + err);
        }
    }
    console.log();

    if (!result.passed) allPassed = false;
}

// ============================================================
// Additional: Test with different boundary conditions
// ============================================================

console.log("-".repeat(65));
console.log("  ABSORBING BOUNDARY TEST");
console.log("-".repeat(65));
console.log();

const absConfig = Object.assign({}, TEST_CONFIG, { boundary: "absorbing" });
for (const [SolverClass, name] of solvers) {
    const solver = new SolverClass(absConfig);
    solver.addSource(SOURCE);
    solver.addReceiver(RECEIVER);

    let diverged = false;
    for (let step = 0; step < NUM_STEPS; step++) {
        solver.calcStep();
        if (step === NUM_STEPS - 1) {
            let pArr = solver.p ? solver.p[solver.n !== undefined ? solver.n : (solver.timeIdx % 3)] : solver.pJunction;
            if (pArr) {
                for (let i = 0; i < pArr.length; i++) {
                    if (isNaN(pArr[i]) || Math.abs(pArr[i]) > MAX_PRESSURE) {
                        diverged = true; break;
                    }
                }
            }
        }
    }
    const icon = diverged ? "[!!]" : "[OK]";
    console.log(icon + " " + name + " (absorbing): " + (diverged ? "FAIL" : "PASS"));
}

// ============================================================
// Summary
// ============================================================

console.log();
console.log("=".repeat(65));
if (allPassed) {
    console.log("  ALL SOLVERS PASSED - Ready for deployment");
} else {
    console.log("  SOME SOLVERS FAILED - Do NOT deploy until fixed");
    const failed = results.filter(r => !r.passed).map(r => r.name);
    console.log("  Failed: " + failed.join(", "));
}
console.log("=".repeat(65));

process.exit(allPassed ? 0 : 1);

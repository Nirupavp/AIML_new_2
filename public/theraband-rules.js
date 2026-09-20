/**
 * theraband-rules.js — JS port of Theraband_physio's rule_engine.py and
 * the color-detection half of vision_utils.py, generalized to work for
 * ANY exercise name (not 3 hardcoded ones) by having Gemini pick which
 * rules apply per exercise (see gemini.js's structureTherabandExercise),
 * while this file keeps sole ownership of what each rule actually checks
 * geometrically — Gemini only ever selects a "type" from a fixed
 * whitelist and an optional numeric threshold, never executable logic.
 *
 * Landmark indices match MediaPipe Pose (same as pose-engine.js).
 */
"use strict";

window.TherabandRules = (function () {

  const SIDE_INDICES = {
    left:  { shoulder: 11, elbow: 13, wrist: 15, hip: 23, ear: 7 },
    right: { shoulder: 12, elbow: 14, wrist: 16, hip: 24, ear: 8 },
  };

  function dist2D(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  /* ── Individual rule checks — each ported from rule_engine.py's logic,
   *    generalized from "left/right" hardcoding to a `side` param. ── */

  // Universal-ish: shoulder creeping up toward the ear (trapezius compensation)
  function checkShoulderShrug(lm, side, threshold = 0.12) {
    const idx = SIDE_INDICES[side];
    if (dist2D(lm[idx.shoulder], lm[idx.ear]) < threshold) {
      return "Shoulder Shrug Detected: Relax upper traps";
    }
    return null;
  }

  // Elbow drifting away from the torso (e.g. during curls)
  function checkElbowDrift(lm, side, threshold = 0.18) {
    const idx = SIDE_INDICES[side];
    if (Math.abs(lm[idx.elbow].x - lm[idx.hip].x) > threshold) {
      return "Elbow Drifted: Keep elbow pinned to side";
    }
    return null;
  }

  // Wrist leading ahead of the elbow vertically (e.g. lateral raises — wrist shouldn't rise above elbow)
  function checkLimbLeading(lm, side, threshold = 0.05) {
    const idx = SIDE_INDICES[side];
    if (lm[idx.wrist].y < lm[idx.elbow].y - threshold) {
      return "Wrist Leading: Keep elbow level with wrist";
    }
    return null;
  }

  // Elbow (or equivalent joint) separating from the torso when it should stay pinned (e.g. external rotation)
  function checkJointUnpinned(lm, side, threshold = 0.22) {
    const idx = SIDE_INDICES[side];
    if (dist2D(lm[idx.elbow], lm[idx.hip]) > threshold) {
      return "Elbow Unpinned: Keep elbow pressed against your side";
    }
    return null;
  }

  // Torso leaning/arching away from a roughly vertical shoulder-hip line (e.g. presses, squats)
  function checkBackArch(lm, side, threshold = 0.12) {
    const idx = SIDE_INDICES[side];
    const shoulder = lm[idx.shoulder], hip = lm[idx.hip];
    if (Math.abs(shoulder.x - hip.x) > threshold) {
      return "Back Arching: Keep your torso upright, engage your core";
    }
    return null;
  }

  const CHECKERS = {
    shoulder_shrug:  checkShoulderShrug,
    elbow_drift:     checkElbowDrift,
    limb_leading:    checkLimbLeading,
    joint_unpinned:  checkJointUnpinned,
    back_arch:       checkBackArch,
  };

  /**
   * Runs the exercise's selected formRules against the current frame's
   * landmarks. Returns { ok, errors, warnings } matching the shape
   * pose-engine.js expects from validateForm.
   */
  function evaluateRules(formRules, lm, side) {
    if (!lm || !formRules || !formRules.length || !SIDE_INDICES[side]) {
      return { ok: true, errors: [], warnings: [] };
    }
    const errors = [];
    formRules.forEach(rule => {
      const checker = CHECKERS[rule.type];
      if (!checker) return;
      const threshold = typeof rule.threshold === "number" ? rule.threshold : undefined;
      const msg = threshold !== undefined ? checker(lm, side, threshold) : checker(lm, side);
      if (msg) errors.push(rule.message || msg);
    });
    return { ok: errors.length === 0, errors, warnings: [] };
  }

  /* ── Band color detection (HSV thresholding), ported from
   *    vision_utils.py's TherabandColorDetector. Runs on a small canvas
   *    crop around the wrist rather than the whole frame, and the caller
   *    (theraband-coach.js) throttles how often this runs — it's cheap
   *    per-call but there's no reason to run it 30x/sec. ── */

  const COLOR_MAP = {
    Yellow: { resistance: "1 - Light",       ranges: [[[20, 100, 100], [30, 255, 255]]] },
    Green:  { resistance: "3 - Heavy",       ranges: [[[35, 80, 80], [85, 255, 255]]] },
    Blue:   { resistance: "4 - Extra Heavy", ranges: [[[90, 80, 80], [130, 255, 255]]] },
    Red:    { resistance: "2 - Medium",      ranges: [[[0, 100, 100], [10, 255, 255]], [[170, 100, 100], [180, 255, 255]]] },
  };

  // RGB [0-255] -> HSV in OpenCV's convention: H in [0,179], S/V in [0,255]
  function rgbToHsvCv(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const d = max - min;
    let h = 0;
    if (d !== 0) {
      if (max === r) h = ((g - b) / d) % 6;
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60;
      if (h < 0) h += 360;
    }
    const s = max === 0 ? 0 : d / max;
    const v = max;
    return [Math.round(h / 2), Math.round(s * 255), Math.round(v * 255)]; // /2 to match OpenCV's 0-179 hue scale
  }

  function inRange(hsv, lower, upper) {
    return hsv[0] >= lower[0] && hsv[0] <= upper[0] &&
           hsv[1] >= lower[1] && hsv[1] <= upper[1] &&
           hsv[2] >= lower[2] && hsv[2] <= upper[2];
  }

  let _scratchCanvas = null;
  function getScratchCanvas() {
    if (!_scratchCanvas) {
      _scratchCanvas = document.createElement("canvas");
    }
    return _scratchCanvas;
  }

  /**
   * @param {HTMLVideoElement} videoEl  the live camera feed
   * @param {{x:number,y:number}} normPoint  normalized (0-1) landmark position to sample around (e.g. wrist)
   * @param {number} roiPx  half-size of the square sample region, in source pixels
   * @param {number} pixelStep  sample every Nth pixel (perf — full-res isn't needed for a rough color vote)
   */
  function detectBandColor(videoEl, normPoint, roiPx = 70, pixelStep = 3) {
    const vw = videoEl.videoWidth, vh = videoEl.videoHeight;
    if (!vw || !vh) return { color: "Unknown", resistance: "Unassigned" };

    const cx = normPoint.x * vw, cy = normPoint.y * vh;
    const sx = Math.max(0, Math.round(cx - roiPx));
    const sy = Math.max(0, Math.round(cy - roiPx));
    const sw = Math.min(vw - sx, roiPx * 2);
    const sh = Math.min(vh - sy, roiPx * 2);
    if (sw <= 0 || sh <= 0) return { color: "Unknown", resistance: "Unassigned" };

    const canvas = getScratchCanvas();
    canvas.width = sw;
    canvas.height = sh;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(videoEl, sx, sy, sw, sh, 0, 0, sw, sh);

    let data;
    try {
      data = ctx.getImageData(0, 0, sw, sh).data;
    } catch (_) {
      return { color: "Unknown", resistance: "Unassigned" }; // e.g. tainted canvas — fail quietly
    }

    const counts = { Yellow: 0, Green: 0, Blue: 0, Red: 0 };
    for (let py = 0; py < sh; py += pixelStep) {
      for (let px = 0; px < sw; px += pixelStep) {
        const i = (py * sw + px) * 4;
        const hsv = rgbToHsvCv(data[i], data[i + 1], data[i + 2]);
        for (const [name, cfg] of Object.entries(COLOR_MAP)) {
          if (cfg.ranges.some(([lo, hi]) => inRange(hsv, lo, hi))) {
            counts[name]++;
            break;
          }
        }
      }
    }

    let best = "Unknown", bestCount = 0;
    const noiseFloor = 15; // scaled down from Python's 120px threshold since we subsample every pixelStep px
    Object.entries(counts).forEach(([name, count]) => {
      if (count > bestCount && count > noiseFloor) { best = name; bestCount = count; }
    });

    return { color: best, resistance: best === "Unknown" ? "Unassigned" : COLOR_MAP[best].resistance };
  }

  /**
   * Wraps window.buildDynamicExerciseConfig (exercise-builder.js) — reuses
   * its rep/ROM/angle-tracking machinery as-is, and layers on top:
   *   1. validateForm — runs evaluateRules() every 3rd frame (pose-engine.js
   *      already calls validateForm on that cadence) and accumulates any
   *      errors onto the exercise object itself while the tracked joint is
   *      away from its resting ("top") angle — a rough proxy for "currently
   *      under tension", mirroring the Python original's PEAK-phase gating
   *      without needing pose-engine.js to expose its private phase state.
   *   2. validateRep — overridden so a rep is rejected if ANY form error
   *      fired during that rep (matching the Python original's behavior:
   *      technique errors reject the rep, not ROM shortfall).
   */
  function buildTherabandExerciseConfig({ name, category = "Rehabilitation", targetJoints, rom, romTolerance = 20, side = "right", formRules = [], instructions = [], commonMistakes = [], sources = [] }) {
    const built = window.buildDynamicExerciseConfig({
      name, category, joints: targetJoints, rom, romTolerance,
      sourceType: "theraband-ai",
    });

    const primaryJoint = targetJoints[0];

    built.live.side = side;
    built.live.formRules = formRules;
    built.live.instructions = instructions;
    built.live.commonMistakes = commonMistakes;
    built.live.sources = sources;
    built.live.isTheraband = true;

    built.live.validateForm = (angles, landmarks, config) => {
      const result = evaluateRules(config.formRules, landmarks, config.side);
      const restTop = config.rom[primaryJoint]?.top;
      const currentAngle = angles[primaryJoint];
      const underTension = restTop !== undefined && currentAngle !== undefined &&
        Math.abs(currentAngle - restTop) > (config.romTolerance || 20);
      if (underTension && result.errors.length) {
        if (!config._repErrorBuffer) config._repErrorBuffer = new Set();
        result.errors.forEach(e => config._repErrorBuffer.add(e));
      }
      return result;
    };

    built.live.validateRep = (downAngles, upAngles, config) => {
      const errors = config._repErrorBuffer ? [...config._repErrorBuffer] : [];
      config._repErrorBuffer = new Set();
      return { ok: errors.length === 0, errors };
    };

    // Persisted (string-body) versions — reconstructed via `new Function`
    // on reload by exercises.js, same convention as the rest of the app.
    // TherabandRules is a global (window.TherabandRules), so it's in scope
    // when these bodies run.
    built.persistable.side = side;
    built.persistable.formRules = formRules;
    built.persistable.instructions = instructions;
    built.persistable.commonMistakes = commonMistakes;
    built.persistable.sources = sources;
    built.persistable.isTheraband = true;
    built.persistable.validateForm = `
      var result = TherabandRules.evaluateRules(config.formRules, landmarks, config.side);
      var restTop = config.rom['${primaryJoint}'] ? config.rom['${primaryJoint}'].top : undefined;
      var currentAngle = angles['${primaryJoint}'];
      var underTension = restTop !== undefined && currentAngle !== undefined &&
        Math.abs(currentAngle - restTop) > (config.romTolerance || 20);
      if (underTension && result.errors.length) {
        if (!config._repErrorBuffer) config._repErrorBuffer = new Set();
        result.errors.forEach(function(e){ config._repErrorBuffer.add(e); });
      }
      return result;
    `;
    built.persistable.validateRep = `
      var errors = config._repErrorBuffer ? Array.from(config._repErrorBuffer) : [];
      config._repErrorBuffer = new Set();
      return { ok: errors.length === 0, errors: errors };
    `;

    return built;
  }

  return { evaluateRules, detectBandColor, SIDE_INDICES, CHECKERS, buildTherabandExerciseConfig };
})();

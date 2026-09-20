/**
 * exercise-builder.js — Turns a { joints, rom, romTolerance } spec into a
 * live ExerciseRegistry entry that pose-engine.js can run.
 *
 * Factored out of the admin "upload video → capture ROM" flow in app.js so
 * the condition-search flow (condition-flow.js) can build trackable
 * exercises from Gemini-estimated joint targets instead of a captured
 * video frame — same underlying engine, different source of truth for the
 * target angles.
 *
 * Supported joints mirror what pose-engine.js/exercises.js already compute
 * angles for: knee, hip, shoulder, elbow, ankle.
 */
"use strict";

window.buildDynamicExerciseConfig = function buildDynamicExerciseConfig({
  name,
  category = "Rehabilitation",
  joints,          // e.g. ["knee"]
  rom,             // e.g. { knee: { top: 170, bottom: 120 } }
  romTolerance = 20,
  description = "",
  emoji = "🩺",
  videoUrl = null,        // YouTube URL, if the reference is a YouTube video
  videoDataUrl = null,    // local blob URL, if the reference is an uploaded file
  sourceType = "condition", // 'condition' | 'physio' | 'admin'
  conditionTag = null,
  cautionNotes = "",
}) {
  joints = (joints || []).filter(j => rom && rom[j]);
  if (!joints.length) joints = Object.keys(rom || {});
  if (!joints.length) joints = ["knee"]; // last-resort default so the engine doesn't crash

  const primaryJoint = joints[0];
  const topAngle = rom[primaryJoint]?.top ?? 170;
  const bottomAngle = rom[primaryJoint]?.bottom ?? 100;
  const tolerance = romTolerance || 20;

  const isDecreasing = topAngle >= bottomAngle;
  const range = Math.max(15, Math.abs(topAngle - bottomAngle));

  let stateMachineBody = "";
  if (isDecreasing) {
    const downTarget = Math.round(bottomAngle + Math.min(tolerance * 0.75, range * 0.35));
    const upTarget   = Math.round(topAngle - Math.min(tolerance * 0.75, range * 0.35));
    const midDown    = Math.round(topAngle - range * 0.35);
    const midUp      = Math.round(bottomAngle + range * 0.35);

    stateMachineBody = `
      var angle = angles['${primaryJoint}'] ?? 180;
      if (phase === 'up' && angle <= ${midDown}) return 'transition-down';
      if (phase === 'transition-down') {
        if (angle <= ${downTarget}) return 'down';
        if (angle >= ${upTarget}) return 'up';
      }
      if (phase === 'down' && angle >= ${midUp}) return 'transition-up';
      if (phase === 'transition-up') {
        if (angle >= ${upTarget}) return 'up';
        if (angle <= ${downTarget}) return 'down';
      }
      return null;
    `;
  } else {
    const downTarget = Math.round(bottomAngle - Math.min(tolerance * 0.75, range * 0.35));
    const upTarget   = Math.round(topAngle + Math.min(tolerance * 0.75, range * 0.35));
    const midDown    = Math.round(topAngle + range * 0.35);
    const midUp      = Math.round(bottomAngle - range * 0.35);

    stateMachineBody = `
      var angle = angles['${primaryJoint}'] ?? 0;
      if (phase === 'up' && angle >= ${midDown}) return 'transition-down';
      if (phase === 'transition-down') {
        if (angle >= ${downTarget}) return 'down';
        if (angle <= ${upTarget}) return 'up';
      }
      if (phase === 'down' && angle <= ${midUp}) return 'transition-up';
      if (phase === 'transition-up') {
        if (angle <= ${upTarget}) return 'up';
        if (angle >= ${downTarget}) return 'down';
      }
      return null;
    `;
  }

  // Fill in ROM entries for every tracked joint so gauges render, even if
  // Gemini only gave us the primary one.
  const fullRom = {};
  joints.forEach(j => {
    const def = rom[j] || { top: topAngle, bottom: bottomAngle };
    fullRom[j] = {
      top: def.top,
      bottom: def.bottom,
      label: j.charAt(0).toUpperCase() + j.slice(1) + " Angle",
    };
  });

  const computeAnglesBody = `
    if (!lm || lm.length < 33) return {};
    var m = {
      knee: function(){
        var vL = (lm[23].visibility>0.4 && lm[25].visibility>0.4 && lm[27].visibility>0.4);
        var vR = (lm[24].visibility>0.4 && lm[26].visibility>0.4 && lm[28].visibility>0.4);
        var aL = vL ? PoseUtils.angle3(lm[23],lm[25],lm[27]) : null;
        var aR = vR ? PoseUtils.angle3(lm[24],lm[26],lm[28]) : null;
        if (aL !== null && aR !== null) return Math.round((aL+aR)/2);
        if (aL !== null) return Math.round(aL);
        if (aR !== null) return Math.round(aR);
        return Math.round((PoseUtils.angle3(lm[23],lm[25],lm[27])+PoseUtils.angle3(lm[24],lm[26],lm[28]))/2);
      },
      hip: function(){
        var vL = (lm[11].visibility>0.4 && lm[23].visibility>0.4 && lm[25].visibility>0.4);
        var vR = (lm[12].visibility>0.4 && lm[24].visibility>0.4 && lm[26].visibility>0.4);
        var aL = vL ? PoseUtils.angle3(lm[11],lm[23],lm[25]) : null;
        var aR = vR ? PoseUtils.angle3(lm[12],lm[24],lm[26]) : null;
        if (aL !== null && aR !== null) return Math.round((aL+aR)/2);
        if (aL !== null) return Math.round(aL);
        if (aR !== null) return Math.round(aR);
        return Math.round((PoseUtils.angle3(lm[11],lm[23],lm[25])+PoseUtils.angle3(lm[12],lm[24],lm[26]))/2);
      },
      elbow: function(){
        var vL = (lm[11].visibility>0.4 && lm[13].visibility>0.4 && lm[15].visibility>0.4);
        var vR = (lm[12].visibility>0.4 && lm[14].visibility>0.4 && lm[16].visibility>0.4);
        var aL = vL ? PoseUtils.angle3(lm[11],lm[13],lm[15]) : null;
        var aR = vR ? PoseUtils.angle3(lm[12],lm[14],lm[16]) : null;
        if (aL !== null && aR !== null) return Math.round((aL+aR)/2);
        if (aL !== null) return Math.round(aL);
        if (aR !== null) return Math.round(aR);
        return Math.round((PoseUtils.angle3(lm[11],lm[13],lm[15])+PoseUtils.angle3(lm[12],lm[14],lm[16]))/2);
      },
      shoulder: function(){
        var vL = (lm[13].visibility>0.4 && lm[11].visibility>0.4 && lm[23].visibility>0.4);
        var vR = (lm[14].visibility>0.4 && lm[12].visibility>0.4 && lm[24].visibility>0.4);
        var aL = vL ? PoseUtils.angle3(lm[13],lm[11],lm[23]) : null;
        var aR = vR ? PoseUtils.angle3(lm[14],lm[12],lm[24]) : null;
        if (aL !== null && aR !== null) return Math.round((aL+aR)/2);
        if (aL !== null) return Math.round(aL);
        if (aR !== null) return Math.round(aR);
        return Math.round((PoseUtils.angle3(lm[13],lm[11],lm[23])+PoseUtils.angle3(lm[14],lm[12],lm[24]))/2);
      },
      ankle: function(){
        var vL = (lm[25].visibility>0.4 && lm[27].visibility>0.4 && lm[31].visibility>0.4);
        var vR = (lm[26].visibility>0.4 && lm[28].visibility>0.4 && lm[32].visibility>0.4);
        var aL = vL ? PoseUtils.angle3(lm[25],lm[27],lm[31]) : null;
        var aR = vR ? PoseUtils.angle3(lm[26],lm[28],lm[32]) : null;
        if (aL !== null && aR !== null) return Math.round((aL+aR)/2);
        if (aL !== null) return Math.round(aL);
        if (aR !== null) return Math.round(aR);
        return Math.round((PoseUtils.angle3(lm[25],lm[27],lm[31])+PoseUtils.angle3(lm[26],lm[28],lm[32]))/2);
      },
    };
    var r = {};
    ${JSON.stringify(joints)}.forEach(function(j){ if (m[j]) r[j] = m[j](); });
    if (!Object.keys(r).length && m['${primaryJoint}']) r['${primaryJoint}'] = m['${primaryJoint}']();
    return r;
  `;

  const validateRepBody = `
    var errors = [];
    return { ok: true, errors: errors };
  `;

  const config = {
    id: (name || "exercise").toLowerCase().replace(/\s+/g, "-") + "-" + Date.now(),
    name,
    category,
    emoji,
    description,
    joints,
    rom: fullRom,
    romTolerance: tolerance,
    videoUrl,
    videoDataUrl,
    sourceType,
    conditionTag,
    cautionNotes,
  };

  const live = { ...config };
  live.repStateMachine = new Function("phase", "angles", "config", stateMachineBody);
  live.validateForm = () => ({ ok: true, errors: [], warnings: [] });
  live.computeAngles = new Function("lm", computeAnglesBody);
  live.computeBAI = window.PoseUtils.symmetryBAI;
  live.validateRep = new Function("downAngles", "upAngles", "config", validateRepBody);

  // Persisted (serializable) version — functions stored as source strings,
  // same convention exercises.js already uses for admin-added exercises.
  const persistable = {
    ...config,
    repStateMachine: stateMachineBody,
    validateForm: "return { ok: true, errors: [], warnings: [] };",
    computeAngles: computeAnglesBody,
    validateRep: validateRepBody,
  };

  return { live, persistable };
};

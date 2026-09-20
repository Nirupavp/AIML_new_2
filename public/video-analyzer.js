/**
 * video-analyzer.js — Scans a user-uploaded reference video frame-by-frame
 * with MediaPipe Pose to automatically discover:
 *   1. Which joints actually move during the exercise (vs. stay static).
 *   2. The observed min/max angle for each — used directly as the ROM
 *      "bottom"/"top" targets that pose-engine.js tracks against.
 *
 * This replaces manual "seek to top, click capture, seek to bottom, click
 * capture" with one automated pass — the AI is doing the analysis, per the
 * new plan, instead of the user hunting for exact frames.
 *
 * Supported joints match exercises.js/exercise-builder.js: knee, hip,
 * shoulder, elbow, ankle.
 */
"use strict";

window.VideoAnalyzer = (function () {
  const JOINTS = ["knee", "hip", "shoulder", "elbow", "ankle"];

  function computeAllAngles(lm) {
    if (!lm || lm.length < 33) return null;
    return {
      knee:     Math.round((PoseUtils.angle3(lm[23], lm[25], lm[27]) + PoseUtils.angle3(lm[24], lm[26], lm[28])) / 2),
      hip:      Math.round((PoseUtils.angle3(lm[11], lm[23], lm[25]) + PoseUtils.angle3(lm[12], lm[24], lm[26])) / 2),
      elbow:    Math.round((PoseUtils.angle3(lm[11], lm[13], lm[15]) + PoseUtils.angle3(lm[12], lm[14], lm[16])) / 2),
      shoulder: Math.round((PoseUtils.angle3(lm[13], lm[11], lm[23]) + PoseUtils.angle3(lm[14], lm[12], lm[24])) / 2),
      ankle:    Math.round((PoseUtils.angle3(lm[25], lm[27], lm[31]) + PoseUtils.angle3(lm[26], lm[28], lm[32])) / 2),
    };
  }

  /**
   * @param {File} videoFile
   * @param {(pct:number)=>void} onProgress  0–100
   * @param {number} maxSamples  how many evenly-spaced frames to check (bounds cost regardless of video length)
   * @returns {Promise<{ jointRanges: {[joint]: {min:number,max:number,range:number}}, framesAnalyzed:number, framesWithPose:number, durationSec:number }>}
   */
  async function analyzeReferenceVideo(videoFile, onProgress, maxSamples = 60) {
    const videoEl = document.createElement("video");
    videoEl.muted = true;
    videoEl.playsInline = true;
    videoEl.src = URL.createObjectURL(videoFile);

    await new Promise((resolve, reject) => {
      videoEl.onloadedmetadata = resolve;
      videoEl.onerror = () => reject(new Error("Could not read video file — is it a valid mp4/webm?"));
    });

    const duration = videoEl.duration;
    if (!duration || !isFinite(duration)) throw new Error("Video has no readable duration.");

    const pose = new Pose({ locateFile: (f) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${f}` });
    pose.setOptions({ modelComplexity: 1, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });

    const samples = Math.max(10, Math.min(maxSamples, Math.floor(duration * 6))); // ~6 samples/sec, capped
    const step = duration / samples;

    const mins = {}, maxs = {};
    JOINTS.forEach(j => { mins[j] = Infinity; maxs[j] = -Infinity; });
    let framesWithPose = 0;

    function seekTo(t) {
      return new Promise((resolve) => {
        const handler = () => { videoEl.removeEventListener("seeked", handler); resolve(); };
        videoEl.addEventListener("seeked", handler);
        videoEl.currentTime = Math.min(t, duration - 0.05);
      });
    }

    function runPoseOnce() {
      return new Promise((resolve) => {
        pose.onResults((results) => resolve(results.poseLandmarks || null));
        pose.send({ image: videoEl }).catch(() => resolve(null));
      });
    }

    for (let i = 0; i < samples; i++) {
      await seekTo(i * step);
      const lm = await runPoseOnce();
      const angles = computeAllAngles(lm);
      if (angles) {
        framesWithPose++;
        JOINTS.forEach(j => {
          if (angles[j] < mins[j]) mins[j] = angles[j];
          if (angles[j] > maxs[j]) maxs[j] = angles[j];
        });
      }
      if (onProgress) onProgress(Math.round(((i + 1) / samples) * 100));
    }

    URL.revokeObjectURL(videoEl.src);

    const jointRanges = {};
    JOINTS.forEach(j => {
      if (maxs[j] > -Infinity) {
        jointRanges[j] = { min: mins[j], max: maxs[j], range: maxs[j] - mins[j] };
      }
    });

    return { jointRanges, framesAnalyzed: samples, framesWithPose, durationSec: duration };
  }

  return { analyzeReferenceVideo, JOINTS };
})();

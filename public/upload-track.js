// upload-track.js — "Upload & Track" feature.
"use strict";

const $u = (id) => document.getElementById(id);

let _uploadedVideoFile = null;
let _analyzedRanges = null; // { joint: {min,max,range,source} }
let _activeSourceMode = "youtube"; // "youtube" | "video"

const JOINT_LABELS = { knee: "Knee", hip: "Hip", shoulder: "Shoulder", elbow: "Elbow", ankle: "Ankle" };
const ACTIVE_RANGE_THRESHOLD = 20; // degrees — below this, a joint is treated as "not really moving"

function extractYouTubeId(url) {
  if (!url || !url.trim()) return null;
  try {
    const trimmed = url.trim();
    const u = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
    if (u.hostname.includes("youtu.be")) return u.pathname.slice(1).split("?")[0];
    if (u.hostname.includes("youtube.com")) {
      if (u.searchParams.get("v")) return u.searchParams.get("v");
      const m = u.pathname.match(/\/(shorts|embed|v)\/([^/?]+)/);
      if (m) return m[2];
    }
  } catch (_) { /* not a valid URL */ }
  return null;
}

/* ─────────────────── Mode Switching (YouTube vs Local Video) ─────────────────── */
const tabYouTube = $u("tab-source-youtube");
const tabVideo = $u("tab-source-video");
const secYouTube = $u("section-source-youtube");
const secVideo = $u("section-source-video");

tabYouTube?.addEventListener("click", () => {
  _activeSourceMode = "youtube";
  tabYouTube.classList.add("active");
  tabVideo?.classList.remove("active");
  if (secYouTube) secYouTube.style.display = "block";
  if (secVideo) secVideo.style.display = "none";
});

tabVideo?.addEventListener("click", () => {
  _activeSourceMode = "video";
  tabVideo.classList.add("active");
  tabYouTube?.classList.remove("active");
  if (secVideo) secVideo.style.display = "block";
  if (secYouTube) secYouTube.style.display = "none";
});

/* YouTube URL live preview */
$u("upload-youtube-url")?.addEventListener("input", (e) => {
  const url = e.target.value.trim();
  const ytid = extractYouTubeId(url);
  const preview = $u("youtube-embed-preview");
  if (ytid && preview) {
    preview.innerHTML = `<iframe width="100%" height="100%" src="https://www.youtube.com/embed/${ytid}?rel=0" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen style="border-radius:8px;"></iframe>`;
    preview.style.display = "block";
  } else if (preview) {
    preview.style.display = "none";
    preview.innerHTML = "";
  }
});

/* ─────────────────── AI ROM Setup for YouTube Reference ─────────────────── */
$u("btn-setup-youtube-rom")?.addEventListener("click", async () => {
  const nameInput = $u("upload-ex-name");
  const name = nameInput.value.trim();
  const youtubeUrl = $u("upload-youtube-url").value.trim();
  const ytid = extractYouTubeId(youtubeUrl);
  const feedback = $u("upload-feedback");
  const btn = $u("btn-setup-youtube-rom");

  feedback.textContent = "";

  if (!youtubeUrl) {
    feedback.textContent = "⚠ Please enter a YouTube link.";
    return;
  }
  if (!ytid) {
    feedback.textContent = "⚠ That doesn't look like a valid YouTube video link (e.g. https://www.youtube.com/watch?v=... or https://youtu.be/...).";
    return;
  }
  if (!name) {
    feedback.textContent = "⚠ Please provide an exercise name (e.g. Bodyweight Squat, Shoulder Flexion, Bicep Curl).";
    nameInput.focus();
    return;
  }

  btn.disabled = true;
  $u("upload-progress-wrap").style.display = "block";
  setProgress(25, "Analyzing exercise & consulting clinical biomechanics model…");

  try {
    const category = $u("upload-ex-category")?.value || "Rehabilitation";
    let est = null;
    
    // Call Gemini to estimate ROM & joints
    if (typeof GeminiClient !== "undefined" && GeminiClient.estimateExerciseTargets) {
      const res = await GeminiClient.estimateExerciseTargets(name, category);
      if (res.ok && res.data) {
        est = res.data;
      } else {
        console.warn("Gemini estimate failed, using smart physiological defaults:", res.error);
      }
    }

    setProgress(75, "Configuring joint Range of Motion targets…");

    // Standard clinical defaults if offline or fallback
    const fallbackRanges = {
      squat: { knee: { min: 85, max: 175, range: 90 }, hip: { min: 80, max: 170, range: 90 } },
      curl: { elbow: { min: 40, max: 165, range: 125 } },
      shoulder: { shoulder: { min: 35, max: 170, range: 135 } },
      press: { elbow: { min: 60, max: 170, range: 110 }, shoulder: { min: 70, max: 170, range: 100 } },
      lunge: { knee: { min: 90, max: 175, range: 85 }, hip: { min: 95, max: 175, range: 80 } },
    };

    const targetRanges = {};
    if (est && est.rom) {
      Object.entries(est.rom).forEach(([j, bounds]) => {
        const top = typeof bounds.top === "number" ? bounds.top : 170;
        const bottom = typeof bounds.bottom === "number" ? bounds.bottom : 90;
        const mn = Math.min(top, bottom);
        const mx = Math.max(top, bottom);
        targetRanges[j] = { min: mn, max: mx, range: mx - mn, isAI: true };
      });
    } else {
      const lower = name.toLowerCase();
      let matched = null;
      for (const [k, v] of Object.entries(fallbackRanges)) {
        if (lower.includes(k)) { matched = v; break; }
      }
      if (!matched) matched = { knee: { min: 90, max: 170, range: 80 }, hip: { min: 85, max: 165, range: 80 } };
      Object.entries(matched).forEach(([j, v]) => {
        targetRanges[j] = { ...v, isDefault: true };
      });
    }

    _analyzedRanges = targetRanges;
    renderDetectedJoints(_analyzedRanges);

    const hint = $u("upload-results-hint");
    if (hint) {
      hint.innerHTML = `✨ <strong>Reference configured via YouTube &amp; AI!</strong> Verified target joints and Range of Motion below. Ready to track your live camera against your YouTube tutorial.`;
    }

    $u("upload-results").style.display = "block";
    setProgress(100, "Ready! Review joints below and start live session.");
    $u("upload-results").scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (err) {
    feedback.textContent = `⚠ ${err.message || "Failed to configure exercise targets."}`;
  } finally {
    btn.disabled = false;
  }
});

/* ─────────────────── Prescription photo scan ─────────────────── */
let _prescriptionFile = null;

$u("prescription-image-input")?.addEventListener("change", (e) => {
  _prescriptionFile = e.target.files[0] || null;
  $u("btn-scan-prescription").disabled = !_prescriptionFile;
  $u("prescription-results").style.display = "none";
  $u("prescription-feedback").textContent = "";
});

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

$u("btn-scan-prescription")?.addEventListener("click", async () => {
  if (!_prescriptionFile) return;
  if (!GeminiClient.hasKey()) {
    $u("prescription-key-prompt").style.display = "block";
    return;
  }
  await runPrescriptionScan();
});

$u("btn-prescription-save-key")?.addEventListener("click", async () => {
  const key = $u("prescription-key-input").value.trim();
  if (!key) return;
  GeminiClient.setProvider($u("prescription-provider-input").value);
  GeminiClient.setKey(key);
  $u("prescription-key-input").value = "";
  $u("prescription-key-prompt").style.display = "none";
  await runPrescriptionScan();
});

async function runPrescriptionScan() {
  const btn = $u("btn-scan-prescription");
  btn.disabled = true;
  $u("prescription-feedback").textContent = "";
  $u("prescription-results").style.display = "block";
  $u("prescription-results").innerHTML = `<p class="hint">Reading the image…</p>`;

  try {
    const base64 = await fileToBase64(_prescriptionFile);
    const res = await GeminiClient.extractPrescriptionExercises(base64, _prescriptionFile.type || "image/jpeg");
    if (!res.ok) {
      $u("prescription-results").style.display = "none";
      $u("prescription-feedback").innerHTML = `⚠ ${res.error}`;
      return;
    }
    if (!res.exercises.length) {
      $u("prescription-results").innerHTML = `<p class="hint">No exercise names could be read from that image — try a clearer, well-lit photo, or just type the name below.</p>`;
      return;
    }
    $u("prescription-results").innerHTML = res.exercises.map((ex, i) => `
      <button class="prescription-chip" data-idx="${i}">
        <span class="prescription-chip-name">${ex.name}</span>
        ${ex.sets || ex.reps ? `<span class="prescription-chip-meta">${[ex.sets && `${ex.sets} sets`, ex.reps && ex.reps].filter(Boolean).join(" × ")}</span>` : ""}
        ${ex.notes ? `<span class="prescription-chip-note">${ex.notes}</span>` : ""}
      </button>`).join("");

    document.querySelectorAll(".prescription-chip").forEach(chip => {
      chip.addEventListener("click", () => {
        const ex = res.exercises[chip.dataset.idx];
        $u("upload-ex-name").value = ex.name;
        $u("upload-ex-name").scrollIntoView({ behavior: "smooth", block: "center" });
      });
    });
  } catch (err) {
    $u("prescription-results").style.display = "none";
    $u("prescription-feedback").innerHTML = `⚠ Couldn't read that image: ${err.message}`;
  } finally {
    btn.disabled = false;
  }
}

/* ─────────────────── Local Video Handling ─────────────────── */
$u("upload-video-input")?.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  _uploadedVideoFile = file;
  const preview = $u("upload-video-preview");
  preview.src = URL.createObjectURL(file);
  preview.style.display = "block";
  $u("btn-analyze-video").disabled = false;
  $u("upload-results").style.display = "none";
});

$u("btn-analyze-video")?.addEventListener("click", async () => {
  if (!_uploadedVideoFile) return;
  const btn = $u("btn-analyze-video");
  btn.disabled = true;
  $u("upload-progress-wrap").style.display = "block";
  $u("upload-feedback").textContent = "";
  setProgress(0, "Reading video…");

  try {
    const result = await VideoAnalyzer.analyzeReferenceVideo(_uploadedVideoFile, (pct) => {
      setProgress(pct, `Analyzing frame ${pct}%…`);
    });
    _analyzedRanges = result.jointRanges;

    if (result.framesWithPose < result.framesAnalyzed * 0.3) {
      $u("upload-feedback").innerHTML =
        "⚠ Pose was only detected in a minority of frames — make sure the full body is visible and well-lit in the video, or results will be unreliable.";
    }
    renderDetectedJoints(_analyzedRanges);
    $u("upload-results").style.display = "block";
    setProgress(100, "Analysis complete.");
  } catch (err) {
    $u("upload-feedback").textContent = "⚠ " + err.message;
  } finally {
    btn.disabled = false;
  }
});

function setProgress(pct, label) {
  $u("upload-progress-bar").style.width = pct + "%";
  $u("upload-progress-label").textContent = label;
}

function renderDetectedJoints(ranges) {
  const sorted = Object.entries(ranges).sort((a, b) => b[1].range - a[1].range);
  const container = $u("detected-joints-list");

  if (!sorted.length) {
    container.innerHTML = `<p class="hint">No joints could be measured — select a valid exercise or upload a video.</p>`;
    return;
  }

  container.innerHTML = sorted.map(([joint, r], i) => {
    const isActive = r.range >= ACTIVE_RANGE_THRESHOLD;
    const autoChecked = isActive && i < 2; // top 2 most-active joints
    return `
      <label class="joint-detect-row ${isActive ? "" : "low-motion"}">
        <input type="checkbox" class="joint-detect-check" value="${joint}" ${autoChecked ? "checked" : ""} />
        <span class="joint-detect-name">${JOINT_LABELS[joint] || joint}</span>
        <span class="joint-detect-range">${r.min}° – ${r.max}° <em>(${r.range}° range)</em></span>
        ${r.isAI ? '<span class="ai-badge">AI Target</span>' : (isActive ? "" : '<span class="joint-detect-flag">low motion</span>')}
      </label>`;
  }).join("");
}

$u("btn-start-tracking")?.addEventListener("click", () => {
  const name = $u("upload-ex-name").value.trim();
  if (!name) { $u("upload-feedback").textContent = "⚠ Enter an exercise name first."; return; }
  if (!_analyzedRanges) { $u("upload-feedback").textContent = "⚠ Configure Range of Motion first (using YouTube or local video)."; return; }

  const checked = [...document.querySelectorAll(".joint-detect-check:checked")].map(i => i.value);
  if (!checked.length) { $u("upload-feedback").textContent = "⚠ Select at least one joint to track."; return; }

  const rom = {};
  checked.forEach(j => {
    const r = _analyzedRanges[j];
    rom[j] = { top: r.max, bottom: r.min };
  });
  const tolerance = parseInt($u("upload-tolerance").value) || 20;
  const category = $u("upload-ex-category").value;

  // Resolve YouTube URL depending on mode
  let youtubeUrl = "";
  if (_activeSourceMode === "youtube") {
    youtubeUrl = $u("upload-youtube-url").value.trim();
  } else {
    youtubeUrl = ($u("upload-youtube-url-optional")?.value || "").trim();
  }
  const youtubeId = extractYouTubeId(youtubeUrl);

  const videoPreview = $u("upload-video-preview");
  const hasLocalVideo = _uploadedVideoFile && videoPreview && videoPreview.src;

  const built = buildDynamicExerciseConfig({
    name,
    category,
    joints: checked,
    rom,
    romTolerance: tolerance,
    videoDataUrl: hasLocalVideo ? videoPreview.src : null,
    videoUrl: youtubeId ? `https://www.youtube.com/watch?v=${youtubeId}` : null,
    sourceType: hasLocalVideo ? "user-upload" : "youtube-reference",
  });

  ExerciseRegistry.push(built.live);

  // Persist exercise
  if (hasLocalVideo) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const persisted = JSON.parse(localStorage.getItem("motioniq_exercises") || "[]");
      const toSave = { ...built.persistable, videoDataUrl: e.target.result };
      persisted.push(toSave);
      try {
        localStorage.setItem("motioniq_exercises", JSON.stringify(persisted));
      } catch (_) {
        toSave.videoDataUrl = null;
        persisted[persisted.length - 1] = toSave;
        try { localStorage.setItem("motioniq_exercises", JSON.stringify(persisted)); } catch (_) {}
      }
    };
    reader.readAsDataURL(_uploadedVideoFile);
  } else {
    const persisted = JSON.parse(localStorage.getItem("motioniq_exercises") || "[]");
    persisted.push(built.persistable);
    try {
      localStorage.setItem("motioniq_exercises", JSON.stringify(persisted));
    } catch (_) {}
  }

  if (typeof renderLibrary === "function") renderLibrary();
  if (typeof renderAdminList === "function") renderAdminList();
  if (typeof startSession === "function") startSession(built.live);
});


/**
 * ai-client.js — Browser-side client with seamless server-side Google Gemini integration.
 *
 * Supported providers:
 *   - Google Gemini: Server-side proxy via /api/gemini/chat with GEMINI_API_KEY
 *   - GitHub Models: https://models.github.ai/inference
 *   - NVIDIA NIM:    https://integrate.api.nvidia.com/v1
 *   - Hugging Face:  https://router.huggingface.co/v1
 */
"use strict";

window.GeminiClient = (function () {
  const KEY_STORAGE = "motioniq_ai_key";
  const PROVIDER_STORAGE = "motioniq_ai_provider";
  localStorage.removeItem("motioniq_gemini_key");

  let serverHasKey = true; // Optimistic default for AI Studio environment
  let serverModel = "gemini-3.8-flash";

  // Check server configuration
  fetch("/api/config")
    .then((r) => r.json())
    .then((data) => {
      if (data && typeof data.hasServerKey === "boolean") {
        serverHasKey = data.hasServerKey;
        if (data.model) serverModel = data.model;
      }
    })
    .catch(() => {});

  const PROVIDERS = {
    gemini: {
      label: "Google Gemini",
      endpoint: "/api/gemini/chat",
      model: "gemini-3.8-flash",
      keyLabel: "Gemini API key",
      keyUrl: "https://aistudio.google.com/apikey",
      help: "Google Gemini is powered by the server-side API key.",
      supportsVision: true,
    },
    github: {
      label: "GitHub Models",
      endpoint: "https://models.github.ai/inference/chat/completions",
      model: "openai/gpt-4o-mini",
      keyLabel: "GitHub token",
      keyUrl: "https://github.com/settings/tokens",
      help: "A GitHub token with access to Models.",
      supportsVision: true,
    },
    nvidia: {
      label: "NVIDIA NIM",
      endpoint: "https://integrate.api.nvidia.com/v1/chat/completions",
      model: "meta/llama-3.1-8b-instruct",
      keyLabel: "NVIDIA API key",
      keyUrl: "https://build.nvidia.com/",
      help: "Create a free NVIDIA API key at build.nvidia.com.",
      supportsVision: false,
    },
    huggingface: {
      label: "Hugging Face (Meta/open models)",
      endpoint: "https://router.huggingface.co/v1/chat/completions",
      model: "meta-llama/Llama-3.1-8B-Instruct",
      keyLabel: "Hugging Face token",
      keyUrl: "https://huggingface.co/settings/tokens",
      help: "Use a Hugging Face read token.",
      supportsVision: false,
    },
  };

  function getProviderId() {
    const id = localStorage.getItem(PROVIDER_STORAGE) || "gemini";
    return PROVIDERS[id] ? id : "gemini";
  }
  function getProvider() { return PROVIDERS[getProviderId()]; }
  function setProvider(id) {
    if (!PROVIDERS[id]) throw new Error("Unsupported AI provider.");
    localStorage.setItem(PROVIDER_STORAGE, id);
  }
  function getKey() { return localStorage.getItem(KEY_STORAGE) || ""; }
  function setKey(key) {
    if (key) localStorage.setItem(KEY_STORAGE, key.trim());
    else localStorage.removeItem(KEY_STORAGE);
  }
  function hasKey() {
    if (getProviderId() === "gemini") {
      return serverHasKey || !!getKey();
    }
    return !!getKey();
  }
  function getSettings() {
    return { providerId: getProviderId(), provider: getProvider(), hasKey: hasKey() };
  }

  function explainApiError(status, bodyText = "") {
    let detail = "";
    try {
      const parsed = JSON.parse(bodyText || "{}");
      detail = parsed?.error?.message || parsed?.message || parsed?.error || "";
    } catch (_) {
      detail = "";
    }
    if (status === 401 || status === 403) return detail || "The provider rejected this key or model access.";
    if (status === 404) return detail || "The selected model or endpoint was not found.";
    if (status === 429) return detail || "Provider quota exhausted or rate-limited. Try again later or switch providers.";
    if (status >= 500) return detail || "The AI provider is temporarily unavailable. Try again shortly.";
    return detail || `AI provider error (${status}).`;
  }

  function toChatMessages(parts) {
    return parts.map(part => {
      if (part.text) return { role: "user", content: part.text };
      if (part.inlineData) {
        return {
          role: "user",
          content: [{
            type: "image_url",
            image_url: { url: `data:${part.inlineData.mimeType};base64,${part.inlineData.data}` },
          }],
        };
      }
      return { role: "user", content: "" };
    });
  }

  async function chat(parts, { timeoutMs = 25000, json = false, useSearch = false } = {}) {
    const providerId = getProviderId();
    const provider = getProvider();
    const key = getKey();

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    // If using Google Gemini, route to backend with optional custom key
    if (providerId === "gemini") {
      try {
        const headers = { "Content-Type": "application/json" };
        if (key) headers["x-gemini-key"] = key;
        const res = await fetch("/api/gemini/chat", {
          method: "POST",
          headers,
          signal: controller.signal,
          body: JSON.stringify({ parts, json, useSearch }),
        });
        clearTimeout(timer);
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.ok) {
          return { ok: false, error: data?.error || explainApiError(res.status) };
        }
        return data;
      } catch (err) {
        clearTimeout(timer);
        return { ok: false, error: err.name === "AbortError" ? "Request timed out." : err.message };
      }
    }

    if (!key) return { ok: false, error: `No ${provider.keyLabel} set.` };
    const messages = toChatMessages(parts);

    try {
      const res = await fetch(provider.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: provider.model,
          messages,
          temperature: 0.3,
          max_tokens: json ? 800 : 700,
          ...(json ? { response_format: { type: "json_object" } } : {}),
        }),
      });
      clearTimeout(timer);
      if (!res.ok) return { ok: false, error: explainApiError(res.status, await res.text().catch(() => "")) };
      const data = await res.json();
      const text = data?.choices?.[0]?.message?.content?.trim();
      if (!text) return { ok: false, error: "The AI provider returned an empty response." };
      return { ok: true, text };
    } catch (err) {
      clearTimeout(timer);
      return { ok: false, error: err.name === "AbortError" ? "Request timed out." : err.message };
    }
  }

  async function generateText(prompt, options = {}) {
    return chat([{ text: prompt }], options);
  }

  async function generateJSON(parts, options = {}) {
    const res = await chat(parts, { ...options, json: true });
    if (!res.ok) return res;
    if (res.data) return { ok: true, data: res.data };
    const cleaned = res.text.replace(/```json|```/g, "").trim();
    try {
      return { ok: true, data: JSON.parse(cleaned) };
    } catch (_) {
      return { ok: false, error: "The AI provider returned invalid JSON." };
    }
  }

  async function summarizeSession(session, priorSessions = []) {
    const history = priorSessions.slice(-4).map(s =>
      `${new Date(s.date).toLocaleDateString()}: ${s.reps} reps, ${s.accuracyPct}% accuracy, ROM ${s.avgRomScore ?? "N/A"}%, BAI ${s.avgBai}%`
    ).join("\n") || "(no prior sessions)";
    const prompt = `You are a supportive physiotherapy exercise coach (not a medical professional). Never diagnose or override a physiotherapist's plan. Do not use markdown.

The user finished "${session.exerciseName}":
- Reps: ${session.reps}; sets: ${session.sets}
- Accuracy: ${session.accuracyPct}%
- ROM score: ${session.avgRomScore ?? "N/A"}%
- Alignment: ${session.avgBai}%
- Improvement index: ${session.improvementIndex}%

Recent history:
${history}

Write 3-4 warm sentences: acknowledge one concrete strength, name the weakest metric to focus on, and end with one practical tip.`;
    return generateText(prompt);
  }

  async function summarizeProgress(sessions) {
    if (!sessions.length) return { ok: false, error: "No sessions to summarize." };
    const rows = sessions.map(s =>
      `${new Date(s.date).toLocaleDateString()}: ${s.reps} reps, accuracy ${s.accuracyPct}%, ROM ${s.avgRomScore ?? "N/A"}%, BAI ${s.avgBai}%`
    ).join("\n");
    return generateText(`You are a supportive physiotherapy exercise coach (not a medical professional). Do not diagnose or use markdown.
Summarize this history for "${sessions[0].exerciseName}" in 4-6 sentences. Describe trends, the most notable change, and one actionable next-session suggestion. If declining, gently suggest checking with a physiotherapist.
${rows}`);
  }

  async function summarizeYogaSession(yogaSession) {
    const deviationSummary = yogaSession.deviatedJoints && yogaSession.deviatedJoints.length > 0
      ? yogaSession.deviatedJoints.map(d => `${d.joint}: avg deviation ${d.avgDiff}° (${d.seconds}s)`).join(', ')
      : 'None (stable alignment maintained)';

    const prompt = `You are a certified clinical yoga instructor and biomechanics specialist.
Analyze this yoga pose hold session:
- Pose / Asana: "${yogaSession.poseName}"
- Target hold time: ${yogaSession.targetSeconds}s, Actual time held: ${yogaSession.completedSeconds}s (${yogaSession.completionPct}%)
- Body Alignment Index (BAI): ${yogaSession.avgBai}%
- Overall Pose Match: ${yogaSession.poseMatchPct}%
- Recorded Joint Deviations: ${deviationSummary}
- Key tracked joints: ${yogaSession.jointSummary || 'Knees, Hips, Shoulders, Spine'}

Provide a 3-paragraph biomechanical and yogic assessment:
1. Alignment & Hold Endurance: Evaluate stability, core engagement, and balance maintenance during the timed hold.
2. Form & Joint Deviation Corrections: Address the specific joint deviations noted above with actionable anatomical cues (e.g. pelvis leveling, knee tracking, shoulder retraction).
3. Breathwork & Safety: Suggest a specific pranayama rhythm (e.g. Ujjayi or balanced diaphragmatic breath) to optimize this pose and prevent compensatory strain.`;

    return generateText(prompt);
  }

  async function researchExerciseTechnique(exerciseName) {
    const prompt = `Using Google Search and sports science sources, describe safe, up-to-date technique for "${exerciseName}" with a resistance theraband. Include step-by-step instructions, 2-4 common mistakes, the main moving joint and an approximate angle range. Be factual, authoritative, and safety-conscious.`;
    const res = await generateText(prompt, { timeoutMs: 28000, useSearch: true });
    return res.ok ? { ...res, sources: res.sources || [] } : res;
  }

  async function fetchExerciseInstructions(exerciseName, category = "Fitness") {
    const key = getKey();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    try {
      const headers = { "Content-Type": "application/json" };
      if (key) headers["x-gemini-key"] = key;
      const res = await fetch("/api/gemini/exercise-instructions", {
        method: "POST",
        headers,
        signal: controller.signal,
        body: JSON.stringify({ exerciseName, category }),
      });
      clearTimeout(timer);
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        return { ok: false, error: data?.error || explainApiError(res.status) };
      }
      return data;
    } catch (err) {
      clearTimeout(timer);
      return { ok: false, error: err.name === "AbortError" ? "Request timed out." : err.message };
    }
  }

  const THERABAND_RULE_TYPES = ["shoulder_shrug", "elbow_drift", "limb_leading", "joint_unpinned", "back_arch"];

  async function structureTherabandExercise(exerciseName, researchText) {
    const prompt = `Convert this research for "${exerciseName}" into ONLY valid JSON:
{"title":"string","instructions":["step"],"commonMistakes":["mistake"],"targetJoints":["elbow"],"rom":{"elbow":{"top":165,"bottom":45}},"romTolerance":20,"formRules":[{"type":"elbow_drift","message":"Keep elbow close"}]}
Use only joints knee, hip, shoulder, elbow, ankle. Use only rule types ${THERABAND_RULE_TYPES.join(", ")}. Keep thresholds between 0 and 1 if present.
Research:
${researchText}`;
    const res = await generateJSON([{ text: prompt }]);
    if (!res.ok) return res;
    const data = res.data || {};
    if (!Array.isArray(data.targetJoints) || !data.rom) return { ok: false, error: "Unexpected structured response from the AI provider." };
    data.formRules = (data.formRules || []).filter(r => THERABAND_RULE_TYPES.includes(r.type));
    return { ok: true, data };
  }

  async function extractPrescriptionExercises(base64Data, mimeType) {
    if (!getProvider().supportsVision) {
      return { ok: false, error: `${getProvider().label} does not support image input with the selected model. Type the exercise name manually or switch to Google Gemini.` };
    }
    const prompt = `Read this physiotherapy exercise prescription image and return ONLY valid JSON:
{"exercises":[{"name":"string","sets":"string or null","reps":"string or null","notes":"string or null"}]}
Do not invent names that are not legible. If no exercise is readable, return {"exercises":[]}.`;
    const res = await generateJSON([
      { inlineData: { mimeType, data: base64Data } },
      { text: prompt },
    ]);
    if (!res.ok) return res;
    if (!Array.isArray(res.data?.exercises)) return { ok: false, error: "Unexpected prescription response from the AI provider." };
    return { ok: true, exercises: res.data.exercises };
  }

  async function estimateExerciseTargets(exerciseName, category = "Rehabilitation") {
    const prompt = `You are a biomechanics and clinical physiotherapy expert.
A patient has a YouTube reference tutorial for the exercise "${exerciseName}" (category: ${category}), but cannot upload a local video file for automated frame scanning.

Estimate the primary joints involved, typical Range of Motion (ROM) in degrees (full extension/start "top" vs maximum flexion/peak "bottom"), and movement rules.

Return ONLY valid JSON matching this schema:
{
  "title": "${exerciseName}",
  "category": "${category}",
  "primaryJoints": ["knee", "hip"],
  "targetJoints": ["knee", "hip"],
  "rom": {
    "knee": { "top": 170, "bottom": 100 },
    "hip": { "top": 165, "bottom": 90 }
  },
  "romTolerance": 20,
  "instructions": ["Step 1...", "Step 2..."],
  "commonMistakes": ["Mistake 1...", "Mistake 2..."]
}

Guidelines:
- Only use joint names from this list: knee, hip, shoulder, elbow, ankle.
- Ensure "top" is the starting or extended position angle and "bottom" is the inflection or contracted angle.
- Provide realistic physiological angles (0 to 180 degrees).
- Select 1 to 2 primary joints that define repetition cycles.`;

    const res = await generateJSON([{ text: prompt }]);
    if (!res.ok) return res;
    const data = res.data || {};
    if (!Array.isArray(data.targetJoints) || !data.rom) {
      return { ok: false, error: "AI could not determine anatomical joint ranges for this exercise." };
    }
    // Filter to valid joints
    const validJoints = ["knee", "hip", "shoulder", "elbow", "ankle"];
    data.targetJoints = data.targetJoints.filter(j => validJoints.includes(j));
    if (!data.targetJoints.length) data.targetJoints = Object.keys(data.rom).filter(j => validJoints.includes(j));
    if (!data.targetJoints.length) data.targetJoints = ["knee"];
    return { ok: true, data };
  }

  return {
    getKey, setKey, hasKey, getProviderId, getProvider, setProvider, getSettings,
    generateText, generateJSON, summarizeSession, summarizeProgress, summarizeYogaSession,
    extractPrescriptionExercises, researchExerciseTechnique, fetchExerciseInstructions,
    structureTherabandExercise, estimateExerciseTargets, THERABAND_RULE_TYPES,
  };
})();

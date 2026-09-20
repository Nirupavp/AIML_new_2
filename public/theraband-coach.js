/**
 * theraband-coach.js — "Theraband Coach" feature.
 *
 * Flow: type any exercise name -> the selected AI provider estimates correct
 * technique -> a second provider call turns
 * that research into strict, whitelisted tracking data (joints/ROM/rule
 * types — see gemini.js's structureTherabandExercise and
 * theraband-rules.js's fixed CHECKERS) -> user reviews it -> live session
 * tracks reps/ROM (existing engine) + theraband-specific form rules +
 * band-color/resistance detection (theraband-rules.js) -> saved to the
 * same dashboard as everything else.
 */
"use strict";

const $t = (id) => document.getElementById(id);
let _theraLastResult = null; // { exerciseName, side, title, instructions, commonMistakes, targetJoints, rom, romTolerance, formRules, sources }

function theraShowKeyPrompt(show) {
  $t("theraband-key-prompt").style.display = show ? "block" : "none";
}

$t("btn-theraband-research")?.addEventListener("click", async () => {
  if (!GeminiClient.hasKey()) { theraShowKeyPrompt(true); return; }
  await runTherabandResearch();
});

$t("btn-theraband-save-key")?.addEventListener("click", async () => {
  const key = $t("theraband-key-input").value.trim();
  if (!key) return;
  GeminiClient.setProvider($t("theraband-provider-input").value);
  GeminiClient.setKey(key);
  $t("theraband-key-input").value = "";
  theraShowKeyPrompt(false);
  await runTherabandResearch();
});

async function runTherabandResearch() {
  const name = $t("theraband-ex-name").value.trim();
  const side = $t("theraband-side").value;
  if (!name) { $t("theraband-feedback").innerHTML = "⚠ Enter an exercise name first."; return; }

  const btn = $t("btn-theraband-research");
  btn.disabled = true;
  $t("theraband-feedback").textContent = "";
  const results = $t("theraband-results");
  results.style.display = "block";
  results.innerHTML = `<p class="hint">Searching the web for correct technique…</p>`;

  try {
    const research = await GeminiClient.researchExerciseTechnique(name);
    if (!research.ok) {
      results.style.display = "none";
      $t("theraband-feedback").innerHTML = `⚠ ${research.error}`;
      return;
    }

    results.innerHTML = `<p class="hint">Structuring tracking targets…</p>`;
    const structured = await GeminiClient.structureTherabandExercise(name, research.text);
    if (!structured.ok) {
      results.style.display = "none";
      $t("theraband-feedback").innerHTML = `⚠ ${structured.error}`;
      return;
    }

    _theraLastResult = { exerciseName: name, side, sources: research.sources || [], ...structured.data };
    renderTherabandResult(_theraLastResult);
  } catch (err) {
    results.style.display = "none";
    $t("theraband-feedback").innerHTML = `⚠ Something went wrong: ${err.message}`;
  } finally {
    btn.disabled = false;
  }
}

function renderTherabandResult(r) {
  const romList = Object.entries(r.rom || {})
    .map(([j, v]) => `${j}: ${v.bottom}°–${v.top}°`).join(" · ");
  const ruleList = (r.formRules || []).map(rule => rule.message || rule.type).join(", ") || "no specific rules flagged for this exercise";
  const sourcesHtml = (r.sources || []).length
    ? `<div class="thera-sources"><strong>Sources:</strong> ${r.sources.map(s => `<a href="${s.uri}" target="_blank" rel="noopener">${s.title || "source"}</a>`).join(" · ")}</div>`
    : "";

  $t("theraband-results").innerHTML = `
    <h2>${r.title || r.exerciseName}</h2>
    <div class="thera-block">
      <h4>Instructions</h4>
      <ol class="thera-list">${(r.instructions || []).map(s => `<li>${s}</li>`).join("")}</ol>
    </div>
    ${r.commonMistakes?.length ? `
    <div class="thera-block">
      <h4>Common Mistakes</h4>
      <ul class="thera-list">${r.commonMistakes.map(s => `<li>${s}</li>`).join("")}</ul>
    </div>` : ""}
    <div class="thera-block">
      <h4>Tracking Target</h4>
      <p class="hint">Range of motion: ${romList || "not determined"}</p>
      <p class="hint">We'll watch for: ${ruleList}</p>
    </div>
    ${sourcesHtml}
    <div class="cond-warning" style="margin-top:14px;">⚠ AI-estimated targets from a web search, not a substitute for your physiotherapist's actual guidance. Review before starting, and stop if anything increases pain.</div>
    <button class="btn-primary" id="btn-theraband-start" style="margin-top:14px;">▶ Looks Good — Start Tracking</button>
  `;

  $t("btn-theraband-start").addEventListener("click", startTherabandSession);
}

function startTherabandSession() {
  const r = _theraLastResult;
  if (!r) return;

  const built = TherabandRules.buildTherabandExerciseConfig({
    name: r.title || r.exerciseName,
    targetJoints: r.targetJoints,
    rom: r.rom,
    romTolerance: r.romTolerance,
    side: r.side,
    formRules: r.formRules,
    instructions: r.instructions,
    commonMistakes: r.commonMistakes,
    sources: r.sources,
  });

  ExerciseRegistry.push(built.live);

  const persisted = JSON.parse(localStorage.getItem("motioniq_exercises") || "[]");
  persisted.push(built.persistable);
  try {
    localStorage.setItem("motioniq_exercises", JSON.stringify(persisted));
  } catch (_) { /* storage full — exercise still works this session, just won't persist */ }

  if (typeof renderLibrary === "function") renderLibrary();
  if (typeof renderAdminList === "function") renderAdminList();
  if (typeof startSession === "function") startSession(built.live);
}

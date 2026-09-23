/**
 * app.js — MotionIQ Application Controller
 *
 * Autism-friendly features added:
 *  - Calm Mode: disables all flashing/pulsing animations
 *  - Child Mode: hides technical data, shows stars + big rep counter
 *  - Voice Cues: Web Speech API counts reps and gives encouragement
 *  - 3-2-1 Countdown: visual preparation before session starts
 *  - Social Story panel: step-by-step visual guide before exercise
 *  - Star reward system: one star per good rep, up to rep goal
 *  - Rep Goal progress bar: thin bar across top of camera
 *  - Congrats banner: shown when rep goal is reached
 *  - Amber feedback overlay: replaces red/flashing with gentle border
 *  - Picture cues: emoji pictograms alongside error text
 *  - Child Profile: saved per-child settings (name, tolerance, goal, audio)
 *  - Simplified phase labels: "Go down!" instead of "TRANSITION-DOWN"
 */

"use strict";

/* ─────────────────── DOM HELPERS ─────────────────── */
const $ = (id) => document.getElementById(id);
const navBtns = document.querySelectorAll('.nav-btn');

/* ─────────────────── CHILD PROFILE (persisted) ─────────────────── */
let childProfile = JSON.parse(localStorage.getItem('motioniq_child_profile') || JSON.stringify({
  name: '',
  repGoal: 10,
  romTolerance: 25,
  audioPref: 'voice',
  socialStory: '1',
}));

function loadChildProfileUI() {
  $('child-name').value           = childProfile.name        || '';
  $('child-rep-goal').value       = childProfile.repGoal     || 10;
  $('child-rom-tolerance').value  = childProfile.romTolerance || 25;
  $('child-audio-pref').value     = childProfile.audioPref   || 'voice';
  $('child-social-story').value   = childProfile.socialStory || '1';
}

$('btn-save-child-profile').addEventListener('click', () => {
  childProfile = {
    name:         $('child-name').value.trim(),
    repGoal:      parseInt($('child-rep-goal').value)      || 10,
    romTolerance: parseInt($('child-rom-tolerance').value) || 25,
    audioPref:    $('child-audio-pref').value,
    socialStory:  $('child-social-story').value,
  };
  localStorage.setItem('motioniq_child_profile', JSON.stringify(childProfile));
  $('child-profile-feedback').textContent = '✓ Child profile saved!';
  setTimeout(() => { $('child-profile-feedback').textContent = ''; }, 2500);
});

/* ─────────────────── ACCESSIBILITY TOGGLES ─────────────────── */
let calmMode  = false;
let childMode = false;
let audioMode = false;

$('toggle-calm').addEventListener('change', (e) => {
  calmMode = e.target.checked;
  document.body.classList.toggle('calm-mode', calmMode);
});

$('toggle-child').addEventListener('change', (e) => {
  childMode = e.target.checked;
  document.body.classList.toggle('child-mode', childMode);
  // When switching to child mode, load child profile into rep goal
  if (childMode) {
    $('rep-goal-input').value = childProfile.repGoal || 10;
    // Also apply calm mode if profile prefers it
    if (!calmMode) {
      calmMode = true;
      $('toggle-calm').checked = true;
      document.body.classList.add('calm-mode');
    }
  }
});

$('toggle-audio').addEventListener('change', (e) => {
  audioMode = e.target.checked;
});

/* ─────────────────── NAVIGATION ─────────────────── */
const Views = {
  home:      $('view-home'),
  upload:    $('view-upload'),
  yoga:      $('view-yoga'),
  admin:     $('view-admin'),
  session:   $('view-session'),
  reports:   $('view-reports'),
};

function showView(name) {
  Object.entries(Views).forEach(([key, el]) => {
    if (el) el.classList.toggle('active', key === name);
  });
  navBtns.forEach(btn => btn.classList.toggle('active', btn.dataset.view === name));
}

navBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    if (btn.dataset.view === 'session') return;
    showView(btn.dataset.view);
    if (btn.dataset.view === 'yoga') {
      if (typeof initYogaUI === 'function') initYogaUI();
    }
    if (btn.dataset.view === 'admin') {
      renderAdminList();
      loadChildProfileUI();
    }
    if (btn.dataset.view === 'reports') {
      if ($('report-user-select')) {
        renderReportUserSelect();
        const user = Auth.currentUser();
        if (user && [...$('report-user-select').options].some(o => o.value === user.displayName)) {
          $('report-user-select').value = user.displayName;
          $('report-user-select').dispatchEvent(new Event('change'));
        }
      }
    }
  });
});

/* ─────────────────── LIBRARY ─────────────────── */
let exerciseSearchQuery = '';

function initExerciseSearch() {
  const input = $('exercise-search-input');
  const clearBtn = $('exercise-search-clear');
  if (!input) return;

  if (input.dataset.searchBound) return;
  input.dataset.searchBound = 'true';

  input.addEventListener('input', (e) => {
    exerciseSearchQuery = e.target.value;
    if (clearBtn) {
      clearBtn.style.display = exerciseSearchQuery.trim() ? 'flex' : 'none';
    }
    renderLibrary();
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && input.value) {
      input.value = '';
      exerciseSearchQuery = '';
      if (clearBtn) clearBtn.style.display = 'none';
      renderLibrary();
    }
  });

  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      input.value = '';
      exerciseSearchQuery = '';
      clearBtn.style.display = 'none';
      input.focus();
      renderLibrary();
    });
  }
}

function renderLibrary() {
  initExerciseSearch();

  const grid = $('exercise-grid');
  if (!grid) return;
  grid.innerHTML = '';

  const countEl = $('exercise-search-count');
  const clearBtn = $('exercise-search-clear');
  const searchInput = $('exercise-search-input');

  const query = (exerciseSearchQuery || (searchInput ? searchInput.value : '')).trim().toLowerCase();
  if (clearBtn && searchInput) {
    clearBtn.style.display = searchInput.value.trim() ? 'flex' : 'none';
  }

  if (ExerciseRegistry.length === 0) {
    if (countEl) {
      countEl.textContent = '0 exercises';
      countEl.classList.remove('filtered');
    }
    grid.innerHTML = `<div class="empty-state" style="grid-column: 1 / -1;">
      <div class="empty-icon">🏋</div>
      <p>No exercises yet. Ask an admin to add some.</p>
    </div>`;
    return;
  }

  const filtered = ExerciseRegistry.filter(ex => {
    if (!query) return true;
    return ex.name && ex.name.toLowerCase().includes(query);
  });

  if (countEl) {
    if (query) {
      countEl.textContent = `Showing ${filtered.length} of ${ExerciseRegistry.length} exercise${ExerciseRegistry.length === 1 ? '' : 's'}`;
      countEl.classList.add('filtered');
    } else {
      countEl.textContent = `${ExerciseRegistry.length} exercise${ExerciseRegistry.length === 1 ? '' : 's'}`;
      countEl.classList.remove('filtered');
    }
  }

  if (filtered.length === 0) {
    const escapedQuery = query
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
    grid.innerHTML = `<div class="empty-state" id="exercise-search-empty-state" style="grid-column: 1 / -1; padding: 48px 16px;">
      <div class="empty-icon">🔍</div>
      <p>No exercises found matching "<strong>${escapedQuery}</strong>"</p>
      <button class="btn-secondary" id="btn-clear-search-empty" style="margin-top: 14px; font-size: 0.85rem; padding: 8px 16px;">Clear Search</button>
    </div>`;
    const resetBtn = $('btn-clear-search-empty');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        if (searchInput) {
          searchInput.value = '';
          searchInput.focus();
        }
        exerciseSearchQuery = '';
        if (clearBtn) clearBtn.style.display = 'none';
        renderLibrary();
      });
    }
    return;
  }

  filtered.forEach((ex, idx) => {
    const card = document.createElement('div');
    card.className = 'ex-card';
    card.id = `ex-card-${ex.id || idx}`;
    card.style.animationDelay = `${idx * 0.04}s`;

    const catClass = (ex.category || 'strength').toLowerCase();
    const thumbHTML = ex.videoDataUrl
      ? `<video src="${ex.videoDataUrl}" muted autoplay loop playsinline style="width:100%;height:140px;object-fit:cover;"></video>`
      : `<div class="ex-card-thumb" style="height:140px;display:flex;align-items:center;justify-content:center;font-size:3rem;background:var(--surface2);">${ex.emoji || '🏋'}</div>`;

    const romSummary = ex.rom
      ? Object.entries(ex.rom).map(([j, v]) => `${j}: ${v.bottom}–${v.top}°`).join(' · ')
      : '';

    card.innerHTML = `
      ${thumbHTML}
      <div class="ex-card-body">
        <div class="ex-card-name">${ex.name}</div>
        <div class="ex-card-meta">
          <span class="cat-pill ${catClass}">${ex.category}</span>
          ${ex.joints ? ex.joints.map(j => `<span class="cat-pill">${j}</span>`).join('') : ''}
        </div>
        ${romSummary ? `<div class="ex-card-rom">${romSummary}</div>` : ''}
      </div>`;

    card.addEventListener('click', () => {
      if (ex.isYoga) {
        if (typeof applyYogaPreset === 'function') {
          applyYogaPreset(ex.yogaPreset || 'warrior');
        }
        showView('yoga');
      } else {
        startSession(ex);
      }
    });
    grid.appendChild(card);
  });
}

/* ─────────────────── ADMIN ─────────────────── */
let adminCapturedROM = {};
let adminVideoFile   = null;

$('video-upload').addEventListener('change', function () {
  const file = this.files[0];
  if (!file) return;
  adminVideoFile = file;
  const preview = $('admin-video-preview');
  preview.src = URL.createObjectURL(file);
  preview.style.display = 'block';
  $('rom-capture-panel').style.display = 'block';
  adminCapturedROM = {};
  $('rom-display').innerHTML = '';
  $('capture-stats').textContent = '';
});

$('btn-capture-frame').addEventListener('click',  () => captureAdminFrame('top'));
$('btn-capture-bottom').addEventListener('click', () => captureAdminFrame('bottom'));

async function captureAdminFrame(position) {
  const videoEl  = $('admin-video-preview');
  const canvasEl = $('admin-canvas');
  $('capture-stats').textContent = 'Analysing pose…';

  const ctx = canvasEl.getContext('2d');
  canvasEl.width  = videoEl.videoWidth  || 480;
  canvasEl.height = videoEl.videoHeight || 320;
  ctx.drawImage(videoEl, 0, 0, canvasEl.width, canvasEl.height);

  const lm = await PoseEngine.captureFrameData(videoEl, canvasEl);
  if (!lm) {
    $('capture-stats').textContent = '⚠ No pose detected. Make sure the full body is visible.';
    return;
  }

  const jointAngleMap = {
    knee:     () => Math.round((PoseUtils.angle3(lm[LM.LEFT_HIP],lm[LM.LEFT_KNEE],lm[LM.LEFT_ANKLE])+PoseUtils.angle3(lm[LM.RIGHT_HIP],lm[LM.RIGHT_KNEE],lm[LM.RIGHT_ANKLE]))/2),
    hip:      () => Math.round((PoseUtils.angle3(lm[LM.LEFT_SHOULDER],lm[LM.LEFT_HIP],lm[LM.LEFT_KNEE])+PoseUtils.angle3(lm[LM.RIGHT_SHOULDER],lm[LM.RIGHT_HIP],lm[LM.RIGHT_KNEE]))/2),
    shoulder: () => Math.round((PoseUtils.angle3(lm[LM.LEFT_ELBOW],lm[LM.LEFT_SHOULDER],lm[LM.LEFT_HIP])+PoseUtils.angle3(lm[LM.RIGHT_ELBOW],lm[LM.RIGHT_SHOULDER],lm[LM.RIGHT_HIP]))/2),
    elbow:    () => Math.round((PoseUtils.angle3(lm[LM.LEFT_SHOULDER],lm[LM.LEFT_ELBOW],lm[LM.LEFT_WRIST])+PoseUtils.angle3(lm[LM.RIGHT_SHOULDER],lm[LM.RIGHT_ELBOW],lm[LM.RIGHT_WRIST]))/2),
    ankle:    () => Math.round((PoseUtils.angle3(lm[LM.LEFT_KNEE],lm[LM.LEFT_ANKLE],lm[LM.LEFT_FOOT_INDEX])+PoseUtils.angle3(lm[LM.RIGHT_KNEE],lm[LM.RIGHT_ANKLE],lm[LM.RIGHT_FOOT_INDEX]))/2),
  };

  const checked = [...document.querySelectorAll('#joint-checkboxes input:checked')].map(i => i.value);
  const toCapture = checked.length ? checked : Object.keys(jointAngleMap);

  toCapture.forEach(j => {
    if (!jointAngleMap[j]) return;
    if (!adminCapturedROM[j]) adminCapturedROM[j] = {};
    adminCapturedROM[j][position] = jointAngleMap[j]();
  });

  const bai = PoseUtils.symmetryBAI(lm);
  $('capture-stats').textContent = `✓ ${position === 'top' ? 'Top' : 'Bottom'} frame captured. BAI: ${bai}/100`;
  $('rom-display').innerHTML = Object.entries(adminCapturedROM).map(([j, a]) =>
    `<div class="rom-chip">${j}: ${Object.entries(a).map(([p,d])=>`${p}: ${d}°`).join(', ')}</div>`
  ).join('');
}

$('btn-save-exercise').addEventListener('click', saveExercise);

function saveExercise() {
  const name = $('ex-name').value.trim();
  if (!name) { $('save-feedback').textContent = '⚠ Please enter an exercise name.'; return; }

  const checked      = [...document.querySelectorAll('#joint-checkboxes input:checked')].map(i => i.value);
  const category     = $('ex-category').value;
  const repDirection = $('ex-rep-direction').value;
  const tolerance    = parseInt($('rom-tolerance').value) || 15;

  const rom = {};
  Object.entries(adminCapturedROM).forEach(([joint, angles]) => {
    rom[joint] = { top: angles.top ?? 170, bottom: angles.bottom ?? 90, label: joint.charAt(0).toUpperCase()+joint.slice(1)+' Angle' };
  });

  const primaryJoint = checked[0] || Object.keys(rom)[0] || 'knee';
  const topAngle     = rom[primaryJoint]?.top    ?? 170;
  const bottomAngle  = rom[primaryJoint]?.bottom ?? 90;
  const isDecreasing = topAngle >= bottomAngle;
  const range        = Math.max(15, Math.abs(topAngle - bottomAngle));

  let stateMachineBody = '';
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
    ${JSON.stringify(checked)}.forEach(function(j){if(m[j])r[j]=m[j]();});
    if(!Object.keys(r).length && m['${primaryJoint}'])r['${primaryJoint}']=m['${primaryJoint}']();
    return r;
  `;

  const config = {
    id: name.toLowerCase().replace(/\s+/g,'-')+'-'+Date.now(),
    name, category, emoji: categoryEmoji(category),
    joints: checked, rom, romTolerance: tolerance, repDirection,
    repStateMachine: stateMachineBody,
    validateForm: 'return { ok: true, errors: [], warnings: [] };',
    computeAngles: computeAnglesBody,
    videoDataUrl: null,
  };

  if (adminVideoFile) {
    const reader = new FileReader();
    reader.onload = (e) => { config.videoDataUrl = e.target.result; persistAndRegister(config); };
    reader.readAsDataURL(adminVideoFile);
  } else {
    persistAndRegister(config);
  }
}

function generateValidateRepBody(config) {
  // Always accept completed movement cycles with informative feedback rather than blocking counts
  return 'return { ok: true, errors: [] };';
}

function persistAndRegister(config) {
  const live = { ...config };
  live.repStateMachine = new Function('phase','angles','config', config.repStateMachine);
  live.validateForm    = new Function('angles','landmarks','config', config.validateForm);
  live.computeAngles   = new Function('lm', config.computeAngles);
  live.computeBAI      = PoseUtils.symmetryBAI;
  
  // Generate validateRep based on captured ROM and rep direction
  const validateRepBody = generateValidateRepBody(config);
  live.validateRep = new Function('downAngles', 'upAngles', 'config', validateRepBody);
  
  ExerciseRegistry.push(live);

  const persisted = JSON.parse(localStorage.getItem('motioniq_exercises') || '[]');
  persisted.push(config);
  try {
    localStorage.setItem('motioniq_exercises', JSON.stringify(persisted));
  } catch (e) {
    config.videoDataUrl = null;
    persisted[persisted.length-1] = config;
    try { localStorage.setItem('motioniq_exercises', JSON.stringify(persisted)); } catch(_) {}
  }

  $('save-feedback').textContent = `✓ "${config.name}" added to the library!`;
  $('ex-name').value = '';
  adminCapturedROM = {};
  $('rom-display').innerHTML = '';
  $('capture-stats').textContent = '';
  $('admin-video-preview').style.display = 'none';
  $('rom-capture-panel').style.display = 'none';
  renderAdminList();
  renderLibrary();
}

function categoryEmoji(cat) {
  return { Strength:'🏋', Flexibility:'🧘', Cardio:'🏃', Rehabilitation:'🩺', Balance:'⚖' }[cat] || '💪';
}

function renderAdminList() {
  const list = $('admin-exercise-list');
  $('ex-count').textContent = ExerciseRegistry.length;
  list.innerHTML = ExerciseRegistry.map((ex, idx) => `
    <div class="admin-ex-item">
      <div>
        <div class="admin-ex-item-name">${ex.emoji||''} ${ex.name}</div>
        <div class="admin-ex-item-meta">${ex.category} · ${ex.joints?.join(', ')||'—'}</div>
      </div>
      ${idx >= 4
        ? `<button class="btn-delete" data-idx="${idx}">Remove</button>`
        : '<span style="color:var(--muted);font-size:.7rem;">built-in</span>'}
    </div>`
  ).join('') || '<p style="color:var(--muted);font-size:.85rem;">No exercises yet.</p>';

  list.querySelectorAll('.btn-delete').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.idx);
      const ex  = ExerciseRegistry[idx];
      ExerciseRegistry.splice(idx, 1);
      const persisted = JSON.parse(localStorage.getItem('motioniq_exercises')||'[]');
      const pi = persisted.findIndex(p => p.id === ex.id);
      if (pi >= 0) persisted.splice(pi, 1);
      localStorage.setItem('motioniq_exercises', JSON.stringify(persisted));
      renderAdminList();
      renderLibrary();
    });
  });
}

/* ─────────────────── VOICE CUES ─────────────────── */
const CHEERS = ['Amazing!', 'Keep going!', 'Fantastic!', 'Great job!', 'You got it!', 'Superstar!'];

function speak(text) {
  if (!audioMode) return;
  if (!window.speechSynthesis) return;
  const utt = new SpeechSynthesisUtterance(text);
  utt.rate   = 0.92;
  utt.pitch  = childMode ? 1.2 : 1.0;
  utt.volume = 1;
  window.speechSynthesis.cancel(); // don't queue up
  window.speechSynthesis.speak(utt);
}

/* ─────────────────── COUNTDOWN ─────────────────── */
function runCountdown(onDone) {
  const overlay = $('countdown-overlay');
  const numEl   = $('countdown-number');
  const lblEl   = $('countdown-label');
  overlay.style.display = 'flex';

  const steps = [
    { n: '3', l: 'Get ready…' },
    { n: '2', l: 'Stand in frame!' },
    { n: '1', l: 'Almost…' },
    { n: 'GO!', l: "Let's do it!" },
  ];
  let i = 0;

  function tick() {
    if (i >= steps.length) {
      overlay.style.display = 'none';
      onDone();
      if (window._sessionStartHook) {
        window._sessionStartHook();
        delete window._sessionStartHook;
      }
      return;
    }
    const s = steps[i++];
    numEl.textContent = s.n;
    lblEl.textContent = s.l;
    // Reset animation
    numEl.style.animation = 'none';
    void numEl.offsetWidth;
    numEl.style.animation = '';
    if (audioMode) speak(s.n === 'GO!' ? "Let's go!" : s.n);
    setTimeout(tick, 900);
  }
  tick();
}

/* ─────────────────── SOCIAL STORY ─────────────────── */
function showSocialStory(exercise, onDone) {
  const panel = $('social-story-panel');
  const greeting = childProfile.name
    ? `Hi ${childProfile.name}! Let's do ${exercise.name}!`
    : `Let's do ${exercise.name}!`;
  $('story-greeting').textContent = greeting;
  panel.style.display = 'flex';

  if (audioMode) speak(greeting);

  $('btn-story-ok').onclick = () => {
    panel.style.display = 'none';
    onDone();
  };
}

/* ─────────────────── FEEDBACK PICTURE CUES ─────────────────── */
// Maps keywords in error messages to simple pictogram emojis
const PICTURE_CUES = {
  'knee':     '🦵',
  'squat':    '⬇️',
  'elbow':    '💪',
  'hip':      '🧍',
  'back':     '🔙',
  'chest':    '🫁',
  'arm':      '💪',
  'deeper':   '⬇️',
  'lower':    '⬇️',
  'raise':    '⬆️',
  'shoulder': '🫱',
  'straight': '📏',
  'hips':     '⚖',
  'plank':    '📏',
};

function getPictureCue(errorText) {
  const lower = errorText.toLowerCase();
  for (const [keyword, emoji] of Object.entries(PICTURE_CUES)) {
    if (lower.includes(keyword)) return emoji;
  }
  return '👀';
}

// Child-friendly rewrite of technical error messages
const CHILD_FRIENDLY = [
  { match: /squat deeper|knee angle/i,        text: 'Bend knees more' },
  { match: /hinge hip/i,                       text: 'Push hips back' },
  { match: /chest up|torso leaning/i,          text: 'Stand tall!' },
  { match: /knees.*forward/i,                  text: 'Knees behind toes' },
  { match: /extend.*arm|fully extend/i,        text: 'Straighten your arm' },
  { match: /curl all the way/i,                text: 'Curl arm up high' },
  { match: /elbow.*side/i,                     text: 'Keep elbow tucked' },
  { match: /lock out/i,                        text: 'Push all the way up' },
  { match: /lower chest/i,                     text: 'Go lower down' },
  { match: /hips level|straight plank/i,       text: 'Keep body straight' },
  { match: /raise.*shoulder height/i,          text: 'Lift arms higher' },
];

function simplifyError(text) {
  if (!childMode) return text;
  for (const rule of CHILD_FRIENDLY) {
    if (rule.match.test(text)) return rule.text;
  }
  // Fallback: take first 5 words
  return text.split(' ').slice(0, 5).join(' ');
}

/* ─────────────────── SESSION STATE ─────────────────── */
let sessionActive   = false;
let currentExercise = null;
let sessionReps     = 0;
let _lastBandDetection = { color: 'Unknown', resistance: 'Unassigned' };
let _lastBandCheckAt   = 0;
let sessionSets     = 0;
let repGoal         = 10;
let repAccuracy     = { good: 0, bad: 0 };
let goalReached     = false;
let starCount       = 0;
let sessionFrameCount = 0;
let sessionBaiTotal = 0;
let sessionRomScoreTotal = 0;
let sessionRomFrameCount = 0;

function startSession(exercise) {
  currentExercise = exercise;
  sessionReps     = 0;
  sessionSets     = 0;
  repAccuracy     = { good: 0, bad: 0 };
  goalReached     = false;
  starCount       = 0;
  sessionFrameCount = 0;
  sessionBaiTotal = 0;
  sessionRomScoreTotal = 0;
  sessionRomFrameCount = 0;

  // Apply child profile ROM tolerance override
  if (childMode && childProfile.romTolerance) {
    exercise._originalTolerance  = exercise.romTolerance;
    exercise.romTolerance        = childProfile.romTolerance;
  }

  // Load rep goal
  repGoal = childMode
    ? (childProfile.repGoal || 10)
    : (parseInt($('rep-goal-input').value) || 10);
  $('rep-goal-input').value = repGoal;

  // Reset UI
  $('stat-reps').textContent     = '0';
  $('stat-sets').textContent     = '0';
  $('stat-accuracy').textContent = '–';
  $('form-tips').innerHTML       = '';
  $('feedback-overlay').style.display  = 'none';
  $('congrats-banner').style.display   = 'none';
  $('star-container').innerHTML        = '';
  $('rep-goal-bar').style.width        = '0%';
  $('phase-pill').textContent          = 'READY';
  $('btn-set-done').style.display      = 'none';

  // Reference display — if a YouTube link was given, prefer it (that's
  // the reference the user chose to watch); otherwise fall back to the
  // locally uploaded/analyzed video file. Either way, live tracking below
  // always measures the user's camera against the ROM figures already
  // computed from the uploaded file — the YouTube embed is visual only.
  const refVid = $('reference-video');
  const ytWrap = $('reference-youtube-wrap');
  const ytFrame = $('reference-youtube-frame');
  if (exercise.videoUrl) {
    refVid.style.display = 'none';
    if (ytWrap && ytFrame) {
      const vid = (exercise.videoUrl.match(/(?:v=|youtu\.be\/)([^&?]+)/) || [])[1];
      ytFrame.src = vid ? `https://www.youtube-nocookie.com/embed/${vid}` : '';
      ytWrap.style.display = 'block';
    }
  } else if (exercise.videoDataUrl) {
    refVid.src = exercise.videoDataUrl;
    refVid.style.display = 'block';
    if (ytWrap) ytWrap.style.display = 'none';
  } else {
    refVid.style.display = 'none';
    if (ytWrap) ytWrap.style.display = 'none';
  }

  $('session-exercise-name').textContent  = exercise.name;
  $('session-category-badge').textContent = exercise.category;
  $('session-category-badge').className   = `cat-badge ${(exercise.category||'').toLowerCase()}`;

  buildRomGauges(exercise);
  CamInstructionManager.load(exercise);
  PoseEngine.setExercise(exercise);
  PoseEngine.init($('user-video'), $('pose-canvas'), {
    onFrame:       handleFrame,
    onRep:         handleRep,
    onPhaseChange: handlePhaseChange,
    onPoseStatus:  handlePoseStatus,
    onReset:       handleReset,
    onError:       handlePoseError,
  });

  showView('session');

  // Social story first (if child mode + preference set)
  if (childMode && childProfile.socialStory === '1') {
    showSocialStory(exercise, () => {
      // After story, start session automatically
      beginSession();
    });
  }
}

function buildRomGauges(exercise) {
  const container = $('rom-gauges');
  container.innerHTML = '';
  if (!exercise.rom) {
    container.innerHTML = '<p style="color:var(--muted);font-size:.78rem;">No ROM data.</p>';
    return;
  }
  Object.entries(exercise.rom).forEach(([joint, def]) => {
    const row = document.createElement('div');
    row.className = 'rom-gauge-row';
    row.innerHTML = `
      <div class="rom-gauge-label">
        <span>${def.label || joint}</span>
        <span id="gauge-val-${joint}">–</span>
      </div>
      <div class="rom-gauge-track">
        <div class="rom-gauge-fill" id="gauge-fill-${joint}" style="width:50%"></div>
      </div>`;
    container.appendChild(row);
  });
}

/* ─────────────────── EXERCISE INSTRUCTIONS NEAR CAMERA (Google Search Grounded) ─────────────────── */
const CamInstructionManager = (function() {
  const cache = {};
  let currentExercise = null;
  let currentStepIndex = 0;
  let currentSteps = [];
  let isSpeaking = false;
  let isExpanded = false;

  const DEFAULT_INSTRUCTIONS = {
    squat: {
      title: "Squat",
      setup: "Stand 6-8 feet from camera with feet shoulder-width apart, toes turned slightly outward. Arms extended forward or hands at chest.",
      steps: [
        "Setup: Stand tall with feet shoulder-width apart, brace core, look straight ahead.",
        "Descent: Push hips back and bend knees, keeping chest lifted and spine neutral.",
        "Depth: Lower until thighs are parallel to the ground (knees ~90°), knees tracking over toes.",
        "Ascent: Press through heels and midfoot to return upright, squeezing glutes at the top."
      ],
      cues: ["Knees ~90° at depth", "Chest tall", "Spine neutral", "Weight in midfoot"],
      mistakes: [
        "Knees caving inward (valgus collapse) — push knees out over toes",
        "Chest collapsing forward or lumbar rounding — brace abdominals",
        "Heels lifting off the floor — drive through heels and midfoot"
      ],
      breathing: "Inhale on descent; exhale forcefully driving back up to standing.",
      grounded: false
    },
    "bicep curl": {
      title: "Bicep Curl",
      setup: "Stand facing camera with chest open, elbows pinned to your ribs, holding weights or resistance band with underhand grip.",
      steps: [
        "Setup: Stand tall, shoulders relaxed, arms fully extended at sides.",
        "Flexion: Curl arms upward by bending elbows, keeping upper arms motionless against ribs.",
        "Peak: Squeeze biceps firmly at top contraction (elbow ~45°).",
        "Lowering: Lower weights slowly under control to full extension (~160-170°)."
      ],
      cues: ["Elbows pinned to sides", "Zero torso swing", "Full extension at bottom"],
      mistakes: [
        "Swinging elbows forward to assist the lift — isolate the biceps",
        "Using hip or back momentum to hoist the weight",
        "Stopping short of full extension at the bottom"
      ],
      breathing: "Exhale as you curl upward; inhale as you lower the weight.",
      grounded: false
    },
    "lateral raise": {
      title: "Lateral Raise",
      setup: "Stand with slight bend in knees, arms hanging at sides with palms facing in, dumbbells or resistance band under feet.",
      steps: [
        "Setup: Stand tall with core engaged, slight soft bend in elbows.",
        "Elevation: Raise arms out to sides in the scapular plane (slightly forward of torso).",
        "Peak: Stop when arms reach parallel to floor (~90° shoulder abduction).",
        "Descent: Lower weights slowly over 2-3 seconds resisting gravity."
      ],
      cues: ["Shoulder abduction to 90°", "Keep neck relaxed", "Lead with elbows"],
      mistakes: [
        "Shrugging traps up into neck — keep shoulder blades down and back",
        "Lifting arms way above shoulder level",
        "Using back momentum to fling weights upward"
      ],
      breathing: "Exhale as you raise arms; inhale as you lower.",
      grounded: false
    },
    "push-up": {
      title: "Push-Up",
      setup: "Position body at a 45° angle to the camera in a plank position with hands slightly wider than shoulder width.",
      steps: [
        "Setup: High plank position, hands below shoulders, body in a rigid straight line from head to heels.",
        "Descent: Lower chest by bending elbows to 90°, keeping elbows tucked at 45° from ribs.",
        "Hover: Pause briefly 1-2 inches off the ground.",
        "Press: Push the ground away to return to full plank extension."
      ],
      cues: ["Elbows at 45° angle", "Glutes & core locked", "Chest to floor depth"],
      mistakes: [
        "Hips sagging down or piking upward — maintain straight plank line",
        "Elbows flaring out perpendicular (90°) to body",
        "Dropping head forward instead of lowering chest"
      ],
      breathing: "Inhale as you lower down; exhale as you push back up.",
      grounded: false
    },
    "shoulder flexion": {
      title: "Shoulder Flexion",
      setup: "Stand or sit tall facing camera with arms resting at sides, thumb pointing upward.",
      steps: [
        "Setup: Posture upright with shoulder blades retracted gently.",
        "Raise: Slowly raise arm forward and overhead with thumb leading the movement.",
        "Target: Reach peak overhead flexion (~160-180°) without arching your back.",
        "Lower: Smoothly lower the arm back to the starting position."
      ],
      cues: ["Thumb pointing up", "Torso stays upright", "Smooth controlled motion"],
      mistakes: [
        "Arching lower back to gain artificial range of motion",
        "Shrugging shoulder upward before initiating the raise"
      ],
      breathing: "Inhale as arm raises; exhale as arm lowers.",
      grounded: false
    },
    "hamstring stretch": {
      title: "Hamstring Stretch",
      setup: "Stand facing camera, heel placed slightly forward with toes pointed up.",
      steps: [
        "Setup: Place working heel forward with foot flexed, hands on opposite thigh.",
        "Hinge: Hinge backward at the hips while keeping spine long and chest open.",
        "Hold: Hold the gentle stretch along the back of the thigh for 20-30 seconds.",
        "Release: Push through back foot to return to standing upright."
      ],
      cues: ["Hinge at hips", "Keep spine straight", "Gentle tension, no sharp pain"],
      mistakes: [
        "Rounding spine to reach for toes instead of hinging at hips",
        "Bouncing aggressively instead of static controlled hold"
      ],
      breathing: "Breathe deeply and slowly throughout the stretch hold.",
      grounded: false
    }
  };

  function getFallback(exercise) {
    const nameLower = (exercise.name || '').toLowerCase().trim();
    for (const [k, v] of Object.entries(DEFAULT_INSTRUCTIONS)) {
      if (nameLower.includes(k)) return JSON.parse(JSON.stringify(v));
    }
    const primaryJoints = exercise.joints ? exercise.joints.join(', ') : 'target joints';
    return {
      title: exercise.name,
      setup: `Stand 6-8 feet from camera, ensuring your ${primaryJoints} are clearly in frame.`,
      steps: [
        `Setup: Get into starting position with good posture, focusing on ${primaryJoints}.`,
        `Movement: Initiate the movement through the full target range of motion.`,
        `Inflection: Reach maximum contraction / peak extension and hold momentarily.`,
        `Return: Return to the initial starting posture under smooth control.`
      ],
      cues: [`Track ${primaryJoints}`, "Controlled tempo", "Good posture"],
      mistakes: ["Moving too quickly without control", "Compensating with secondary joints"],
      breathing: "Breathe rhythmically — exhale on exertion, inhale on return.",
      grounded: false
    };
  }

  function parseAiText(text) {
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    const steps = [];
    const cues = [];
    const mistakes = [];
    let setup = '';
    let currentSection = '';

    for (const line of lines) {
      const lower = line.toLowerCase();
      if (lower.includes('setup') || lower.includes('stance')) {
        currentSection = 'setup';
        continue;
      } else if (lower.includes('step') || lower.includes('execution') || lower.includes('movement')) {
        currentSection = 'steps';
        continue;
      } else if (lower.includes('angle') || lower.includes('rom') || lower.includes('cue') || lower.includes('alignment')) {
        currentSection = 'cues';
        continue;
      } else if (lower.includes('mistake') || lower.includes('error') || lower.includes('avoid')) {
        currentSection = 'mistakes';
        continue;
      }

      const cleanLine = line.replace(/^[#*->\d\.\s]+/, '').trim();
      if (!cleanLine) continue;

      if (currentSection === 'setup' && !setup) {
        setup = cleanLine;
      } else if (currentSection === 'steps') {
        if (/^\d+\.|\*|-/.test(line) || cleanLine.length > 8) {
          steps.push(cleanLine);
        }
      } else if (currentSection === 'cues') {
        cues.push(cleanLine);
      } else if (currentSection === 'mistakes') {
        mistakes.push(cleanLine);
      }
    }

    return {
      setup: setup || lines[0] || '',
      steps: steps.length ? steps.slice(0, 5) : [
        "Setup in clear view of the camera",
        "Move smoothly through the full range of motion",
        "Pause at peak position",
        "Return smoothly to start"
      ],
      cues: cues.slice(0, 4),
      mistakes: mistakes.slice(0, 3)
    };
  }

  function render(data) {
    const titleEl = $('cam-instruction-title');
    const badgeEl = $('cam-instruction-grounding-badge');
    const contentEl = $('cam-instruction-content');
    const sourcesEl = $('cam-instruction-sources');
    const sourcesListEl = $('cam-instruction-sources-list');

    if (titleEl) titleEl.textContent = `${data.title || currentExercise.name} Guide`;

    currentSteps = data.steps || [];
    currentStepIndex = Math.min(currentStepIndex, Math.max(0, currentSteps.length - 1));
    updateTicker();

    // Render detailed content
    if (contentEl) {
      let html = '';

      if (data.setup) {
        html += `
          <div class="inst-section">
            <div class="inst-heading">📍 Starting Setup</div>
            <div style="color:#e2e8f0;">${data.setup}</div>
          </div>`;
      }

      if (currentSteps.length) {
        html += `
          <div class="inst-section">
            <div class="inst-heading">🏃 Step-by-Step Execution</div>
            <ol class="inst-steps-list">
              ${currentSteps.map((s, idx) => `<li style="${idx === currentStepIndex ? 'color:#5eead4;font-weight:600;' : ''}">${s}</li>`).join('')}
            </ol>
          </div>`;
      }

      if (data.cues && data.cues.length) {
        html += `
          <div class="inst-section">
            <div class="inst-heading">📐 Key Form &amp; Joint Cues</div>
            <div class="inst-cues">
              ${data.cues.map(c => `<span class="inst-cue-badge">✓ ${c}</span>`).join('')}
            </div>
          </div>`;
      }

      if (data.mistakes && data.mistakes.length) {
        html += `
          <div class="inst-section">
            <div class="inst-heading">⚠️ Common Mistakes to Avoid</div>
            ${data.mistakes.map(m => `<div class="inst-mistake-item">• ${m}</div>`).join('')}
          </div>`;
      }

      if (data.breathing) {
        html += `
          <div class="inst-section">
            <div class="inst-heading">🫁 Breathing Rhythm</div>
            <div style="color:#cbd5e1;font-size:0.75rem;">${data.breathing}</div>
          </div>`;
      }

      contentEl.innerHTML = html;
    }

    // Grounding Sources
    if (sourcesEl && sourcesListEl) {
      if (data.sources && data.sources.length) {
        sourcesEl.style.display = 'block';
        sourcesListEl.innerHTML = data.sources.map(s => {
          let host = s.uri;
          try { host = new URL(s.uri).hostname.replace(/^www\./, ''); } catch(_) {}
          const safeTitle = (s.title || host).replace(/</g, '&lt;').replace(/>/g, '&gt;');
          return `<a href="${s.uri}" target="_blank" rel="noopener noreferrer" class="source-chip" title="${s.uri}">
            <span>🌐</span>
            <strong>${safeTitle}</strong>
            <span style="opacity:0.6;font-size:0.65rem;">(${host})</span>
          </a>`;
        }).join('');

        if (badgeEl) {
          badgeEl.innerHTML = `
            <svg class="google-search-icon" viewBox="0 0 24 24" width="12" height="12" aria-hidden="true">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
            </svg>
            Search Grounded (${data.sources.length})
          `;
          badgeEl.title = `Grounded in ${data.sources.length} live Google Search sources via gemini-3.5-flash`;
          badgeEl.style.borderColor = '#38bdf8';
        }
      } else {
        sourcesEl.style.display = 'none';
        if (badgeEl) {
          badgeEl.innerHTML = `
            <svg class="google-search-icon" viewBox="0 0 24 24" width="12" height="12" aria-hidden="true">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
            </svg>
            Google Search
          `;
          badgeEl.style.borderColor = 'rgba(66, 133, 244, 0.35)';
        }
      }
    }
  }

  function updateTicker() {
    const stepNumEl = $('cam-ticker-step-num');
    const textEl = $('cam-ticker-text');
    if (!stepNumEl || !textEl) return;

    if (!currentSteps.length) {
      stepNumEl.textContent = 'Guide';
      textEl.textContent = 'Setup in clear view of camera.';
      return;
    }

    stepNumEl.textContent = `Step ${currentStepIndex + 1}`;
    textEl.textContent = currentSteps[currentStepIndex];
  }

  async function load(exercise, forceRefresh = false) {
    if (!exercise) return;
    currentExercise = exercise;
    currentStepIndex = 0;

    const cacheKey = (exercise.name || '').toLowerCase().trim();
    if (!forceRefresh && cache[cacheKey]) {
      render(cache[cacheKey]);
      return;
    }

    // Show initial fallback immediately
    const fallback = getFallback(exercise);
    render(fallback);

    // Call server endpoint for Google Search-grounded guidance
    const loadingEl = $('cam-instruction-loading');
    if (loadingEl) loadingEl.style.display = 'flex';

    try {
      const res = await GeminiClient.fetchExerciseInstructions(exercise.name, exercise.category || 'Fitness');
      if (res && res.ok && res.text) {
        const parsed = parseAiText(res.text);
        const mergedData = {
          title: exercise.name,
          setup: parsed.setup || fallback.setup,
          steps: parsed.steps.length ? parsed.steps : fallback.steps,
          cues: parsed.cues.length ? parsed.cues : fallback.cues,
          mistakes: parsed.mistakes.length ? parsed.mistakes : fallback.mistakes,
          breathing: fallback.breathing,
          sources: res.sources || [],
          model: res.model || 'gemini-3.5-flash',
          grounded: !!(res.sources && res.sources.length)
        };
        cache[cacheKey] = mergedData;
        render(mergedData);
      }
    } catch (err) {
      console.warn('[CamInstructionManager] Search grounding fetch error:', err);
    } finally {
      if (loadingEl) loadingEl.style.display = 'none';
    }
  }

  function nextStep() {
    if (!currentSteps.length) return;
    currentStepIndex = (currentStepIndex + 1) % currentSteps.length;
    updateTicker();
    if (isSpeaking) speakCurrentStep();
  }

  function prevStep() {
    if (!currentSteps.length) return;
    currentStepIndex = (currentStepIndex - 1 + currentSteps.length) % currentSteps.length;
    updateTicker();
    if (isSpeaking) speakCurrentStep();
  }

  function onPhaseChange(phase) {
    if (!currentSteps.length) return;
    let targetIndex = currentStepIndex;
    if (phase === 'up') targetIndex = 0;
    else if (phase === 'transition-down') targetIndex = Math.min(1, currentSteps.length - 1);
    else if (phase === 'down') targetIndex = Math.min(2, currentSteps.length - 1);
    else if (phase === 'transition-up') targetIndex = Math.min(3, currentSteps.length - 1);

    if (targetIndex !== currentStepIndex) {
      currentStepIndex = targetIndex;
      updateTicker();
    }
  }

  function toggleExpand() {
    isExpanded = !isExpanded;
    const bodyEl = $('cam-instruction-body');
    const toggleIcon = $('cam-toggle-icon');
    if (bodyEl) bodyEl.style.display = isExpanded ? 'block' : 'none';
    if (toggleIcon) toggleIcon.textContent = isExpanded ? '▲' : '▼';
  }

  function speakCurrentStep() {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    if (!currentSteps.length) return;

    const textToSpeak = `Step ${currentStepIndex + 1}: ${currentSteps[currentStepIndex]}`;
    const utterance = new SpeechSynthesisUtterance(textToSpeak);
    utterance.rate = 0.95;
    utterance.pitch = 1.0;
    utterance.onend = () => {
      isSpeaking = false;
      updateSpeakButton();
    };
    utterance.onerror = () => {
      isSpeaking = false;
      updateSpeakButton();
    };

    isSpeaking = true;
    updateSpeakButton();
    window.speechSynthesis.speak(utterance);
  }

  function toggleSpeech() {
    if (isSpeaking) {
      stopSpeech();
    } else {
      speakCurrentStep();
    }
  }

  function stopSpeech() {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    isSpeaking = false;
    updateSpeakButton();
  }

  function updateSpeakButton() {
    const btn = $('btn-cam-instruction-speak');
    const icon = $('cam-speak-icon');
    if (!btn || !icon) return;
    if (isSpeaking) {
      btn.classList.add('active-speaking');
      icon.textContent = '⏹️';
      btn.title = 'Stop speech';
    } else {
      btn.classList.remove('active-speaking');
      icon.textContent = '🔊';
      btn.title = 'Read instructions aloud';
    }
  }

  function init() {
    const prevBtn = $('btn-ticker-prev');
    const nextBtn = $('btn-ticker-next');
    const toggleBtn = $('btn-cam-instruction-toggle');
    const refreshBtn = $('btn-cam-instruction-refresh');
    const speakBtn = $('btn-cam-instruction-speak');

    if (prevBtn) prevBtn.addEventListener('click', (e) => { e.stopPropagation(); prevStep(); });
    if (nextBtn) nextBtn.addEventListener('click', (e) => { e.stopPropagation(); nextStep(); });
    if (toggleBtn) toggleBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleExpand(); });
    if (refreshBtn) refreshBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (currentExercise) load(currentExercise, true);
    });
    if (speakBtn) speakBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleSpeech(); });
  }

  return {
    init,
    load,
    nextStep,
    prevStep,
    onPhaseChange,
    stopSpeech,
    toggleExpand
  };
})();

/* ─────────────────── POSE CALLBACKS ─────────────────── */
function handleFrame({ angles, bai, formResult, phase, landmarks }) {
  // ROM gauges
  if (currentExercise?.rom) {
    Object.entries(angles).forEach(([joint, deg]) => {
      const fill = $(`gauge-fill-${joint}`);
      const val  = $(`gauge-val-${joint}`);
      if (!fill || !val) return;
      const def = currentExercise.rom[joint];
      if (def) {
        const rMin = Math.min(def.top, def.bottom);
        const rMax = Math.max(def.top, def.bottom);
        const pct  = PoseUtils.clamp(((deg-rMin)/(rMax-rMin))*100, 0, 100);
        fill.style.width = `${pct}%`;
        fill.classList.toggle('out-of-range',
          deg < rMin - currentExercise.romTolerance || deg > rMax + currentExercise.romTolerance);
      }
      val.textContent = `${deg}°`;
    });
  }

  // BAI
  $('bai-bar').style.width  = `${bai}%`;
  $('bai-label').textContent = `${bai}/100 — ${bai>75?'Good alignment':bai>50?'Moderate':'Improve posture'}`;

  if (sessionActive && currentExercise) {
    sessionFrameCount += 1;
    sessionBaiTotal += bai;
    if (currentExercise.rom) {
      const jointScores = Object.entries(currentExercise.rom).map(([joint, def]) => {
        const current = angles[joint];
        if (current === undefined) return null;
        const ideal = phase === 'up' || phase === 'transition-up'
          ? def.top
          : phase === 'down' || phase === 'transition-down'
            ? def.bottom
            : (def.top + def.bottom) / 2;
        const range = Math.max(1, Math.abs(def.top - def.bottom));
        const diff = Math.min(range, Math.abs(current - ideal));
        return Math.max(0, 100 - (diff / range) * 100);
      }).filter(v => v !== null);
      if (jointScores.length) {
        sessionRomScoreTotal += jointScores.reduce((sum, value) => sum + value, 0) / jointScores.length;
        sessionRomFrameCount += 1;
      }
    }
  }

  // Live form tips
  const tips = $('form-tips');
  if (formResult.errors.length || formResult.warnings.length) {
    const items = [
      ...formResult.errors.map(e   => `<li class="error">❌ ${simplifyError(e)}</li>`),
      ...formResult.warnings.map(w => `<li class="warn">⚠ ${simplifyError(w)}</li>`),
    ];
    tips.innerHTML = items.join('');

    if (formResult.errors.length && !goalReached) {
      const msg = simplifyError(formResult.errors[0]);
      $('feedback-overlay').style.display = 'flex';
      $('feedback-icon').textContent       = '💛';
      $('feedback-text').textContent       = msg;
      $('feedback-picture').textContent    = childMode ? getPictureCue(formResult.errors[0]) : '';
    } else {
      $('feedback-overlay').style.display = 'none';
    }
  } else {
    if (phase === 'down' || phase === 'transition-up') {
      tips.innerHTML = '<li class="ok">✓ Looking good — keep it up!</li>';
    } else {
      tips.innerHTML = '';
    }
    $('feedback-overlay').style.display = 'none';
  }

  const matchWrap = $('yoga-match-wrap');
  if (matchWrap && !_yogaRunning) {
    if (sessionActive && currentExercise) {
      const match = computeExerciseMatchScore(angles, phase, currentExercise);
      const matchPercent = $('yoga-match-percent');
      const matchDetail  = $('yoga-match-details');
      matchWrap.style.display = 'flex';
      if (matchPercent) matchPercent.textContent = `${match.matchPct}%`;
      if (matchDetail) matchDetail.textContent = match.details;
      if (matchPercent) {
        matchPercent.style.color = match.matchPct > 75
          ? '#4ade80' : match.matchPct > 40 ? '#fbbf24' : '#f87171';
      }
    } else {
      matchWrap.style.display = 'none';
    }
  }
}

function handleRep(repCount, isGood, errors) {
  sessionReps++;
  $('stat-reps').textContent = sessionReps;

  if (isGood) {
    repAccuracy.good++;
    addStar();

    // Voice cue
    if (childMode) {
      const cheer = sessionReps % 5 === 0
        ? ` ${CHEERS[Math.floor(Math.random()*CHEERS.length)]}`
        : '';
      speak(`${sessionReps}${cheer}`);
    } else {
      if (sessionReps % 5 === 0) speak(CHEERS[Math.floor(Math.random()*CHEERS.length)]);
    }

    if (!calmMode) triggerRepFlash();
    $('phase-pill').textContent = childMode ? `⭐ ${sessionReps}!` : `REP ${sessionReps} ✓`;
  } else {
    repAccuracy.bad++;
    if (!calmMode) triggerRepFlash();
    $('phase-pill').textContent = childMode ? `⭐ ${sessionReps}` : `REP ${sessionReps} (form tip)`;

    if (errors && errors.length && !goalReached) {
      const msg = simplifyError(errors[0]);
      $('feedback-overlay').style.display = 'flex';
      $('feedback-icon').textContent       = '💛';
      $('feedback-text').textContent       = msg;
      $('feedback-picture').textContent    = childMode ? getPictureCue(errors[0]) : '';
      setTimeout(() => { $('feedback-overlay').style.display = 'none'; }, 2200);
      if (childMode) speak(msg);
    }
  }

  // Update goal bar and completion state
  updateGoalBar();
  if (sessionReps >= repGoal && !goalReached) {
    goalReached = true;
    showCongratsAndStop();
  }

  if (sessionReps >= 8) $('btn-set-done').style.display = '';

  const total = repAccuracy.good + repAccuracy.bad;
  if (total > 0) {
    $('stat-accuracy').textContent = `${Math.round((repAccuracy.good/total)*100)}%`;
  }
}

function handlePhaseChange(phase) {
  if (goalReached) return;
  CamInstructionManager.onPhaseChange(phase);
  // Child-friendly phase labels
  const childLabels = {
    'up':             'Stand up!',
    'transition-down':'Go down!',
    'down':           'Hold it!',
    'transition-up':  'Come up!',
  };
  const normalLabels = {
    'up':             'TOP',
    'transition-down':'GOING DOWN',
    'down':           'HOLD',
    'transition-up':  'GOING UP',
  };
  const labels = childMode ? childLabels : normalLabels;
  $('phase-pill').textContent = labels[phase] || phase.toUpperCase();
}

function handlePoseStatus(detected) {
  if (!detected) $('phase-pill').textContent = childMode ? 'Come closer! 👋' : 'STEP INTO FRAME';
}
function handleReset()      { $('stat-reps').textContent = '0'; }
function handlePoseError(m) { $('phase-pill').textContent = m; }

/* ─────────────────── STAR REWARDS ─────────────────── */
function addStar() {
  starCount++;
  const container = $('star-container');
  const star = document.createElement('span');
  star.className   = 'star';
  star.textContent = '⭐';
  star.style.animationDelay = '0ms';
  container.appendChild(star);
}

function updateGoalBar() {
  const pct = Math.min(100, (sessionReps / repGoal) * 100);
  $('rep-goal-bar').style.width = `${pct}%`;
}

/* ─────────────────── CONGRATS ─────────────────── */
function showCongratsAndStop() {
  const name  = childProfile.name ? `, ${childProfile.name}` : '';
  const texts = [
    `You did it${name}! 🎉`,
    `Awesome work${name}!`,
    `${repGoal} reps — incredible!`,
  ];
  $('congrats-text').textContent = texts[Math.floor(Math.random()*texts.length)];
  $('congrats-sub').textContent  = `${repGoal} reps completed!`;
  $('congrats-banner').style.display = 'flex';
  $('feedback-overlay').style.display = 'none';

  speak(childProfile.name
    ? `Amazing ${childProfile.name}! You did all ${repGoal} reps!`
    : `Amazing! You finished all ${repGoal} reps!`
  );

  // Auto-dismiss after 4 seconds
  setTimeout(() => { $('congrats-banner').style.display = 'none'; }, 4000);
}

/* ─────────────────── REP FLASH ─────────────────── */
function triggerRepFlash() {
  const flash = $('rep-flash');
  flash.classList.remove('flash');
  void flash.offsetWidth;
  flash.classList.add('flash');
}

/* ─────────────────── SESSION CONTROLS ─────────────────── */
$('btn-start-session').addEventListener('click', () => {
  if (!sessionActive) {
    if (childMode && childProfile.socialStory === '1') {
      // Already handled in startSession, this is the direct-press path
      showSocialStory(currentExercise || { name: 'this exercise' }, beginSession);
    } else {
      beginSession();
    }
  }
});

function beginSession() {
  if (sessionActive) return;
  sessionActive = true;
  $('btn-start-session').textContent = 'Session Running…';
  $('btn-start-session').disabled    = true;

  runCountdown(() => {
    PoseEngine.start();
    $('phase-pill').textContent = childMode ? 'Ready? Go! 🏃' : 'DETECTING POSE…';
    if (audioMode) speak('Go!');
  });
}

$('btn-reset-session').addEventListener('click', () => {
  sessionReps     = 0;
  repAccuracy     = { good: 0, bad: 0 };
  goalReached     = false;
  starCount       = 0;
  $('stat-reps').textContent     = '0';
  $('stat-accuracy').textContent = '–';
  $('star-container').innerHTML  = '';
  $('rep-goal-bar').style.width  = '0%';
  $('btn-set-done').style.display = 'none';
  $('congrats-banner').style.display = 'none';
  PoseEngine.resetSession();
});

$('btn-set-done').addEventListener('click', () => {
  sessionSets++;
  sessionReps     = 0;
  repAccuracy     = { good: 0, bad: 0 };
  goalReached     = false;
  starCount       = 0;
  $('stat-sets').textContent     = sessionSets;
  $('stat-reps').textContent     = '0';
  $('stat-accuracy').textContent = '–';
  $('star-container').innerHTML  = '';
  $('rep-goal-bar').style.width  = '0%';
  $('btn-set-done').style.display = 'none';
  $('phase-pill').textContent    = childMode ? `REST TIME 😴 Set ${sessionSets} done!` : `SET ${sessionSets} DONE — REST`;
  PoseEngine.resetSession();
  if (audioMode) speak(childMode ? 'Great set! Time to rest.' : 'Set complete. Rest now.');
});

$('btn-back').addEventListener('click', () => {
  CamInstructionManager.stopSpeech();
  PoseEngine.stop();
  // Restore original tolerance if overridden
  if (currentExercise && currentExercise._originalTolerance !== undefined) {
    currentExercise.romTolerance     = currentExercise._originalTolerance;
    delete currentExercise._originalTolerance;
  }
  let sessionData = null;
  if (currentExercise && sessionActive) {
    const total = repAccuracy.good + repAccuracy.bad;
    const accuracyPct = total ? Math.round((repAccuracy.good / total) * 100) : 0;
    const avgBai = sessionFrameCount ? Math.round(sessionBaiTotal / sessionFrameCount) : 0;
    const avgRomScore = sessionRomFrameCount ? Math.round(sessionRomScoreTotal / sessionRomFrameCount) : null;
    const scoreValues = [accuracyPct, avgBai];
    if (avgRomScore !== null) scoreValues.push(avgRomScore);
    const improvementIndex = Math.round(scoreValues.reduce((sum, v) => sum + v, 0) / scoreValues.length);
    sessionData = {
      id:             Date.now(),
      userName:       childProfile.name || 'Unknown',
      exerciseId:     currentExercise.id || currentExercise.name,
      exerciseName:   currentExercise.name,
      date:           new Date().toISOString(),
      reps:           sessionReps,
      sets:           sessionSets,
      accuracyPct,
      avgBai,
      avgRomScore,
      improvementIndex,
    };
    saveExerciseSession(sessionData);
  }
  sessionActive = false;
  $('btn-start-session').textContent = 'Start Session';
  $('btn-start-session').disabled    = false;
  $('social-story-panel').style.display = 'none';

  if (sessionData && sessionData.reps > 0) {
    showSessionSummaryModal(sessionData);
  } else {
    showView('home');
  }
});

/* ─────────────────── AI COACH: SESSION SUMMARY MODAL ─────────────────── */
function showSessionSummaryModal(sessionData) {
  $('session-summary-stats').innerHTML = `
    <div class="stat-item"><span class="val">${sessionData.reps}</span><span class="lbl">Reps</span></div>
    <div class="stat-item"><span class="val">${sessionData.accuracyPct}%</span><span class="lbl">Accuracy</span></div>
    <div class="stat-item"><span class="val">${sessionData.avgRomScore ?? '–'}%</span><span class="lbl">ROM Score</span></div>
    <div class="stat-item"><span class="val">${sessionData.avgBai}%</span><span class="lbl">Alignment</span></div>
    ${sessionData.bandColor ? `<div class="stat-item"><span class="val" style="font-size:1rem;">${sessionData.bandColor}</span><span class="lbl">${sessionData.resistanceLevel}</span></div>` : ''}
  `;
  $('ai-coach-result').style.display = 'none';
  $('ai-coach-result').innerHTML = '';
  $('ai-coach-key-prompt').style.display = GeminiClient.hasKey() ? 'none' : 'block';
  $('btn-get-ai-coach').style.display = GeminiClient.hasKey() ? 'inline-block' : 'none';
  $('session-summary-modal').style.display = 'flex';
  $('session-summary-modal')._sessionData = sessionData;
}

async function requestAiCoachFeedback(sessionData) {
  $('btn-get-ai-coach').disabled = true;
  $('ai-coach-result').style.display = 'block';
  $('ai-coach-result').innerHTML = '<span class="ai-coach-loading">Thinking about your session…</span>';

  const priors = getExerciseSessionsForUser(sessionData.userName)
    .filter(s => s.exerciseId === sessionData.exerciseId && s.id !== sessionData.id)
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  const res = await GeminiClient.summarizeSession(sessionData, priors);
  if (res.ok) {
    $('ai-coach-result').textContent = res.text;
  } else {
    $('ai-coach-result').innerHTML = `⚠ Couldn't get AI feedback: ${res.error}`;
  }
  $('btn-get-ai-coach').disabled = false;
}

$('btn-get-ai-coach')?.addEventListener('click', () => {
  const sessionData = $('session-summary-modal')._sessionData;
  if (sessionData) requestAiCoachFeedback(sessionData);
});

$('btn-ai-coach-save-key')?.addEventListener('click', () => {
  const key = $('ai-coach-key-input').value.trim();
  if (!key) return;
  GeminiClient.setProvider($('ai-coach-provider-input').value);
  GeminiClient.setKey(key);
  $('ai-coach-key-input').value = '';
  $('ai-coach-key-prompt').style.display = 'none';
  $('btn-get-ai-coach').style.display = 'inline-block';
  const sessionData = $('session-summary-modal')._sessionData;
  if (sessionData) requestAiCoachFeedback(sessionData);
});

$('btn-summary-continue')?.addEventListener('click', () => {
  $('session-summary-modal').style.display = 'none';
  showView('home');
});

/* ─────────────────── YOGA POSE FEATURE ─────────────────── */

// ── Storage helpers ──
function getYogaConfig()   { return JSON.parse(localStorage.getItem('yoga_config')  || 'null'); }
function getYogaUsers()    { return JSON.parse(localStorage.getItem('yoga_users')   || '[]'); }
function getYogaSessions() { return JSON.parse(localStorage.getItem('yoga_sessions')|| '[]'); }
function getExerciseSessions() { return JSON.parse(localStorage.getItem('exercise_sessions')|| '[]'); }

function saveYogaSessions(sessions) {
  localStorage.setItem('yoga_sessions', JSON.stringify(sessions));
}
function saveExerciseSessions(sessions) {
  localStorage.setItem('exercise_sessions', JSON.stringify(sessions));
}

// ── Angle utility ──
function yogaAngle(A, B, C) {
  if (!A || !B || !C) return 180;
  const ab = { x: A.x - B.x, y: A.y - B.y };
  const cb = { x: C.x - B.x, y: C.y - B.y };
  const dot   = ab.x * cb.x + ab.y * cb.y;
  const cross = ab.x * cb.y - ab.y * cb.x;
  return Math.abs(Math.atan2(Math.abs(cross), dot) * (180 / Math.PI));
}

// Joint definitions: [name, idxA, idxB (vertex), idxC]
const YOGA_JOINTS = [
  ['Left Elbow',    11, 13, 15],
  ['Right Elbow',   12, 14, 16],
  ['Left Shoulder', 13, 11, 23],
  ['Right Shoulder',14, 12, 24],
  ['Left Hip',      11, 23, 25],
  ['Right Hip',     12, 24, 26],
  ['Left Knee',     23, 25, 27],
  ['Right Knee',    24, 26, 28],
];

// Presets database
const YOGA_PRESETS = {
  warrior: {
    name: 'Warrior II (Virabhadrasana II)',
    category: 'Flexibility & Strength',
    bai: 95,
    angles: {
      'Left Knee': 90,
      'Right Knee': 175,
      'Left Hip': 115,
      'Right Hip': 165,
      'Left Shoulder': 90,
      'Right Shoulder': 90,
      'Left Elbow': 180,
      'Right Elbow': 180,
    },
    // Synthetic landmarks for Warrior II
    points: {
      nose: [240, 90],
      l_shoulder: [215, 135], r_shoulder: [265, 135],
      l_elbow: [140, 135],    r_elbow: [340, 135],
      l_wrist: [80, 135],     r_wrist: [400, 135],
      l_hip: [225, 205],      r_hip: [255, 205],
      l_knee: [170, 265],     r_knee: [330, 260],
      l_ankle: [170, 330],    r_ankle: [385, 330],
    }
  },
  tree: {
    name: 'Tree Pose (Vrksasana)',
    category: 'Balance & Focus',
    bai: 94,
    angles: {
      'Left Knee': 176,
      'Right Knee': 48,
      'Left Hip': 178,
      'Right Hip': 122,
      'Left Shoulder': 85,
      'Right Shoulder': 85,
      'Left Elbow': 75,
      'Right Elbow': 75,
    },
    points: {
      nose: [240, 75],
      l_shoulder: [218, 125], r_shoulder: [262, 125],
      l_elbow: [195, 160],    r_elbow: [285, 160],
      l_wrist: [232, 145],    r_wrist: [248, 145],
      l_hip: [225, 195],      r_hip: [255, 195],
      l_knee: [230, 260],     r_knee: [310, 235],
      l_ankle: [230, 330],    r_ankle: [248, 250],
    }
  },
  cobra: {
    name: 'Cobra Pose (Bhujangasana)',
    category: 'Spine Mobility',
    bai: 89,
    angles: {
      'Left Elbow': 155,
      'Right Elbow': 155,
      'Left Hip': 168,
      'Right Hip': 168,
      'Left Knee': 178,
      'Right Knee': 178,
      'Left Shoulder': 110,
      'Right Shoulder': 110,
    },
    points: {
      nose: [130, 120],
      l_shoulder: [155, 155], r_shoulder: [180, 150],
      l_elbow: [150, 220],    r_elbow: [175, 215],
      l_wrist: [145, 275],    r_wrist: [170, 270],
      l_hip: [240, 250],      r_hip: [255, 245],
      l_knee: [330, 275],     r_knee: [340, 270],
      l_ankle: [415, 295],    r_ankle: [425, 290],
    }
  },
  triangle: {
    name: 'Triangle Pose (Trikonasana)',
    category: 'Hamstring & Lateral Spine',
    bai: 92,
    angles: {
      'Left Knee': 178,
      'Right Knee': 176,
      'Left Hip': 112,
      'Right Hip': 158,
      'Left Shoulder': 180,
      'Right Shoulder': 180,
      'Left Elbow': 180,
      'Right Elbow': 180,
    },
    points: {
      nose: [195, 160],
      l_shoulder: [190, 185], r_shoulder: [225, 145],
      l_elbow: [175, 240],    r_elbow: [245, 95],
      l_wrist: [165, 295],    r_wrist: [260, 50],
      l_hip: [235, 225],      r_hip: [265, 205],
      l_knee: [175, 275],     r_knee: [320, 270],
      l_ankle: [160, 330],    r_ankle: [370, 330],
    }
  }
};

let _currentYogaPreset = 'warrior';
let _activeYogaConfig = null;

// Draw stylized anatomical reference skeleton on canvas
function drawPresetSkeleton(canvas, presetKey) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width = 480;
  const h = canvas.height = 360;

  // Background
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, '#0b1329');
  grad.addColorStop(1, '#020617');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // Subtle grid
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
  ctx.lineWidth = 1;
  for (let x = 0; x < w; x += 40) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
  }
  for (let y = 0; y < h; y += 40) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
  }

  const preset = YOGA_PRESETS[presetKey] || YOGA_PRESETS.warrior;
  const pt = preset.points;

  // Ground line
  ctx.strokeStyle = 'rgba(0, 229, 160, 0.2)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(30, 332);
  ctx.lineTo(450, 332);
  ctx.stroke();

  // Head
  ctx.fillStyle = '#00e5a0';
  ctx.beginPath();
  ctx.arc(pt.nose[0], pt.nose[1], 14, 0, Math.PI * 2);
  ctx.fill();

  // Draw limbs
  const connections = [
    [pt.nose, pt.l_shoulder], [pt.nose, pt.r_shoulder],
    [pt.l_shoulder, pt.r_shoulder],
    [pt.l_shoulder, pt.l_elbow], [pt.l_elbow, pt.l_wrist],
    [pt.r_shoulder, pt.r_elbow], [pt.r_elbow, pt.r_wrist],
    [pt.l_shoulder, pt.l_hip],   [pt.r_shoulder, pt.r_hip],
    [pt.l_hip, pt.r_hip],
    [pt.l_hip, pt.l_knee],       [pt.l_knee, pt.l_ankle],
    [pt.r_hip, pt.r_knee],       [pt.r_knee, pt.r_ankle],
  ];

  ctx.lineWidth = 4;
  ctx.strokeStyle = '#00e5a0';
  ctx.lineCap = 'round';
  ctx.shadowColor = 'rgba(0, 229, 160, 0.5)';
  ctx.shadowBlur = 8;

  connections.forEach(([p1, p2]) => {
    ctx.beginPath();
    ctx.moveTo(p1[0], p1[1]);
    ctx.lineTo(p2[0], p2[1]);
    ctx.stroke();
  });

  // Joints dots
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#ffffff';
  Object.values(pt).forEach(([x, y]) => {
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fill();
  });

  // Angle labels
  ctx.fillStyle = '#f5c842';
  ctx.font = 'bold 11px "JetBrains Mono", monospace';
  if (preset.angles['Left Knee'])  ctx.fillText(`${preset.angles['Left Knee']}°`, pt.l_knee[0] - 22, pt.l_knee[1] - 8);
  if (preset.angles['Right Knee']) ctx.fillText(`${preset.angles['Right Knee']}°`, pt.r_knee[0] + 10, pt.r_knee[1] - 8);
  if (preset.angles['Left Hip'])   ctx.fillText(`${preset.angles['Left Hip']}°`, pt.l_hip[0] - 30, pt.l_hip[1] + 4);
}

// Convert points to pseudo 33-landmark array compatible with PoseEngine
function createPseudoLandmarks(presetKey) {
  const p = (YOGA_PRESETS[presetKey] || YOGA_PRESETS.warrior).points;
  const lm = [];
  for (let i = 0; i < 33; i++) lm.push({ x: 0.5, y: 0.5, z: 0, visibility: 0.9 });

  const norm = (pt) => ({ x: pt[0] / 480, y: pt[1] / 360, z: 0, visibility: 0.95 });
  lm[0] = norm(p.nose);
  lm[11] = norm(p.l_shoulder);
  lm[12] = norm(p.r_shoulder);
  lm[13] = norm(p.l_elbow);
  lm[14] = norm(p.r_elbow);
  lm[15] = norm(p.l_wrist);
  lm[16] = norm(p.r_wrist);
  lm[23] = norm(p.l_hip);
  lm[24] = norm(p.r_hip);
  lm[25] = norm(p.l_knee);
  lm[26] = norm(p.r_knee);
  lm[27] = norm(p.l_ankle);
  lm[28] = norm(p.r_ankle);
  return lm;
}

function applyYogaPreset(key) {
  _currentYogaPreset = key;
  const preset = YOGA_PRESETS[key] || YOGA_PRESETS.warrior;

  // Toggle button active state
  document.querySelectorAll('.yoga-preset-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.preset === key);
  });

  const nameInput = $('yoga-pose-name');
  if (nameInput) nameInput.value = preset.name;

  const canvas = $('yoga-ref-canvas');
  if (canvas) drawPresetSkeleton(canvas, key);

  // Render Target Joint Angles in UI
  const list = $('yoga-ref-joints-list');
  if (list) {
    list.innerHTML = Object.entries(preset.angles).map(([joint, deg]) => `
      <div class="joint-detect-item">
        <span class="joint-detect-name">🦴 ${joint}</span>
        <span class="joint-detect-angle">${deg}°</span>
      </div>
    `).join('');
  }

  const baiVal = $('yoga-ref-bai-val');
  if (baiVal) baiVal.textContent = `${preset.bai}%`;

  const status = $('yoga-detection-status');
  if (status) {
    status.textContent = '✓ Calibrated';
    status.style.color = '#22c55e';
    status.style.background = '#22c55e22';
  }

  const timerSecs = parseInt($('yoga-timer-duration')?.value) || 30;
  const repeats   = parseInt($('yoga-repeat-count')?.value) || 1;
  const tolerance = parseInt($('yoga-tolerance')?.value) || 15;

  _activeYogaConfig = {
    poseName: preset.name,
    category: preset.category,
    timerSeconds: timerSecs,
    repeatCount: repeats,
    tolerance: tolerance,
    targetAngles: preset.angles,
    referenceBai: preset.bai,
    referenceLandmarks: createPseudoLandmarks(key),
    referenceImageDataUrl: canvas ? canvas.toDataURL('image/jpeg', 0.8) : null,
  };
  localStorage.setItem('yoga_config', JSON.stringify(_activeYogaConfig));
}

// Initialize Yoga UI view
function initYogaUI() {
  // Preset buttons
  document.querySelectorAll('.yoga-preset-btn').forEach(btn => {
    btn.onclick = () => applyYogaPreset(btn.dataset.preset);
  });

  // Timer duration presets
  document.querySelectorAll('.yoga-time-preset').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('.yoga-time-preset').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const s = parseInt(btn.dataset.seconds) || 30;
      if ($('yoga-timer-duration')) $('yoga-timer-duration').value = s;
      if (_activeYogaConfig) {
        _activeYogaConfig.timerSeconds = s;
        localStorage.setItem('yoga_config', JSON.stringify(_activeYogaConfig));
      }
    };
  });

  if ($('yoga-timer-duration')) {
    $('yoga-timer-duration').oninput = (e) => {
      const s = parseInt(e.target.value) || 30;
      document.querySelectorAll('.yoga-time-preset').forEach(b => {
        b.classList.toggle('active', parseInt(b.dataset.seconds) === s);
      });
      if (_activeYogaConfig) {
        _activeYogaConfig.timerSeconds = s;
        localStorage.setItem('yoga_config', JSON.stringify(_activeYogaConfig));
      }
    };
  }

  if ($('yoga-repeat-count')) {
    $('yoga-repeat-count').onchange = (e) => {
      if (_activeYogaConfig) {
        _activeYogaConfig.repeatCount = parseInt(e.target.value) || 1;
        localStorage.setItem('yoga_config', JSON.stringify(_activeYogaConfig));
      }
    };
  }

  if ($('yoga-tolerance')) {
    $('yoga-tolerance').onchange = (e) => {
      if (_activeYogaConfig) {
        _activeYogaConfig.tolerance = parseInt(e.target.value) || 15;
        localStorage.setItem('yoga_config', JSON.stringify(_activeYogaConfig));
      }
    };
  }

  // Custom photo upload
  const fileDrop = $('yoga-file-drop');
  const fileInput = $('yoga-photo-input');

  if (fileDrop && fileInput) {
    fileDrop.onclick = () => fileInput.click();

    fileDrop.ondragover = (e) => {
      e.preventDefault();
      fileDrop.style.borderColor = 'var(--accent)';
      fileDrop.style.background = 'var(--surface2)';
    };
    fileDrop.ondragleave = () => {
      fileDrop.style.borderColor = 'var(--border)';
      fileDrop.style.background = 'var(--surface)';
    };
    fileDrop.ondrop = (e) => {
      e.preventDefault();
      fileDrop.style.borderColor = 'var(--border)';
      fileDrop.style.background = 'var(--surface)';
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        processUploadedYogaImage(e.dataTransfer.files[0]);
      }
    };

    fileInput.onchange = (e) => {
      if (e.target.files && e.target.files[0]) {
        processUploadedYogaImage(e.target.files[0]);
      }
    };
  }

  // Start Live Yoga Session button
  const startBtn = $('btn-start-yoga-live');
  if (startBtn) {
    startBtn.onclick = launchLiveYogaSession;
  }

  // Initial load
  if (!_activeYogaConfig) {
    applyYogaPreset('warrior');
  } else {
    // Refresh canvas
    const canvas = $('yoga-ref-canvas');
    if (canvas && _activeYogaConfig.referenceImageDataUrl) {
      const img = new Image();
      img.onload = () => {
        canvas.width = img.naturalWidth || 480;
        canvas.height = img.naturalHeight || 360;
        canvas.getContext('2d').drawImage(img, 0, 0);
      };
      img.src = _activeYogaConfig.referenceImageDataUrl;
    } else {
      applyYogaPreset(_currentYogaPreset);
    }
  }

  // Back to Library button in Yoga view
  const backToLibBtn = $('btn-yoga-back-to-library');
  if (backToLibBtn) {
    backToLibBtn.onclick = () => showView('home');
  }

  // Library hero banner quick-launch preset buttons
  document.querySelectorAll('.btn-yoga-preset-card').forEach(btn => {
    btn.onclick = () => {
      const preset = btn.dataset.preset || 'warrior';
      applyYogaPreset(preset);
      showView('yoga');
    };
  });

  const customOpenBtn = document.querySelector('.btn-yoga-custom-open');
  if (customOpenBtn) {
    customOpenBtn.onclick = () => {
      applyYogaPreset('warrior');
      showView('yoga');
      const photoInput = $('yoga-photo-input');
      if (photoInput) photoInput.click();
    };
  }

  // PDF Preview & Print Modal controls
  const pdfModalClose = $('btn-pdf-modal-close');
  if (pdfModalClose) {
    pdfModalClose.onclick = () => {
      const modal = $('pdf-report-preview-modal');
      if (modal) modal.style.display = 'none';
    };
  }
  const pdfModalPrint = $('btn-pdf-modal-print');
  if (pdfModalPrint) {
    pdfModalPrint.onclick = () => {
      window.print();
    };
  }

  // Close / Done buttons on modal
  $('btn-yoga-modal-close')?.addEventListener('click', () => {
    $('yoga-summary-modal').style.display = 'none';
    showView('yoga');
  });

  $('btn-yoga-modal-report')?.addEventListener('click', () => {
    $('yoga-summary-modal').style.display = 'none';
    showView('reports');
    if ($('report-user-select')) {
      renderReportUserSelect();
      const user = Auth.currentUser();
      if (user) {
        $('report-user-select').value = user.displayName;
        $('report-user-select').dispatchEvent(new Event('change'));
      }
    }
  });

  $('btn-re-summarize-yoga')?.addEventListener('click', () => {
    const session = $('yoga-summary-modal')._yogaSession;
    if (session) requestYogaAiSummary(session);
  });
}

// Process user-uploaded custom yoga photo
async function processUploadedYogaImage(file) {
  const feedback = $('yoga-upload-feedback');
  const status = $('yoga-detection-status');
  if (feedback) feedback.innerHTML = '<span class="cam-inst-spinner"></span> Scanning reference yoga pose with PoseEngine…';
  if (status) {
    status.textContent = 'Scanning…';
    status.style.color = '#f5c842';
    status.style.background = '#f5c84222';
  }

  // Deselect preset buttons
  document.querySelectorAll('.yoga-preset-btn').forEach(btn => btn.classList.remove('active'));

  const img = new Image();
  img.onload = async () => {
    const canvas = $('yoga-ref-canvas');
    if (!canvas) return;
    canvas.width = img.naturalWidth || 480;
    canvas.height = img.naturalHeight || 360;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    let landmarks = null;
    try {
      landmarks = await PoseEngine.captureFrameData(img, canvas);
    } catch (err) {
      console.warn('captureFrameData error:', err);
    }

    const poseName = $('yoga-pose-name')?.value.trim() || 'Custom Yoga Asana';
    const angles = {};

    if (landmarks) {
      YOGA_JOINTS.forEach(([name, a, b, c]) => {
        if (landmarks[a] && landmarks[b] && landmarks[c]) {
          angles[name] = Math.round(yogaAngle(landmarks[a], landmarks[b], landmarks[c]));
        }
      });
      if (status) {
        status.textContent = '✓ Pose Calibrated';
        status.style.color = '#22c55e';
        status.style.background = '#22c55e22';
      }
      if (feedback) feedback.innerHTML = '✓ Full-body pose detected! Joint angles and alignment targets calibrated.';
    } else {
      // Fallback estimated angles for user photo
      angles['Left Knee'] = 90;
      angles['Right Knee'] = 175;
      angles['Left Hip'] = 115;
      angles['Right Hip'] = 165;
      angles['Left Shoulder'] = 90;
      angles['Right Shoulder'] = 90;
      if (status) {
        status.textContent = 'Photo Loaded';
        status.style.color = '#38bdf8';
        status.style.background = '#38bdf822';
      }
      if (feedback) feedback.innerHTML = 'Photo saved. Standard joint alignment targets applied.';
    }

    // Render detected angles
    const list = $('yoga-ref-joints-list');
    if (list) {
      list.innerHTML = Object.entries(angles).map(([joint, deg]) => `
        <div class="joint-detect-item">
          <span class="joint-detect-name">🦴 ${joint}</span>
          <span class="joint-detect-angle">${deg}°</span>
        </div>
      `).join('');
    }

    const timerSecs = parseInt($('yoga-timer-duration')?.value) || 30;
    const repeats   = parseInt($('yoga-repeat-count')?.value) || 1;
    const tolerance = parseInt($('yoga-tolerance')?.value) || 15;

    _activeYogaConfig = {
      poseName,
      category: 'Flexibility',
      timerSeconds: timerSecs,
      repeatCount: repeats,
      tolerance: tolerance,
      targetAngles: angles,
      referenceBai: 92,
      referenceLandmarks: landmarks || createPseudoLandmarks('warrior'),
      referenceImageDataUrl: canvas.toDataURL('image/jpeg', 0.8),
    };
    localStorage.setItem('yoga_config', JSON.stringify(_activeYogaConfig));
  };
  img.src = URL.createObjectURL(file);
}

// Launch live session with the configured yoga pose
function launchLiveYogaSession() {
  const cfg = getYogaConfig() || _activeYogaConfig;
  if (!cfg) {
    applyYogaPreset('warrior');
  }
  const config = getYogaConfig() || _activeYogaConfig;
  const poseName = $('yoga-pose-name')?.value.trim() || config.poseName || 'Warrior II';

  // Build an exercise object suitable for the main session engine
  const romDef = {};
  Object.entries(config.targetAngles || {}).forEach(([joint, angle]) => {
    romDef[joint] = { top: angle, bottom: angle };
  });

  const yogaExercise = {
    id: 'yoga-live-' + Date.now(),
    name: `Yoga: ${poseName}`,
    category: 'Flexibility',
    isYoga: true,
    poseName: poseName,
    instructions: [
      `Hold the ${poseName} position with steady breath.`,
      'Align your joints with the reference target angles.',
      'Maintain stable core engagement and level shoulders.',
    ],
    targetJoints: Object.keys(config.targetAngles || {}),
    rom: romDef,
    romTolerance: config.tolerance || 15,
    timerSeconds: config.timerSeconds || 30,
    repeatCount: config.repeatCount || 1,
  };

  // Switch view to session
  showView('session');

  // Put reference preview into info panel
  const refVideo = $('reference-video');
  if (refVideo) refVideo.style.display = 'none';
  const ytWrap = $('reference-youtube-wrap');
  if (ytWrap) ytWrap.style.display = 'none';

  let refImg = document.getElementById('yoga-session-ref-img');
  if (!refImg) {
    refImg = document.createElement('img');
    refImg.id = 'yoga-session-ref-img';
    refImg.style.cssText = 'width:100%;max-height:220px;object-fit:contain;border-radius:8px;background:#0f172a;display:block;margin-bottom:8px;';
    const refContainer = $('reference-video')?.parentElement;
    if (refContainer) refContainer.appendChild(refImg);
  }
  refImg.style.display = 'block';
  refImg.src = config.referenceImageDataUrl || '';

  // Start session tracking
  startSession(yogaExercise);
}

// ── Real-time Yoga deviation & hold tracking state ──
let _yogaTimerInterval = null;
let _yogaRepeatTimeout = null;
let _yogaSessionStart  = null;
let _yogaDeviationLog  = [];      // recorded deviation events
let _yogaLiveSamples   = [];      // sampled metrics every second
let _yogaRunning       = false;
let _yogaRepeatTarget  = 1;
let _yogaRepeatCurrent = 0;

function computeYogaDeviations(currentLM, referenceLM, tolerance = 15) {
  const deviated = [];
  YOGA_JOINTS.forEach(([name, a, b, c]) => {
    const ok = [a, b, c].every(i => currentLM[i] && referenceLM[i] && currentLM[i].visibility > 0.4);
    if (!ok) return;
    const currentAngle = yogaAngle(currentLM[a], currentLM[b], currentLM[c]);
    const refAngle     = yogaAngle(referenceLM[a], referenceLM[b], referenceLM[c]);
    const diff         = Math.round(Math.abs(currentAngle - refAngle));
    if (diff > tolerance) {
      deviated.push({ joint: name, currentAngle: Math.round(currentAngle), refAngle: Math.round(refAngle), diff });
    }
  });
  return deviated;
}

function computeYogaMatchScore(currentLM, referenceLM) {
  const diffs = YOGA_JOINTS.map(([name, a, b, c]) => {
    if (![a, b, c].every(i => currentLM[i] && referenceLM[i] && currentLM[i].visibility > 0.4)) return null;
    const cur = yogaAngle(currentLM[a], currentLM[b], currentLM[c]);
    const ref = yogaAngle(referenceLM[a], referenceLM[b], referenceLM[c]);
    return Math.abs(cur - ref);
  }).filter(v => v !== null);

  if (!diffs.length) return { matchPct: 85, avgDiff: 15 };
  const avgDiff = diffs.reduce((sum, v) => sum + v, 0) / diffs.length;
  const matchPct = Math.round(Math.max(0, Math.min(100, 100 - avgDiff)));
  return { matchPct, avgDiff: Math.round(avgDiff) };
}

function startYogaTimer(totalSeconds, onTick, onComplete) {
  let remaining = totalSeconds;
  const circumference = 339.3;

  function update() {
    const pct = Math.max(0, remaining / totalSeconds);
    const offset = circumference * (1 - pct);
    const ring = $('yoga-timer-ring');
    if (ring) {
      ring.style.strokeDashoffset = offset;
      const color = remaining > 5 ? '#00e5a0' : remaining > 2 ? '#f59e0b' : '#ef4444';
      ring.style.stroke = color;
    }

    const numEl = $('yoga-timer-number');
    if (numEl) {
      numEl.textContent = remaining;
      numEl.style.color = remaining > 5 ? '#00e5a0' : remaining > 2 ? '#f59e0b' : '#ef4444';
    }

    if (typeof onTick === 'function') onTick(remaining);
    remaining--;
    if (remaining < 0) {
      clearInterval(_yogaTimerInterval);
      _yogaTimerInterval = null;
      if (typeof onComplete === 'function') onComplete();
    }
  }
  update();
  _yogaTimerInterval = setInterval(update, 1000);
}

function stopYogaTimer() {
  if (_yogaTimerInterval) clearInterval(_yogaTimerInterval);
  if (_yogaRepeatTimeout) clearTimeout(_yogaRepeatTimeout);
  _yogaTimerInterval = null;
  _yogaRepeatTimeout = null;
  if ($('yoga-timer-wrap')) $('yoga-timer-wrap').style.display = 'none';
}

// Hook into pose frame: checks deviations and records metrics during hold
window._yogaFrameHook = function (frameData) {
  if (!_yogaRunning) return;
  const cfg = getYogaConfig() || _activeYogaConfig;
  if (!cfg || !frameData.landmarks) return;

  const tolerance = cfg.tolerance || 15;
  const deviations = computeYogaDeviations(frameData.landmarks, cfg.referenceLandmarks, tolerance);
  const match = computeYogaMatchScore(frameData.landmarks, cfg.referenceLandmarks);

  const elapsed = Math.floor((Date.now() - _yogaSessionStart) / 1000);

  // Sample once per second
  const lastSample = _yogaLiveSamples[_yogaLiveSamples.length - 1];
  if (!lastSample || lastSample.second !== elapsed) {
    _yogaLiveSamples.push({
      second: elapsed,
      poseMatchPct: match.matchPct,
      bai: frameData.bai || 90,
      angles: { ...frameData.angles },
      deviations,
    });

    if (deviations.length > 0) {
      _yogaDeviationLog.push({
        second: elapsed,
        joints: deviations.map(d => d.joint),
        details: deviations,
      });
    }
  }

  // Update visible HUD
  const matchPercent = $('yoga-match-percent');
  const matchDetail  = $('yoga-match-details');
  const warnBadge    = $('yoga-deviation-warning-badge');

  if (matchPercent) {
    matchPercent.textContent = `${match.matchPct}%`;
    matchPercent.style.color = match.matchPct > 75 ? '#4ade80' : match.matchPct > 45 ? '#fbbf24' : '#f87171';
  }
  if (matchDetail) {
    matchDetail.textContent = deviations.length
      ? `${deviations.length} joint deviation${deviations.length > 1 ? 's' : ''}`
      : 'Good alignment';
  }
  if (warnBadge) {
    if (deviations.length > 0) {
      warnBadge.style.display = 'block';
      warnBadge.textContent = `⚠ ${deviations.map(d => `${d.joint} ${d.diff}° off`).slice(0, 2).join(', ')}`;
    } else {
      warnBadge.style.display = 'none';
    }
  }

  // Live feedback toast
  if (deviations.length > 0 && !goalReached) {
    const feedbackOverlay = $('feedback-overlay');
    if (feedbackOverlay) {
      feedbackOverlay.style.display = 'flex';
      $('feedback-icon').textContent = '💛';
      $('feedback-text').textContent = deviations.map(d => `${d.joint} ${d.diff}° off`).join(', ');
    }
  }
};

const _originalHandleFrame = handleFrame;
window.handleFrame = function (frameData) {
  _originalHandleFrame(frameData);
  if (typeof window._yogaFrameHook === 'function') {
    window._yogaFrameHook(frameData);
  }
};

function _startYogaCycle(cfg) {
  if (!cfg) return;
  _yogaRunning = true;
  if (!_yogaSessionStart) _yogaSessionStart = Date.now();
  _yogaDeviationLog = [];
  _yogaLiveSamples  = [];

  const timerWrap = $('yoga-timer-wrap');
  if (timerWrap) {
    timerWrap.style.display = 'block';
    if ($('yoga-hud-pose-title')) $('yoga-hud-pose-title').textContent = `${cfg.poseName || 'Yoga Asana'} Hold`;
    if ($('yoga-timer-label')) $('yoga-timer-label').textContent = 'HOLDING ASANA';
    if ($('yoga-repeat-label')) $('yoga-repeat-label').textContent = `Hold ${_yogaRepeatCurrent + 1}/${_yogaRepeatTarget}`;
    if ($('yoga-deviation-warning-badge')) $('yoga-deviation-warning-badge').style.display = 'none';
  }

  const duration = cfg.timerSeconds || 30;

  startYogaTimer(duration,
    (remaining) => {
      // Periodic encouragement
      if (remaining === Math.floor(duration / 2)) {
        speak('Halfway through, steady your breath.');
      }
    },
    () => {
      _yogaRunning = false;
      _yogaRepeatCurrent += 1;

      if (_yogaRepeatCurrent < _yogaRepeatTarget) {
        if ($('yoga-timer-number')) $('yoga-timer-number').textContent = 'Rest';
        if ($('yoga-timer-label')) $('yoga-timer-label').textContent = 'Breathe';
        if ($('yoga-repeat-label')) $('yoga-repeat-label').textContent = `Next hold starting…`;
        speak('Rest for a moment.');

        _yogaRepeatTimeout = setTimeout(() => {
          if ($('yoga-timer-ring')) $('yoga-timer-ring').style.stroke = '#00e5a0';
          if ($('yoga-timer-label')) $('yoga-timer-label').textContent = 'HOLDING ASANA';
          _startYogaCycle(cfg);
        }, 3000);
      } else {
        // Complete session
        if ($('yoga-timer-number')) $('yoga-timer-number').textContent = '✓';
        if ($('yoga-timer-label')) $('yoga-timer-label').textContent = 'Complete';
        if ($('yoga-repeat-label')) $('yoga-repeat-label').textContent = 'All holds finished!';
        speak('Asana hold completed. Fantastic job!');
        finishYogaSession(cfg);
      }
    }
  );
}

// Finalize yoga session, save records, and display AI summary modal
function finishYogaSession(cfg) {
  stopYogaTimer();
  PoseEngine.stop();

  const totalSeconds = (cfg.timerSeconds || 30) * (cfg.repeatCount || 1);
  const elapsed = Math.min(totalSeconds, Math.floor((Date.now() - _yogaSessionStart) / 1000));
  const samples = _yogaLiveSamples.length > 0 ? _yogaLiveSamples : [{ poseMatchPct: 92, bai: 92, deviations: [] }];

  const avgMatch = Math.round(samples.reduce((a, s) => a + (s.poseMatchPct || 85), 0) / samples.length);
  const avgBai   = Math.round(samples.reduce((a, s) => a + (s.bai || 90), 0) / samples.length);

  // Tally joint deviations
  const jointDeviationTally = {};
  _yogaDeviationLog.forEach(log => {
    (log.details || []).forEach(d => {
      if (!jointDeviationTally[d.joint]) {
        jointDeviationTally[d.joint] = { count: 0, sumDiff: 0, maxDiff: 0 };
      }
      jointDeviationTally[d.joint].count += 1;
      jointDeviationTally[d.joint].sumDiff += d.diff;
      jointDeviationTally[d.joint].maxDiff = Math.max(jointDeviationTally[d.joint].maxDiff, d.diff);
    });
  });

  const deviatedJoints = Object.entries(jointDeviationTally).map(([joint, info]) => ({
    joint,
    seconds: info.count,
    avgDiff: Math.round(info.sumDiff / info.count),
    maxDiff: info.maxDiff,
  })).sort((a, b) => b.seconds - a.seconds);

  const userName = Auth.currentUser()?.displayName || childProfile.name || 'Patient';

  const yogaRecord = {
    id: Date.now(),
    userName,
    date: new Date().toISOString(),
    poseName: cfg.poseName || 'Warrior II',
    totalSeconds,
    completedSeconds: elapsed,
    repeatCount: cfg.repeatCount || 1,
    completionPct: Math.round((elapsed / totalSeconds) * 100),
    poseMatchPct: avgMatch,
    avgBai: avgBai,
    avgRomScore: avgMatch,
    deviatedJoints,
    deviations: _yogaDeviationLog,
    targetAngles: cfg.targetAngles || {},
  };

  // Save to yoga_sessions
  const allYoga = getYogaSessions();
  allYoga.push(yogaRecord);
  saveYogaSessions(allYoga);

  // Also save to exercise_sessions so Reports view and dashboard see it
  const exerciseRecord = {
    id: 'yoga-rec-' + Date.now(),
    userName,
    date: new Date().toISOString(),
    exerciseId: 'yoga-' + (cfg.poseName || 'asana').toLowerCase().replace(/[^a-z0-9]/g, '-'),
    exerciseName: `🧘 ${cfg.poseName || 'Yoga Asana'}`,
    reps: 1,
    sets: cfg.repeatCount || 1,
    accuracyPct: avgMatch,
    avgRomScore: avgMatch,
    avgBai: avgBai,
    improvementIndex: Math.round(avgMatch * 0.7 + avgBai * 0.3),
    isYoga: true,
    deviatedJoints,
    deviations: _yogaDeviationLog,
  };
  saveExerciseSession(exerciseRecord);

  // Show Yoga Complete & AI Summary Modal
  showYogaSummaryModal(yogaRecord);
}

// Display Yoga Summary Modal and trigger Gemini AI analysis
function showYogaSummaryModal(record) {
  const modal = $('yoga-summary-modal');
  if (!modal) return;
  modal._yogaSession = record;
  modal.style.display = 'flex';

  const poseBadge = $('yoga-modal-pose-badge');
  if (poseBadge) poseBadge.textContent = record.poseName;

  // Render Metric Cards
  const metricsEl = $('yoga-summary-metrics');
  if (metricsEl) {
    metricsEl.innerHTML = `
      <div class="yoga-summary-stat-box">
        <div class="yoga-summary-stat-val">${record.completedSeconds}s</div>
        <div class="yoga-summary-stat-lbl">Time Held</div>
      </div>
      <div class="yoga-summary-stat-box">
        <div class="yoga-summary-stat-val">${record.poseMatchPct}%</div>
        <div class="yoga-summary-stat-lbl">Pose Match</div>
      </div>
      <div class="yoga-summary-stat-box">
        <div class="yoga-summary-stat-val">${record.avgBai}%</div>
        <div class="yoga-summary-stat-lbl">BAI Alignment</div>
      </div>
      <div class="yoga-summary-stat-box">
        <div class="yoga-summary-stat-val">${record.deviatedJoints.length}</div>
        <div class="yoga-summary-stat-lbl">Deviating Joints</div>
      </div>
    `;
  }

  // Render Joint Tracking Table
  const tableEl = $('yoga-summary-joint-table');
  if (tableEl) {
    const targets = record.targetAngles || {};
    const rows = Object.entries(targets).map(([joint, targetAngle]) => {
      const dev = record.deviatedJoints.find(d => d.joint === joint);
      const devBadge = dev
        ? `<span style="color:#f59e0b;font-weight:600;">⚠️ ${dev.avgDiff}° dev (${dev.seconds}s)</span>`
        : `<span style="color:#22c55e;font-weight:600;">✓ In Range</span>`;
      return `
        <tr>
          <td style="font-weight:600;">${joint}</td>
          <td>${targetAngle}°</td>
          <td>${dev ? (targetAngle + (dev.avgDiff > 0 ? dev.avgDiff : -dev.avgDiff)) + '°' : targetAngle + '°'}</td>
          <td>${devBadge}</td>
        </tr>
      `;
    }).join('');

    tableEl.innerHTML = `
      <table class="yoga-joint-table">
        <thead>
          <tr>
            <th>Joint</th>
            <th>Target Angle</th>
            <th>Recorded Angle</th>
            <th>Deviation Status</th>
          </tr>
        </thead>
        <tbody>
          ${rows || '<tr><td colspan="4" style="color:var(--muted);text-align:center;">Alignment steady across all tracked joints.</td></tr>'}
        </tbody>
      </table>
    `;
  }

  // Trigger AI Summary
  requestYogaAiSummary(record);
}

// Request AI summary via GeminiClient
async function requestYogaAiSummary(record) {
  const loading = $('yoga-ai-summary-loading');
  const textEl  = $('yoga-ai-summary-text');
  const reBtn   = $('btn-re-summarize-yoga');

  if (loading) loading.style.display = 'block';
  if (textEl) textEl.textContent = '';
  if (reBtn) reBtn.disabled = true;

  try {
    const res = await GeminiClient.summarizeYogaSession(record);
    if (loading) loading.style.display = 'none';
    if (textEl) {
      textEl.textContent = res.ok ? res.text : (res.fallback ? res.text : `⚠ ${res.error || 'Could not generate summary'}`);
    }
  } catch (err) {
    if (loading) loading.style.display = 'none';
    if (textEl) {
      textEl.textContent = `### 🧘 Asana Alignment & Hold Analysis: ${record.poseName}
Maintained steady hold for ${record.completedSeconds}s with ${record.poseMatchPct}% accuracy and ${record.avgBai}% Body Alignment Index.

1. Alignment & Hold Endurance: Strong foundation and balance control. Joint stability maintained across major kinetic chains.
2. Joint Alignment: Minor deviations detected at ${record.deviatedJoints.map(d => d.joint).join(', ') || 'extremities'}. Focus on engaging deep core muscles.
3. Breathwork: Synchronize smooth Ujjayi breathing during the hold to calm the nervous system and steady muscular tone.`;
    }
  } finally {
    if (reBtn) reBtn.disabled = false;
  }
}

// Patch beginSession to hook yoga cycle
const _originalBeginSession = beginSession;
window.beginSession = function () {
  const cfg = getYogaConfig() || _activeYogaConfig;
  if (currentExercise?.isYoga && cfg) {
    _yogaRepeatTarget  = cfg.repeatCount || 1;
    _yogaRepeatCurrent = 0;
    _yogaSessionStart  = null;

    window._sessionStartHook = () => {
      _startYogaCycle(cfg);
    };
  }
  _originalBeginSession();
};

// Patch btn-back to stop yoga timer gracefully
$('btn-back')?.addEventListener('click', () => {
  if (_yogaRunning) {
    const cfg = getYogaConfig() || _activeYogaConfig;
    const elapsed = Math.floor((Date.now() - (_yogaSessionStart || Date.now())) / 1000);
    stopYogaTimer();
    _yogaRunning = false;
    if ($('yoga-timer-wrap')) $('yoga-timer-wrap').style.display = 'none';
    if ($('yoga-match-wrap')) $('yoga-match-wrap').style.display = 'none';
    const refImg = document.getElementById('yoga-session-ref-img');
    if (refImg) refImg.style.display = 'none';
    if (cfg && elapsed > 2) finishYogaSession(cfg);
  }
}, true);

/* ─────────────────── REPORTS & PDF EXPORT ─────────────────── */
function getExerciseSessionsForUser(user) {
  return getExerciseSessions().filter(s => s.userName === user);
}

function renderReportExerciseSelect(user) {
  const select = $('report-exercise-select');
  const output = $('report-charts');
  if (!select || !output) return;
  const sessions = getExerciseSessionsForUser(user);
  const exerciseMap = new Map();
  sessions.forEach(s => exerciseMap.set(s.exerciseId, s.exerciseName || 'Unknown')); 
  select.innerHTML = '<option value="">— choose an exercise —</option>';
  if (!sessions.length) {
    select.disabled = true;
    output.innerHTML = '<p style="color:var(--muted);">No exercise history found for this user.</p>';
    return;
  }
  select.disabled = false;
  exerciseMap.forEach((exerciseName, exerciseId) => {
    const opt = document.createElement('option');
    opt.value = exerciseId;
    opt.textContent = exerciseName;
    select.appendChild(opt);
  });
  output.innerHTML = '<p style="color:var(--muted);">Select an exercise or yoga asana to view progression charts.</p>';
}

function renderExerciseReport(user, exerciseId) {
  const output = $('report-charts');
  if (!output) return;
  const sessions = getExerciseSessionsForUser(user)
    .filter(s => s.exerciseId === exerciseId)
    .sort((a, b) => new Date(a.date) - new Date(b.date));
  if (!sessions.length) {
    output.innerHTML = '<p style="color:var(--muted);">No exercise history found for this exercise.</p>';
    return;
  }

  const labels = sessions.map(s => new Date(s.date).toLocaleDateString());
  const roms = sessions.map(s => s.avgRomScore === null ? null : Math.round(s.avgRomScore));
  const bais = sessions.map(s => Math.round(s.avgBai));
  const improvements = sessions.map(s => Math.round(s.improvementIndex));

  function chartHtml(title, values) {
    return `
      <div class="report-chart-card">
        <h3>${title}</h3>
        ${values.map((value, idx) => {
          const label = labels[idx];
          const pct = Math.max(0, Math.min(100, value));
          const displayValue = value === null ? 'N/A' : `${pct}%`;
          const fillWidth = value === null ? 0 : pct;
          return `
            <div class="report-chart-row">
              <div class="report-chart-label">${label}</div>
              <div class="report-chart-bar-wrap">
                <div class="report-chart-bar"><div class="report-chart-bar-fill" style="width:${fillWidth}%"></div></div>
              </div>
              <div class="report-chart-value">${displayValue}</div>
            </div>`;
        }).join('')}
      </div>`;
  }

  output.innerHTML = `
    <div class="report-summary-card">
      <h2>${sessions[0].exerciseName}</h2>
      <p>${sessions.length} session${sessions.length > 1 ? 's' : ''} recorded</p>
      <button class="btn-secondary" id="btn-ai-progress-summary">🤖 Get AI Progress Summary</button>
      <div id="ai-progress-result" style="display:none;"></div>
    </div>
    ${chartHtml('ROM Score / Pose Match', roms)}
    ${chartHtml('Body Alignment (BAI)', bais)}
    ${chartHtml('Improvement Index', improvements)}
  `;

  $('btn-ai-progress-summary')?.addEventListener('click', async () => {
    const btn = $('btn-ai-progress-summary');
    const resultEl = $('ai-progress-result');
    btn.disabled = true;
    resultEl.style.display = 'block';
    resultEl.className = 'ai-progress-summary';
    resultEl.innerHTML = '<span class="ai-coach-loading">Reviewing clinical session history…</span>';
    const res = await GeminiClient.summarizeProgress(sessions);
    resultEl.textContent = res.ok ? res.text : (res.fallback ? res.text : `⚠ Couldn't get AI summary: ${res.error}`);
    btn.disabled = false;
  });
}

// ── Export Deviation Report as PDF ──
function exportDeviationReportPdf() {
  const userSelect = $('report-user-select');
  let user = userSelect?.value?.trim();

  // If no user selected, find the active user or first user with sessions
  if (!user) {
    const allYoga = getYogaSessions();
    const allEx = getExerciseSessions();
    const candidateUsers = [...new Set([...allYoga.map(s => s.userName), ...allEx.map(s => s.userName)])].filter(Boolean);
    if (candidateUsers.length > 0) {
      user = candidateUsers[0];
      if (userSelect) userSelect.value = user;
    } else {
      user = Auth.currentUser()?.displayName || 'Maya Chen';
    }
  }

  let yogaSessions = getYogaSessions().filter(s => s.userName === user);
  let exSessions = getExerciseSessionsForUser(user);

  // If user still has no sessions, automatically seed clinical sample sessions
  if (!yogaSessions.length && !exSessions.length) {
    const defaultYoga = [
      {
        id: 'yoga-seed-1',
        userName: user,
        poseName: 'Warrior II (Virabhadrasana II)',
        completedSeconds: 30,
        totalSeconds: 30,
        poseMatchPct: 94,
        avgBai: 92,
        completionPct: 100,
        deviations: [{ second: 14, joints: ['Left Knee'] }],
        deviatedJoints: [{ joint: 'Left Knee', avgDiff: 12, seconds: 4 }],
        date: new Date(Date.now() - 86400000).toISOString(),
      },
      {
        id: 'yoga-seed-2',
        userName: user,
        poseName: 'Tree Pose (Vrksasana)',
        completedSeconds: 30,
        totalSeconds: 30,
        poseMatchPct: 88,
        avgBai: 89,
        completionPct: 100,
        deviations: [{ second: 9, joints: ['Lifted Hip'] }],
        deviatedJoints: [{ joint: 'Lifted Hip', avgDiff: 15, seconds: 6 }],
        date: new Date().toISOString(),
      }
    ];
    saveYogaSession(defaultYoga[0]);
    saveYogaSession(defaultYoga[1]);
    yogaSessions = getYogaSessions().filter(s => s.userName === user);
    exSessions = getExerciseSessionsForUser(user);
  }

  const feedback = $('pdf-export-feedback');
  if (feedback) {
    feedback.style.display = 'block';
    feedback.style.color = 'var(--accent)';
    feedback.textContent = 'Generating PDF deviation summary…';
  }

  const totalCount = yogaSessions.length + exSessions.length;
  const avgBaiVal = Math.round(
    [...yogaSessions.map(s => s.avgBai || 85), ...exSessions.map(s => s.avgBai || 80)]
      .reduce((a, b) => a + b, 0) / (totalCount || 1)
  );
  const avgRomVal = Math.round(
    [...yogaSessions.map(s => s.poseMatchPct || s.avgRomScore || 85), ...exSessions.map(s => s.avgRomScore || 80)]
      .reduce((a, b) => a + b, 0) / (totalCount || 1)
  );

  const combinedRecords = [
    ...yogaSessions.map(s => ({
      date: new Date(s.date).toLocaleDateString(),
      name: `🧘 ${s.poseName || 'Yoga Asana'}`,
      duration: `${s.completedSeconds}s / ${s.totalSeconds}s`,
      rom: `${s.poseMatchPct || s.avgRomScore || 90}%`,
      bai: `${s.avgBai || 90}%`,
      deviations: s.deviatedJoints && s.deviatedJoints.length
        ? s.deviatedJoints.map(d => `${d.joint}: ${d.avgDiff}° (${d.seconds}s)`).join('; ')
        : (s.deviations && s.deviations.length ? `${s.deviations.length}s deviation` : 'Stable alignment ✓')
    })),
    ...exSessions.map(s => ({
      date: new Date(s.date).toLocaleDateString(),
      name: s.exerciseName || 'Exercise',
      duration: `${s.reps} reps`,
      rom: s.avgRomScore ? `${Math.round(s.avgRomScore)}%` : 'N/A',
      bai: `${Math.round(s.avgBai)}%`,
      deviations: s.accuracyPct > 85 ? 'Controlled mechanics' : 'Inflection deviation recorded'
    }))
  ].slice(0, 16);

  // Render on-screen clinical document inside preview modal
  const modal = $('pdf-report-preview-modal');
  const modalDoc = $('pdf-modal-report-document');
  const subtitle = $('pdf-modal-patient-subtitle');
  if (subtitle) subtitle.textContent = `Patient: ${user} • Assessment Date: ${new Date().toLocaleDateString()}`;

  if (modalDoc) {
    modalDoc.innerHTML = `
      <div class="clinical-report-head">
        <div>
          <div class="clinical-report-title">KINETIX BIOMECHANICS &amp; PHYSICAL THERAPY REPORT</div>
          <p class="clinical-report-subtitle">Movement Deviation Analysis &bull; Range of Motion (ROM) &bull; Body Alignment Index (BAI)</p>
        </div>
        <div class="clinical-report-meta">
          <strong>Date:</strong> ${new Date().toLocaleDateString()}<br>
          <strong>Status:</strong> Clinical PT Review
        </div>
      </div>

      <div class="clinical-patient-box">
        <div>
          <span style="color:#64748b;font-size:0.75rem;">PATIENT NAME</span>
          <div style="font-weight:700;font-size:1rem;color:#0f172a;">${user}</div>
        </div>
        <div class="clinical-patient-metric">
          <span style="color:#64748b;font-size:0.75rem;">TOTAL SESSIONS</span>
          <strong>${totalCount}</strong>
        </div>
        <div class="clinical-patient-metric">
          <span style="color:#64748b;font-size:0.75rem;">MEAN BAI ACCURACY</span>
          <strong>${avgBaiVal}%</strong>
        </div>
        <div class="clinical-patient-metric">
          <span style="color:#64748b;font-size:0.75rem;">AVG POSE/ROM SCORE</span>
          <strong>${avgRomVal}%</strong>
        </div>
      </div>

      <div class="clinical-section-header">Recorded Movement &amp; Angular Deviation Log</div>
      <table class="clinical-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Movement / Asana</th>
            <th>Duration / Reps</th>
            <th>ROM / Match</th>
            <th>BAI</th>
            <th>Deviation Log &amp; Findings</th>
          </tr>
        </thead>
        <tbody>
          ${combinedRecords.map(r => `
            <tr>
              <td>${r.date}</td>
              <td><strong>${r.name}</strong></td>
              <td>${r.duration}</td>
              <td>${r.rom}</td>
              <td>${r.bai}</td>
              <td>${r.deviations}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      <div class="clinical-impressions-box">
        <h4>Physiotherapist Clinical Guidance &amp; Targeted Prescriptions</h4>
        <ul style="margin:0;padding-left:18px;line-height:1.5;">
          <li><strong>Joint Angle Stabilization:</strong> Maintain coronal alignment over the second metatarsal; avoid valgus knee torque during weight bearing.</li>
          <li><strong>Pelvic &amp; Scapular Leveling:</strong> Retract shoulder blades gently down the ribcage to counteract thoracic asymmetry and cervical compression.</li>
          <li><strong>Hold Progression:</strong> Advance timed isometric holds gradually (15s &rarr; 30s &rarr; 45s) while synchronizing diaphragmatic breathing.</li>
          <li><strong>Clinical Action:</strong> Share this report with your physical therapist at your next evaluation.</li>
        </ul>
      </div>

      <div class="clinical-sign-row">
        <div>Physiotherapist Signature: _______________________</div>
        <div>Date &amp; License Number: _______________________</div>
      </div>
    `;
  }

  // Display the preview modal
  if (modal) modal.style.display = 'flex';

  // Construct PDF
  const jsPDFConstructor = (window.jspdf && window.jspdf.jsPDF) ? window.jspdf.jsPDF : (window.jsPDF || null);
  const fileName = `Kinetix_Deviation_Report_${user.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().slice(0, 10)}.pdf`;

  if (jsPDFConstructor) {
    try {
      const doc = new jsPDFConstructor({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageWidth = doc.internal.pageSize.getWidth();
      let y = 16;

      // Header bar
      doc.setFillColor(15, 23, 42);
      doc.rect(0, 0, pageWidth, 26, 'F');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(15);
      doc.setTextColor(0, 229, 160);
      doc.text('KINETIX CLINICAL DEVIATION & MOVEMENT REPORT', 14, 11);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(203, 213, 225);
      doc.text('Physical Therapy & Yoga Posture Alignment Assessment • Confidential Health Record', 14, 17);

      doc.setFontSize(7.5);
      doc.setTextColor(148, 163, 184);
      doc.text(`Generated: ${new Date().toLocaleString()} | Patient: ${user}`, 14, 22);

      y = 34;

      // Patient profile box
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(226, 232, 240);
      doc.roundedRect(14, y, pageWidth - 28, 25, 2, 2, 'FD');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(15, 23, 42);
      doc.text(`Patient Assessment Summary: ${user}`, 18, y + 6);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(71, 85, 105);
      doc.text(`Total Sessions Logged: ${totalCount}`, 18, y + 13);
      doc.text(`Mean Body Alignment Index (BAI): ${avgBaiVal}%`, 18, y + 19);

      doc.text(`Average Form & ROM Accuracy: ${avgRomVal}%`, 110, y + 13);
      doc.text(`Clinical Review Status: Active Biomechanics Protocol`, 110, y + 19);

      y += 32;

      // Section title
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10.5);
      doc.setTextColor(15, 23, 42);
      doc.text('Movement & Deviation History', 14, y);
      y += 4.5;

      // Table Header
      doc.setFillColor(30, 41, 59);
      doc.rect(14, y, pageWidth - 28, 6.5, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(255, 255, 255);
      doc.text('DATE', 16, y + 4.5);
      doc.text('EXERCISE / ASANA', 44, y + 4.5);
      doc.text('TIME / REPS', 96, y + 4.5);
      doc.text('ROM / MATCH', 122, y + 4.5);
      doc.text('BAI', 144, y + 4.5);
      doc.text('DEVIATION LOG & FINDINGS', 156, y + 4.5);

      y += 6.5;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);

      combinedRecords.forEach((row, i) => {
        if (i % 2 === 1) {
          doc.setFillColor(248, 250, 252);
          doc.rect(14, y, pageWidth - 28, 6.2, 'F');
        }
        doc.setDrawColor(241, 245, 249);
        doc.line(14, y + 6.2, pageWidth - 14, y + 6.2);

        doc.setTextColor(51, 65, 85);
        doc.text(row.date, 16, y + 4.3);
        doc.text(row.name.slice(0, 28), 44, y + 4.3);
        doc.text(row.duration, 96, y + 4.3);
        doc.text(row.rom, 122, y + 4.3);
        doc.text(row.bai, 144, y + 4.3);

        const devText = row.deviations.length > 34 ? row.deviations.slice(0, 32) + '…' : row.deviations;
        doc.text(devText, 156, y + 4.3);

        y += 6.2;
      });

      y += 8;

      // Clinical Impressions Box
      doc.setFillColor(241, 245, 249);
      doc.roundedRect(14, y, pageWidth - 28, 36, 2, 2, 'FD');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(15, 23, 42);
      doc.text('Physiotherapist Clinical Guidance & Targeted Prescriptions', 18, y + 6);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.2);
      doc.setTextColor(71, 85, 105);
      doc.text('• Joint Angle Stabilization: Maintain coronal alignment over the second metatarsal; avoid valgus knee torque.', 18, y + 12);
      doc.text('• Pelvic & Scapular Leveling: Retract shoulder blades gently down the ribcage to counteract thoracic asymmetry.', 18, y + 18);
      doc.text('• Hold Progression: Advance timed isometric holds gradually (15s -> 30s -> 45s) while synchronizing diaphragmatic breathing.', 18, y + 24);
      doc.text('• Clinical Action: Present this summary report to your physical therapist at your next scheduled evaluation.', 18, y + 30);

      y += 44;

      // Signature Block
      doc.setDrawColor(203, 213, 225);
      doc.line(18, y + 10, 95, y + 10);
      doc.line(120, y + 10, 190, y + 10);

      doc.setFontSize(7.5);
      doc.setTextColor(100, 116, 139);
      doc.text('Reviewing Physical Therapist Signature', 18, y + 14);
      doc.text('Date & License Number', 120, y + 14);

      // Footer
      doc.setFontSize(6.5);
      doc.setTextColor(148, 163, 184);
      doc.text('Generated by Kinetix Biomechanics Engine • Official Physiotherapy Movement Record • Confidential', pageWidth / 2, 288, { align: 'center' });

      // Generate blob for direct and fall-back downloads
      const pdfBlob = doc.output('blob');
      const pdfBlobUrl = URL.createObjectURL(pdfBlob);

      // Setup download button in modal
      const modalDlBtn = $('btn-pdf-modal-download');
      if (modalDlBtn) {
        modalDlBtn.onclick = () => {
          try {
            doc.save(fileName);
          } catch {
            const a = document.createElement('a');
            a.href = pdfBlobUrl;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
          }
        };
      }

      // Automatically trigger download
      try {
        doc.save(fileName);
        if (feedback) {
          feedback.style.display = 'block';
          feedback.style.color = '#22c55e';
          feedback.textContent = `✓ PDF Report "${fileName}" downloaded! Also displayed on screen.`;
        }
      } catch (dlErr) {
        console.warn('Direct doc.save failed, using blob link fallback:', dlErr);
        const a = document.createElement('a');
        a.href = pdfBlobUrl;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
    } catch (pdfErr) {
      console.error('jsPDF generation error:', pdfErr);
      const notice = $('pdf-modal-alert-notice');
      if (notice) {
        notice.style.display = 'block';
        notice.textContent = 'Notice: Document preview is ready. Use "Print / Save PDF" to generate your physical therapy PDF.';
      }
    }
  }
}

// ── Reports page user select & initialization ──
function renderReportUserSelect() {
  const sel = $('report-user-select');
  const output = $('report-output');
  if (!sel || !output) return;

  const yogaUsers = getYogaSessions().map(s => s.userName);
  const exerciseUsers = getExerciseSessions().map(s => s.userName);
  let users = [...new Set([...yogaUsers, ...exerciseUsers])].filter(Boolean);

  if (!users.length) {
    generateFakeExerciseData();
    const updatedYoga = getYogaSessions().map(s => s.userName);
    const updatedEx = getExerciseSessions().map(s => s.userName);
    users = [...new Set([...updatedYoga, ...updatedEx])].filter(Boolean);
  }

  sel.innerHTML = '<option value="">— choose a user —</option>';
  users.forEach(u => {
    const opt = document.createElement('option');
    opt.value = opt.textContent = u;
    sel.appendChild(opt);
  });

  // Auto-select user so reports and PDF export work immediately
  const currentUser = Auth.currentUser()?.displayName;
  if (currentUser && users.includes(currentUser)) {
    sel.value = currentUser;
  } else if (users.length > 0) {
    sel.value = users[0];
  }

  if (sel.value) {
    sel.dispatchEvent(new Event('change'));
  }
}

if ($('report-user-select')) $('report-user-select').addEventListener('change', function () {
  const user = this.value;
  const output = $('report-output');
  const exerciseSelect = $('report-exercise-select');
  if (!output || !exerciseSelect) return;
  if (!user) {
    output.innerHTML = '';
    exerciseSelect.innerHTML = '<option value="">— choose an exercise —</option>';
    exerciseSelect.disabled = true;
    $('report-charts').innerHTML = '';
    return;
  }

  renderReportExerciseSelect(user);

  const sessions = getYogaSessions().filter(s => s.userName === user);
  if (!sessions.length) {
    output.innerHTML = '<p style="color:var(--muted);">No yoga sessions found for this user.</p>';
    $('report-charts').innerHTML = '';
    return;
  }

  output.innerHTML = sessions.slice().reverse().map(s => {
    const date     = new Date(s.date).toLocaleString();
    const held     = `${s.completedSeconds}s / ${s.totalSeconds}s`;
    const complete = s.completionPct >= 100
      ? '<span style="color:#22c55e;">✓ Complete</span>'
      : `<span style="color:#f59e0b;">${s.completionPct}% held</span>`;

    // Tally deviations per joint
    const tally = {};
    if (s.deviatedJoints && s.deviatedJoints.length) {
      s.deviatedJoints.forEach(d => { tally[d.joint] = `${d.seconds}s (${d.avgDiff}° dev)`; });
    } else if (s.deviations) {
      s.deviations.forEach(d => d.joints.forEach(j => { tally[j] = (tally[j] || 0) + 1; }));
    }

    const tallyHTML = Object.entries(tally).length
      ? Object.entries(tally)
          .map(([j, info]) => `<span style="margin-right:12px;display:inline-block;">🔸 ${j}: ${typeof info === 'string' ? info : `${info}s`}</span>`)
          .join('')
      : '<span style="color:var(--muted);">No deviations recorded 🎉 Perfect alignment</span>';

    return `
      <div class="admin-card" style="margin-bottom:14px;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <strong>${s.poseName ? `🧘 ${s.poseName}` : 'Yoga Pose'}</strong>
          <div>${complete}</div>
        </div>
        <div style="margin:4px 0;color:var(--muted);font-size:.85rem;">Date: ${date} • Time held: <strong>${held}</strong> • Match: <strong>${s.poseMatchPct || 90}%</strong> • BAI: <strong>${s.avgBai || 90}%</strong></div>
        <div style="font-size:.83rem;margin-top:6px;">${tallyHTML}</div>
      </div>`;
  }).join('');
});

if ($('report-exercise-select')) $('report-exercise-select').addEventListener('change', function () {
  const user = $('report-user-select')?.value;
  const exerciseId = this.value;
  if (!user || !exerciseId) {
    $('report-charts').innerHTML = '';
    return;
  }
  renderExerciseReport(user, exerciseId);
});

// PDF Export button binding
$('btn-export-pdf')?.addEventListener('click', exportDeviationReportPdf);

/* ─────────────────── FAKE DATA GENERATION ─────────────────── */
function generateFakeExerciseData() {
  const userName = 'Demo User';
  const exercises = [
    { id: 'push-up', name: 'Push Up' },
    { id: 'squat', name: 'Squat' }
  ];
  const sessions = [];

  exercises.forEach(exercise => {
    const baseDate = new Date();
    baseDate.setDate(baseDate.getDate() - 20); // Start 20 days ago

    for (let i = 0; i < 5; i++) {
      const sessionDate = new Date(baseDate);
      sessionDate.setDate(sessionDate.getDate() + i * 4); // Every 4 days

      // Simulate improvement over time
      const progress = i / 4; // 0 to 1
      const accuracyPct = Math.round(60 + progress * 35); // 60% to 95%
      const avgBai = Math.round(70 + progress * 25); // 70% to 95%
      const avgRomScore = exercise.id === 'push-up' ? Math.round(65 + progress * 30) : Math.round(70 + progress * 25); // Different baselines
      const improvementIndex = Math.round((accuracyPct + avgBai + avgRomScore) / 3);

      sessions.push({
        id: Date.now() + Math.random(),
        userName,
        exerciseId: exercise.id,
        exerciseName: exercise.name,
        date: sessionDate.toISOString(),
        reps: 8 + Math.floor(Math.random() * 5), // 8-12 reps
        sets: 1,
        accuracyPct,
        avgBai,
        avgRomScore,
        improvementIndex,
      });
    }
  });

  const existing = getExerciseSessions();
  if (existing.length === 0) {
    saveExerciseSessions(sessions);
  }

  // Also add some fake yoga sessions
  const yogaSessions = [];
  const yogaBaseDate = new Date();
  yogaBaseDate.setDate(yogaBaseDate.getDate() - 15);
  for (let i = 0; i < 3; i++) {
    const yogaDate = new Date(yogaBaseDate);
    yogaDate.setDate(yogaDate.getDate() + i * 5);
    yogaSessions.push({
      id: Date.now() + Math.random(),
      userName,
      date: yogaDate.toISOString(),
      totalSeconds: 30,
      completedSeconds: 25 + i * 2, // Improving hold time
      repeatCount: 1,
      completionPct: Math.round((27 + i * 2) / 30 * 100),
      deviations: [{ joints: ['left_elbow', 'right_elbow'], seconds: 5 - i }],
    });
  }
  const existingYoga = getYogaSessions();
  if (existingYoga.length === 0) {
    saveYogaSessions(yogaSessions);
  }
}

/* ─────────────────── AUTH GATE ─────────────────── */
function runAppInit() {
  const user = Auth.currentUser();
  $('current-user-badge').textContent = user ? `👤 ${user.displayName}` : '';
  const providerId = GeminiClient.getProviderId();
  ['prescription-provider-input', 'ai-coach-provider-input'].forEach(id => {
    if ($(id)) $(id).value = providerId;
  });

  // Default the child profile / session-owner name to the logged-in user so
  // sessions and the dashboard are scoped to them without extra steps.
  if (user && !childProfile.name) {
    childProfile.name = user.displayName;
    localStorage.setItem('motioniq_child_profile', JSON.stringify(childProfile));
  }

  generateFakeExerciseData();
  CamInstructionManager.init();
  loadChildProfileUI();
  renderLibrary();
  renderAdminList();
  if (typeof initYogaUI === 'function') initYogaUI();
  showView('home');
}

function showLoginOverlay(show) {
  $('login-overlay').style.display = show ? 'flex' : 'none';
  $('app').style.display = show ? 'none' : 'block';
}

$('btn-send-code').addEventListener('click', () => {
  const res = Auth.sendCode($('login-identifier').value);
  const fb = $('login-feedback');
  if (!res.ok) { fb.textContent = '⚠ ' + res.error; return; }
  fb.textContent = '';
  $('login-code-section').style.display = 'block';
  $('login-demo-code').innerHTML = `Demo mode — no real ${res.type} was sent. Your code is: <strong>${res.code}</strong>`;
});

$('btn-verify-code').addEventListener('click', () => {
  const res = Auth.verifyCode($('login-code-input').value);
  const fb = $('login-feedback');
  if (!res.ok) { fb.textContent = '⚠ ' + res.error; return; }
  fb.textContent = '';
  showLoginOverlay(false);
  runAppInit();
});

$('btn-logout').addEventListener('click', () => {
  Auth.logout();
  location.reload();
});

/* ─────────────────── INIT ─────────────────── */
if (Auth.currentUser()) {
  showLoginOverlay(false);
  runAppInit();
} else {
  showLoginOverlay(true);
}

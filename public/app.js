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
  theraband: $('view-theraband'),
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

    card.addEventListener('click', () => startSession(ex));
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

  // Theraband band-color/resistance HUD — only for theraband exercises
  _lastBandDetection = { color: 'Unknown', resistance: 'Unassigned' };
  if ($('block-theraband-band')) {
    $('block-theraband-band').style.display = exercise.isTheraband ? 'block' : 'none';
  }
  if (exercise.isTheraband && $('theraband-band-badge')) {
    $('theraband-band-badge').textContent = 'Reading band color…';
  }

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
  // Theraband band-color/resistance detection — throttled to ~2x/sec since
  // it does a canvas pixel read; no benefit to running it every frame.
  if (currentExercise?.isTheraband && landmarks) {
    const now = performance.now();
    if (now - _lastBandCheckAt > 500) {
      _lastBandCheckAt = now;
      const idx = TherabandRules.SIDE_INDICES[currentExercise.side];
      const wrist = idx && landmarks[idx.wrist];
      if (wrist && wrist.visibility > 0.4) {
        const detected = TherabandRules.detectBandColor($('user-video'), wrist);
        if (detected.color !== 'Unknown') {
          _lastBandDetection = detected;
          const badge = $('theraband-band-badge');
          if (badge) badge.textContent = `${detected.color} — ${detected.resistance}`;
        }
      }
    }
  }

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
    if (currentExercise.isTheraband) {
      sessionData.bandColor      = _lastBandDetection.color;
      sessionData.resistanceLevel = _lastBandDetection.resistance;
    }
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

// ── Admin: upload reference pose image ──
if ($('yoga-pose-upload')) $('yoga-pose-upload').addEventListener('change', async function () {
  const file = this.files[0];
  if (!file) return;
  const img = new Image();
  img.onload = async () => {
    const canvas = $('yoga-pose-canvas');
    canvas.style.display = 'block';
    canvas.width  = img.naturalWidth;
    canvas.height = img.naturalHeight;
    canvas.getContext('2d').drawImage(img, 0, 0);

    $('yoga-pose-feedback').textContent = 'Detecting pose…';

    // Reuse PoseEngine's one-shot capture
    const fakeLandmarks = await PoseEngine.captureFrameData(img, canvas);
    if (!fakeLandmarks) {
      $('yoga-pose-feedback').textContent = '⚠ No pose detected. Try a clearer full-body image.';
      return;
    }
    // Save to config (landmarks + image dataURL + timer)
    const timerSecs   = parseInt($('yoga-timer-input').value) || 30;
    const repeatCount = parseInt($('yoga-repeat-input').value) || 1;
    const config = {
      referenceLandmarks: fakeLandmarks,
      referenceImageDataUrl: canvas.toDataURL('image/jpeg', 0.7),
      timerSeconds: timerSecs,
      repeatCount,
    };
    localStorage.setItem('yoga_config', JSON.stringify(config));
    $('yoga-pose-feedback').textContent = `✓ Pose saved! Timer: ${timerSecs}s × ${repeatCount}`;
  };
  img.src = URL.createObjectURL(file);
});

// Also update timer when input changes (without re-uploading)
if ($('yoga-timer-input')) $('yoga-timer-input').addEventListener('change', () => {
  const cfg = getYogaConfig();
  if (!cfg) return;
  cfg.timerSeconds = parseInt($('yoga-timer-input').value) || 30;
  localStorage.setItem('yoga_config', JSON.stringify(cfg));
});

if ($('yoga-repeat-input')) $('yoga-repeat-input').addEventListener('change', () => {
  const cfg = getYogaConfig();
  if (!cfg) return;
  cfg.repeatCount = parseInt($('yoga-repeat-input').value) || 1;
  localStorage.setItem('yoga_config', JSON.stringify(cfg));
});

// ── Angle utility (same formula as PoseUtils) ──
function yogaAngle(A, B, C) {
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
const YOGA_DEVIATION_THRESHOLD = 20; // degrees

function computeYogaDeviations(currentLM, referenceLM) {
  const deviated = [];
  YOGA_JOINTS.forEach(([name, a, b, c]) => {
    const lmOk = [a, b, c].every(i => currentLM[i] && referenceLM[i]);
    if (!lmOk) return;
    const currentAngle   = yogaAngle(currentLM[a],   currentLM[b],   currentLM[c]);
    const referenceAngle = yogaAngle(referenceLM[a], referenceLM[b], referenceLM[c]);
    if (Math.abs(currentAngle - referenceAngle) > YOGA_DEVIATION_THRESHOLD) {
      deviated.push({ joint: name, diff: Math.round(Math.abs(currentAngle - referenceAngle)) });
    }
  });
  return deviated;
}

function computeYogaMatchScore(currentLM, referenceLM) {
  const diffs = YOGA_JOINTS.map(([name, a, b, c]) => {
    if (![a, b, c].every(i => currentLM[i] && referenceLM[i])) return null;
    const currentAngle   = yogaAngle(currentLM[a],   currentLM[b],   currentLM[c]);
    const referenceAngle = yogaAngle(referenceLM[a], referenceLM[b], referenceLM[c]);
    return Math.abs(currentAngle - referenceAngle);
  }).filter(v => v !== null);

  if (!diffs.length) return { matchPct: 0, avgDiff: 0 };
  const avgDiff = diffs.reduce((sum, value) => sum + value, 0) / diffs.length;
  const matchPct = Math.round(Math.max(0, Math.min(100, 100 - avgDiff)));
  return { matchPct, avgDiff };
}

function computeExerciseMatchScore(angles, phase, exercise) {
  if (!exercise?.rom) return { matchPct: 0, details: 'No ROM data' };

  const jointScores = Object.entries(exercise.rom).map(([joint, def]) => {
    const current = angles[joint];
    if (current === undefined) return null;
    let targetAngle;
    if (phase === 'up' || phase === 'transition-up') targetAngle = def.top;
    else if (phase === 'down' || phase === 'transition-down') targetAngle = def.bottom;
    else targetAngle = (def.top + def.bottom) / 2;

    const diff = Math.abs(current - targetAngle);
    return { joint, diff };
  }).filter(Boolean);

  if (!jointScores.length) return { matchPct: 0, details: 'No tracked joints yet' };

  const avgDiff = jointScores.reduce((sum, item) => sum + item.diff, 0) / jointScores.length;
  const matchPct = Math.round(Math.max(0, Math.min(100, 100 - avgDiff)));
  const deviated = jointScores.filter(item => item.diff > 12);
  const details = deviated.length
    ? deviated.slice(0, 3).map(item => `${item.joint} ${item.diff}°`).join(', ')
    : 'Good alignment';
  return { matchPct, details };
}

// ── Visual timer state ──
let _yogaTimerInterval    = null;
let _yogaRepeatTimeout    = null;
let _yogaSessionStart     = null;
let _yogaDeviationLog     = [];   // [{ second, joints[] }]
let _yogaRunning          = false;
let _yogaRepeatTarget     = 1;
let _yogaRepeatCurrent    = 0;

function startYogaTimer(totalSeconds, onTick, onComplete) {
  let remaining = totalSeconds;
  const circumference = 327; // 2π × 52

  function update() {
    const pct    = remaining / totalSeconds;
    const offset = circumference * (1 - pct);
    if ($('yoga-timer-ring')) $('yoga-timer-ring').style.strokeDashoffset = offset;

    // Color: green → yellow → red
    const color = remaining > totalSeconds * 0.25
      ? '#22c55e'
      : remaining > totalSeconds * 0.10 ? '#f59e0b' : '#ef4444';
    if ($('yoga-timer-ring')) $('yoga-timer-ring').style.stroke = color;

    if ($('yoga-timer-number')) $('yoga-timer-number').textContent = remaining;
    onTick(remaining);
    remaining--;
    if (remaining < 0) {
      clearInterval(_yogaTimerInterval);
      onComplete();
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
}

// ── Hook into existing session: beginSession wraps this ──
// We extend handleFrame to also run yoga deviation check when a config exists.

// Override: after existing frame logic, also log yoga deviations
window._yogaFrameHook = function (frameData) {
  if (!_yogaRunning) return;
  const cfg = getYogaConfig();
  if (!cfg || !frameData.landmarks) return;

  const deviations = computeYogaDeviations(frameData.landmarks, cfg.referenceLandmarks);

  // Log once per second (keyed to elapsed second)
  const elapsed = Math.floor((Date.now() - _yogaSessionStart) / 1000);
  const lastLog  = _yogaDeviationLog[_yogaDeviationLog.length - 1];
  if (!lastLog || lastLog.second !== elapsed) {
    if (deviations.length > 0) {
      _yogaDeviationLog.push({ second: elapsed, joints: deviations.map(d => d.joint) });
    }
  }

  // Update pose match UI.
  const match = computeYogaMatchScore(frameData.landmarks, cfg.referenceLandmarks);
  const matchWrap    = $('yoga-match-wrap');
  const matchPercent = $('yoga-match-percent');
  const matchDetail  = $('yoga-match-details');
  if (matchWrap && matchPercent && matchDetail) {
    matchWrap.style.display = 'flex';
    matchPercent.textContent = `${match.matchPct}%`;
    matchDetail.textContent  = deviations.length
      ? `${deviations.map(d => d.joint).join(', ')} off`
      : 'Good alignment';
    matchPercent.style.color  = match.matchPct > 75 ? '#4ade80' : match.matchPct > 40 ? '#fbbf24' : '#f87171';
  }

  // Show amber deviation hint (reuse existing feedback overlay)
  if (deviations.length > 0 && !goalReached) {
    const msg = deviations.map(d => d.joint).join(', ') + ' off';
    $('feedback-overlay').style.display = 'flex';
    $('feedback-icon').textContent       = '💛';
    $('feedback-text').textContent       = msg;
  }
};

// ── Patch frame callback to also run yoga hook when active ──
const _originalHandleFrame = handleFrame;
window.handleFrame = function (frameData) {
  _originalHandleFrame(frameData);
  if (typeof window._yogaFrameHook === 'function') {
    window._yogaFrameHook(frameData);
  }
};

// ── Patch beginSession to start yoga timer if config exists ──
const _originalBeginSession = beginSession;

function _startYogaCycle(cfg) {
  if (!cfg) return;
  _yogaRunning = true;
  if (!_yogaSessionStart) _yogaSessionStart = Date.now();
  _yogaDeviationLog = [];

  if ($('yoga-timer-wrap')) {
    $('yoga-timer-wrap').style.display = 'block';
    if ($('yoga-timer-label')) $('yoga-timer-label').textContent = 'Hold';
    if ($('yoga-repeat-label')) $('yoga-repeat-label').textContent = `Hold ${_yogaRepeatCurrent + 1}/${_yogaRepeatTarget}`;
  }
  if ($('yoga-match-wrap')) $('yoga-match-wrap').style.display = 'flex';

  startYogaTimer(cfg.timerSeconds,
    (remaining) => {
      // every tick — nothing extra needed, UI already updated inside startYogaTimer
    },
    () => {
      _yogaRunning = false;
      if ($('yoga-timer-number')) $('yoga-timer-number').textContent = 'Done';
      if ($('yoga-timer-label')) $('yoga-timer-label').textContent = 'Hold complete';
      _yogaRepeatCurrent += 1;

      if (_yogaRepeatCurrent < _yogaRepeatTarget) {
        if ($('yoga-repeat-label')) $('yoga-repeat-label').textContent = `Get ready for ${_yogaRepeatCurrent + 1}/${_yogaRepeatTarget}`;
        _yogaRepeatTimeout = setTimeout(() => {
          if (!_yogaRunning) {
            if ($('yoga-timer-ring')) $('yoga-timer-ring').style.stroke = '#22c55e';
            if ($('yoga-timer-label')) $('yoga-timer-label').textContent = 'Hold';
            if ($('yoga-timer-number')) $('yoga-timer-number').textContent = cfg.timerSeconds;
            _startYogaCycle(cfg);
          }
        }, 2200);
      } else {
        if ($('yoga-repeat-label')) $('yoga-repeat-label').textContent = 'All holds complete';
        if ($('yoga-match-wrap')) $('yoga-match-wrap').style.display = 'none';
        const repeatCount = cfg.repeatCount || 1;
        saveYogaSession(cfg.timerSeconds * repeatCount, cfg.timerSeconds * repeatCount, repeatCount);
        speak(`Great job! You held the pose ${repeatCount} time${repeatCount > 1 ? 's' : ''}!`);
        if ($('yoga-timer-wrap')) {
          $('yoga-timer-wrap').style.display = 'block';
        }
      }
    }
  );
}

window.beginSession = function () {
  const cfg = getYogaConfig();
  if (cfg?.repeatCount) {
    _yogaRepeatTarget  = cfg.repeatCount;
    _yogaRepeatCurrent = 0;
  } else {
    _yogaRepeatTarget  = 1;
    _yogaRepeatCurrent = 0;
  }

  window._sessionStartHook = () => {
    if (cfg) _startYogaCycle(cfg);
  };

  _originalBeginSession();
};

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
  output.innerHTML = '<p style="color:var(--muted);">Select an exercise to view charts.</p>';
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
    ${chartHtml('ROM Score', roms)}
    ${chartHtml('BAI', bais)}
    ${chartHtml('Improvement Index', improvements)}
  `;

  $('btn-ai-progress-summary').addEventListener('click', async () => {
    const btn = $('btn-ai-progress-summary');
    const resultEl = $('ai-progress-result');
    if (!GeminiClient.hasKey()) {
      resultEl.style.display = 'block';
      resultEl.className = 'ai-progress-summary';
      resultEl.innerHTML = `⚠ No AI provider key set yet. Start a live session and use "Get AI Coach Feedback" there once — it'll prompt you to add a key, and it'll be remembered here too.`;
      return;
    }
    btn.disabled = true;
    resultEl.style.display = 'block';
    resultEl.className = 'ai-progress-summary';
    resultEl.innerHTML = '<span class="ai-coach-loading">Reviewing your session history…</span>';
    const res = await GeminiClient.summarizeProgress(sessions);
    resultEl.textContent = res.ok ? res.text : `⚠ Couldn't get AI summary: ${res.error}`;
    btn.disabled = false;
  });
}

function saveExerciseSession(data) {
  const sessions = getExerciseSessions();
  sessions.push(data);
  saveExerciseSessions(sessions);
}

// ── Patch btn-back to also stop yoga timer & save incomplete session ──
$('btn-back').addEventListener('click', () => {
  if (_yogaRunning) {
    const cfg     = getYogaConfig();
    const elapsed = Math.floor((Date.now() - _yogaSessionStart) / 1000);
    stopYogaTimer();
    _yogaRunning = false;
    if ($('yoga-timer-wrap')) $('yoga-timer-wrap').style.display = 'none';
    if ($('yoga-match-wrap')) $('yoga-match-wrap').style.display = 'none';
    if (cfg) saveYogaSession(elapsed, cfg.timerSeconds, cfg.repeatCount || 1); // incomplete — saves actual time held
  }
}, true); // capture phase so it fires before the existing listener

// ── Save session to localStorage ──
function saveYogaSession(completedSeconds, totalSeconds, repeatCount = 1) {
  const userName = childProfile.name || 'Unknown';
  const sessions = getYogaSessions();
  sessions.push({
    id:               Date.now(),
    userName,
    date:             new Date().toISOString(),
    totalSeconds,
    completedSeconds, // actual time held (even if incomplete)
    repeatCount,
    completionPct:    Math.round((completedSeconds / totalSeconds) * 100),
    deviations:       _yogaDeviationLog,
  });
  saveYogaSessions(sessions);
  _yogaDeviationLog = [];
}

// ── Reports page ──
function renderReportUserSelect() {
  const sel = $('report-user-select');
  const output = $('report-output');
  if (!sel || !output) return;

  const yogaUsers = getYogaSessions().map(s => s.userName);
  const exerciseUsers = getExerciseSessions().map(s => s.userName);
  const users = [...new Set([...yogaUsers, ...exerciseUsers])];
  sel.innerHTML  = '<option value="">— choose a user —</option>';
  users.forEach(u => {
    const opt = document.createElement('option');
    opt.value = opt.textContent = u;
    sel.appendChild(opt);
  });
  output.innerHTML = '';
}

if ($('report-user-select')) $('report-user-select').addEventListener('change', function () {
  const user     = this.value;
  const output   = $('report-output');
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

  output.innerHTML = sessions.reverse().map(s => {
    const date     = new Date(s.date).toLocaleString();
    const held     = `${s.completedSeconds}s / ${s.totalSeconds}s`;
    const complete = s.completionPct >= 100
      ? '<span style="color:#22c55e;">✓ Complete</span>'
      : `<span style="color:#f59e0b;">${s.completionPct}% held</span>`;

    // Tally deviations per joint
    const tally = {};
    s.deviations.forEach(d => d.joints.forEach(j => { tally[j] = (tally[j] || 0) + 1; }));
    const tallyHTML = Object.entries(tally).length
      ? Object.entries(tally)
          .sort((a, b) => b[1] - a[1])
          .map(([j, n]) => `<span style="margin-right:10px;">🔸 ${j}: ${n}s</span>`)
          .join('')
      : '<span style="color:var(--muted);">No deviations recorded 🎉</span>';

    return `
      <div class="admin-card" style="margin-bottom:14px;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <strong>${date}</strong> ${complete}
        </div>
        <div style="margin:6px 0;color:var(--muted);font-size:.85rem;">Time held: ${held}</div>
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
  ['prescription-provider-input', 'theraband-provider-input', 'ai-coach-provider-input'].forEach(id => {
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

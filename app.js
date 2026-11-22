(function () {
  const { PROGRAMS, LIFTS, GUIDE_TOPICS } = window.LLData;
  const L = window.LLLogic;

  const STORAGE_KEY = 'longlifts-v2';
  const PLATES = { kg: [25, 20, 15, 10, 5, 2.5, 1.25], lb: [45, 35, 25, 10, 5, 2.5] };
  const INCREMENT_OPTIONS = { kg: [0.5, 1, 1.25, 2.5, 5], lb: [1, 2.5, 5, 10] };
  const LOAD_STEP = { barbell: { kg: 2.5, lb: 5 }, dumbbell: { kg: 1, lb: 2.5 } };
  const RANGES = { '1M': 1, '3M': 3, '6M': 6, '1Y': 12, All: null };
  const METRICS = { weight: 'Weight', e1rm: 'Est. 1RM', volume: 'Volume' };

  const $ = (sel, el = document) => el.querySelector(sel);
  const esc = v => String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = n => Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 });
  const compact = n => Number(n).toLocaleString(undefined, { notation: n >= 10000 ? 'compact' : 'standard', maximumFractionDigits: n >= 10000 ? 1 : 0 });
  const shortDate = t => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const longDate = t => new Date(t).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  const clock = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  const newId = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);

  const ui = { view: 'train', lift: null, metric: 'weight', range: 'All', openTools: new Set() };
  let state;
  let rest = null;
  let restTick = null;
  let audio = null;
  let wakeLock = null;
  let resolveModal = null;

  // ---------- State ----------

  function defaults() {
    return {
      version: 2,
      onboarded: false,
      program: 'barbell5x5',
      unit: 'kg',
      lifts: {},
      next: {},
      sessions: [],
      draft: null,
      layoffHandled: {},
      settings: {
        restNormal: 180, restHard: 300, sound: true, vibrate: true, keepAwake: true, layoffDeload: true,
        bar: { kg: 20, lb: 45 }, increments: { kg: {}, lb: {} }
      }
    };
  }

  function fillLifts(s) {
    Object.entries(LIFTS).forEach(([id, lift]) => {
      if (!s.lifts[id]) s.lifts[id] = { weight: lift.start[s.unit], fails: 0 };
    });
    return s;
  }

  const num = (v, fallback, min, max) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
  };

  const cleanMemo = memo => {
    if (!memo || !Number.isFinite(memo.kg) || !Number.isFinite(memo.lb)) return null;
    return { kg: num(memo.kg, 0, 0, 2000), lb: num(memo.lb, 0, 0, 2000) };
  };

  // Everything loaded or imported passes through here, so bad data cannot break rendering.
  function sanitize(raw) {
    const base = defaults();
    const unit = raw.unit === 'lb' ? 'lb' : 'kg';
    const rs = raw.settings || {};
    const increments = { kg: {}, lb: {} };
    ['kg', 'lb'].forEach(u => Object.entries((rs.increments || {})[u] || {}).forEach(([id, v]) => {
      if (LIFTS[id] && INCREMENT_OPTIONS[u].includes(Number(v))) increments[u][id] = Number(v);
    }));
    const lifts = {};
    Object.entries(raw.lifts || {}).forEach(([id, v]) => {
      if (LIFTS[id] && v) {
        lifts[id] = { weight: num(v.weight, LIFTS[id].start[unit], 0, 2000), fails: num(v.fails, 0, 0, 99) };
        const memo = cleanMemo(v.memo);
        if (memo) lifts[id].memo = memo;
      }
    });
    const cleanExercise = ex => {
      const out = {
        id: ex.id,
        weight: num(ex.weight, 0, 0, 2000),
        target: num(ex.target, 5, 1, 20),
        sets: (Array.isArray(ex.sets) ? ex.sets : []).slice(0, 10).map(r => (r === null || r === undefined ? null : num(r, 0, 0, 20)))
      };
      const memo = cleanMemo(ex.memo);
      if (memo) out.memo = memo;
      return out;
    };
    const sessions = (Array.isArray(raw.sessions) ? raw.sessions : [])
      .filter(s => s && !Number.isNaN(new Date(s.date).getTime()) && Array.isArray(s.exercises))
      .map(s => ({
        id: String(s.id || newId()),
        date: new Date(s.date).toISOString(),
        program: PROGRAMS[s.program] ? s.program : 'dumbbell5x5',
        type: s.type === 'B' ? 'B' : 'A',
        unit: s.unit === 'lb' ? 'lb' : 'kg',
        exercises: s.exercises.filter(e => e && LIFTS[e.id]).map(cleanExercise)
      }))
      .sort((a, b) => new Date(b.date) - new Date(a.date));
    const next = {};
    Object.keys(PROGRAMS).forEach(p => { next[p] = (raw.next || {})[p] === 'B' ? 'B' : 'A'; });
    let draft = null;
    const d = raw.draft;
    if (d && PROGRAMS[d.program] && Array.isArray(d.exercises) && d.exercises.every(e => e && LIFTS[e.id])) {
      draft = { program: d.program, type: d.type === 'B' ? 'B' : 'A', startedAt: d.startedAt || null, exercises: d.exercises.map(cleanExercise) };
    }
    const layoffHandled = {};
    Object.entries(raw.layoffHandled || {}).forEach(([id, time]) => {
      if (LIFTS[id] && Number.isFinite(time)) layoffHandled[id] = time;
    });
    return fillLifts({
      version: 2,
      onboarded: Boolean(raw.onboarded),
      program: PROGRAMS[raw.program] ? raw.program : base.program,
      unit, lifts, next, sessions, draft, layoffHandled,
      settings: {
        restNormal: num(rs.restNormal, 180, 15, 600),
        restHard: num(rs.restHard, 300, 15, 600),
        sound: rs.sound !== false,
        vibrate: rs.vibrate !== false,
        keepAwake: rs.keepAwake !== false,
        layoffDeload: rs.layoffDeload !== false,
        bar: { kg: num((rs.bar || {}).kg, 20, 1, 50), lb: num((rs.bar || {}).lb, 45, 1, 100) },
        increments
      }
    });
  }

  function readLegacy() {
    try {
      const weights = localStorage.getItem('sl-weights');
      const history = localStorage.getItem('sl-history');
      if (!weights && !history) return null;
      return {
        weights: weights ? JSON.parse(weights) : {},
        history: history ? JSON.parse(history) : [],
        next: localStorage.getItem('sl-next-workout'),
        rest: localStorage.getItem('sl-rest-duration')
      };
    } catch (e) {
      return null;
    }
  }

  function load() {
    let saved = null;
    try { saved = localStorage.getItem(STORAGE_KEY); } catch (e) { /* storage blocked */ }
    if (saved) {
      try {
        state = sanitize(JSON.parse(saved));
        return;
      } catch (e) {
        try { localStorage.setItem(`${STORAGE_KEY}-corrupt-${Date.now()}`, saved); } catch (err) { /* ignore */ }
      }
    }
    const legacy = readLegacy();
    if (legacy) {
      const m = L.migrateLegacy(legacy, 90);
      const base = defaults();
      state = sanitize({ ...base, onboarded: true, program: m.program, lifts: m.lifts, sessions: m.sessions, next: m.next, settings: { ...base.settings, restNormal: m.restNormal } });
      save(); // Original sl-* keys are deliberately left in place as a backup.
      return;
    }
    state = fillLifts(defaults());
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      toast('Could not save. Export a backup from Settings.');
    }
  }

  const program = () => PROGRAMS[state.program];
  const loadStep = id => LOAD_STEP[LIFTS[id].equipment][state.unit];
  const bar = () => state.settings.bar[state.unit];
  const increment = id => state.settings.increments[state.unit][id] ?? loadStep(id);
  const minWeight = id => (LIFTS[id].equipment === 'barbell' ? bar() : loadStep(id));
  const hasProgress = () => Boolean(state.draft && state.draft.exercises.some(e => e.sets.some(r => r !== null)));

  function buildDraft(type = state.next[state.program] || 'A') {
    state.draft = {
      program: state.program,
      type,
      startedAt: null,
      exercises: program().workouts[type].map(e => ({
        id: e.lift, weight: state.lifts[e.lift].weight, target: e.reps, sets: Array(e.sets).fill(null)
      }))
    };
  }

  function ensureDraft() {
    if (!state.draft || state.draft.program !== state.program) buildDraft();
    return state.draft;
  }

  // ---------- Modal and toast ----------

  function modal({ title, html = '', actions = [{ label: 'Close', value: 'close', kind: 'primary' }] }) {
    const dialog = $('#modal');
    if (resolveModal) { resolveModal({ value: null }); resolveModal = null; }
    if (dialog.open) dialog.close();
    $('#modal-title').textContent = title;
    $('#modal-body').innerHTML = html;
    $('#modal-actions').innerHTML = actions.map(a =>
      `<button type="button" class="btn ${esc(a.kind || 'ghost')}" data-modal-value="${esc(a.value)}">${esc(a.label)}</button>`).join('');
    dialog.showModal();
    return new Promise(resolve => { resolveModal = resolve; });
  }

  function closeModal(value) {
    const form = $('#modal-body');
    const result = { value, form };
    const resolve = resolveModal;
    resolveModal = null;
    if (resolve) resolve(result);
    $('#modal').close();
  }

  const confirmDialog = async (title, message, label, kind = 'danger') => {
    const r = await modal({
      title,
      html: `<p>${esc(message)}</p>`,
      actions: [{ label: 'Cancel', value: 'no' }, { label, value: 'yes', kind }]
    });
    return r.value === 'yes';
  };

  let toastTimer;
  function toast(message) {
    const el = $('#toast');
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
  }

  // ---------- Rest timer and device feedback ----------

  function unlockAudio() {
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === 'suspended') audio.resume();
    } catch (e) { /* audio unavailable */ }
  }

  function beep() {
    if (!state.settings.sound || !audio) return;
    [0, 0.18, 0.36].forEach(offset => {
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.connect(gain);
      gain.connect(audio.destination);
      osc.frequency.value = 880;
      gain.gain.value = 0.25;
      osc.start(audio.currentTime + offset);
      osc.stop(audio.currentTime + offset + 0.11);
    });
  }

  function startRest(seconds, label) {
    rest = { endAt: Date.now() + seconds * 1000, total: seconds, label, done: false };
    clearInterval(restTick);
    restTick = setInterval(renderTimer, 250);
    renderTimer();
  }

  function stopRest() {
    rest = null;
    clearInterval(restTick);
    renderTimer();
  }

  function renderTimer() {
    const el = $('#timer');
    if (!rest) {
      el.hidden = true;
      document.body.classList.remove('timer-on');
      return;
    }
    el.hidden = false;
    document.body.classList.add('timer-on');
    const left = Math.max(0, Math.ceil((rest.endAt - Date.now()) / 1000));
    if (left === 0 && !rest.done) {
      rest.done = true;
      clearInterval(restTick);
      beep();
      if (state.settings.vibrate && navigator.vibrate) navigator.vibrate([200, 100, 200]);
    }
    el.classList.toggle('done', rest.done);
    $('#timer-label').textContent = rest.done ? 'Time for your next set' : rest.label;
    $('#timer-value').textContent = rest.done ? 'Go' : clock(left);
    $('#timer-fill').style.width = `${rest.done ? 100 : Math.min(100, (1 - left / rest.total) * 100)}%`;
    $('#timer-add').hidden = rest.done;
    $('#timer-skip').textContent = rest.done ? 'Done' : 'Skip';
  }

  async function syncWakeLock() {
    const want = state.settings.keepAwake && hasProgress() && document.visibilityState === 'visible';
    try {
      if (want && !wakeLock && navigator.wakeLock) {
        wakeLock = await navigator.wakeLock.request('screen');
        wakeLock.addEventListener('release', () => { wakeLock = null; });
      } else if (!want && wakeLock) {
        await wakeLock.release();
        wakeLock = null;
      }
    } catch (e) { /* not granted, for example on low battery */ }
  }

  // ---------- Train ----------

  function plateHtml(weight, id) {
    const lift = LIFTS[id];
    if (lift.equipment !== 'barbell') return `<p class="muted small">Weight shown is per dumbbell.</p>`;
    const result = L.platesPerSide(weight, bar(), PLATES[state.unit]);
    if (result.belowBar) return `<p class="muted small">This is lighter than your ${fmt(bar())} ${state.unit} bar.</p>`;
    const chips = result.plates.flatMap(p => Array(p.count).fill(`<span class="plate">${fmt(p.plate)}</span>`)).join('');
    return `<div class="plates"><span class="muted small">Each side</span>${chips || '<span class="small">Empty bar</span>'}</div>
      ${result.leftover ? `<p class="muted small">${fmt(result.leftover)} ${state.unit} per side can't be loaded with standard plates.</p>` : ''}`;
  }

  function toolsHtml(ex) {
    const lift = LIFTS[ex.id];
    const step = lift.equipment === 'barbell' ? (state.unit === 'kg' ? 5 : 10) : loadStep(ex.id);
    const warmups = L.warmupSets(ex.weight, lift.equipment, bar(), step);
    const rows = warmups.length
      ? warmups.map(s => `<li><span>${fmt(s.weight)} ${state.unit}</span><span class="muted">× ${s.reps}</span></li>`).join('')
      : '<li class="muted">No warm-up sets needed at this weight.</li>';
    return `<div class="tools"><h4>Warm-up</h4><ul class="warmups">${rows}</ul><h4>Plates for ${fmt(ex.weight)} ${state.unit}</h4>${plateHtml(ex.weight, ex.id)}</div>`;
  }

  function renderTrain() {
    const draft = ensureDraft();
    const nextType = state.next[state.program] || 'A';
    const p = program();
    const logged = draft.exercises.reduce((n, e) => n + L.loggedSets(e).length, 0);
    const total = draft.exercises.reduce((n, e) => n + e.sets.length, 0);

    const cards = draft.exercises.map((ex, i) => {
      const lift = LIFTS[ex.id];
      const fails = state.lifts[ex.id].fails || 0;
      const open = ui.openTools.has(ex.id);
      const sets = ex.sets.map((r, s) => {
        const cls = r === null ? '' : r >= ex.target ? 'hit' : 'miss';
        const text = r === null ? ex.target : r;
        const status = r === null ? 'not logged' : `${r} reps logged`;
        return `<button class="set ${cls}" data-action="set" data-ex="${i}" data-set="${s}" data-key="set-${i}-${s}" aria-label="Set ${s + 1}, ${status}">${text}</button>`;
      }).join('');
      return `<article class="card exercise">
        <div class="exercise-top">
          <div>
            <button class="exercise-name" data-action="liftGuide" data-id="${esc(ex.id)}">${esc(lift.name)} <span aria-hidden="true">ⓘ</span></button>
            <div class="muted small">${ex.sets.length} × ${ex.target}${fails ? ` · missed last ${fails === 1 ? 'session' : `${fails} sessions`}` : ''}</div>
          </div>
          <div class="stepper">
            <button data-action="weight" data-ex="${i}" data-dir="-1" data-key="minus-${i}" aria-label="Decrease ${esc(lift.name)} weight">−</button>
            <button class="stepper-value" data-action="editWeight" data-ex="${i}" aria-label="Edit ${esc(lift.name)} weight">${fmt(ex.weight)}<small>${state.unit}</small></button>
            <button data-action="weight" data-ex="${i}" data-dir="1" data-key="plus-${i}" aria-label="Increase ${esc(lift.name)} weight">+</button>
          </div>
        </div>
        <div class="sets">${sets}</div>
        <button class="link" data-action="tools" data-id="${esc(ex.id)}" aria-expanded="${open}">${open ? 'Hide' : 'Warm-up & plates'}</button>
        ${open ? toolsHtml(ex) : ''}
      </article>`;
    }).join('');

    $('#view').innerHTML = `
      <div class="segmented program-picker" role="group" aria-label="Program">
        ${Object.values(PROGRAMS).map(x => `<button class="${x.id === state.program ? 'active' : ''}" data-action="program" data-id="${x.id}" aria-pressed="${x.id === state.program}">${esc(x.short)}</button>`).join('')}
      </div>
      <div class="workout-heading">
        <div><h2>${esc(p.name)}</h2><p class="muted small">${esc(p.frequency)} · ${esc(p.time)}</p></div>
        <div class="segmented compact" role="group" aria-label="Workout">
          ${['A', 'B'].map(t => `<button class="${t === draft.type ? 'active' : ''}" data-action="type" data-type="${t}" aria-pressed="${t === draft.type}">${t}${t === nextType ? '<i aria-label="next"></i>' : ''}</button>`).join('')}
        </div>
      </div>
      ${layoffCard(draft)}
      <p class="hint">Tap a set when done. Tap again to lower the reps.</p>
      ${cards}
      <button class="btn primary finish" data-action="finish" ${logged ? '' : 'disabled'}>${logged === total ? 'Finish workout' : `Finish workout · ${logged}/${total} sets`}</button>`;
  }

  // A suggestion is answered once per break: it returns only after the lift is trained again.
  function layoffItems(draft) {
    if (!state.settings.layoffDeload || hasProgress()) return [];
    const now = new Date();
    return draft.exercises.flatMap((ex, index) => {
      const last = L.lastTrained(state.sessions, ex.id);
      if (last === null || state.layoffHandled[ex.id] === last) return [];
      const suggestion = L.layoffSuggestion(ex.weight, last, now, loadStep(ex.id), minWeight(ex.id));
      return suggestion ? [{ ...suggestion, id: ex.id, index, last }] : [];
    });
  }

  function timeAway(days) {
    if (days < 60) {
      const weeks = Math.floor(days / 7);
      return `${weeks} week${weeks === 1 ? '' : 's'}`;
    }
    return `${Math.floor(days / 30)} months`;
  }

  function layoffCard(draft) {
    const items = layoffItems(draft);
    if (!items.length) return '';
    const rows = items.map(item => `<li>
        <span>${esc(LIFTS[item.id].name)}<small>${esc(timeAway(item.days))} off · about ${item.pct}% lighter</small></span>
        <strong>${fmt(item.from)} → ${fmt(item.to)} ${state.unit}</strong>
      </li>`).join('');
    return `<section class="card layoff" aria-labelledby="layoff-title">
      <h3 id="layoff-title">Welcome back</h3>
      <p>After time off, a lighter restart helps you rebuild safely.</p>
      <ul>${rows}</ul>
      <div class="layoff-actions">
        <button class="btn ghost" data-action="keepLayoff">Keep weights</button>
        <button class="btn primary" data-action="applyLayoff">Use lighter weights</button>
      </div>
    </section>`;
  }

  function answerLayoff(apply) {
    const draft = state.draft;
    layoffItems(draft).forEach(item => {
      state.layoffHandled[item.id] = item.last;
      if (apply) {
        draft.exercises[item.index].weight = item.to;
        state.lifts[item.id] = { weight: item.to, fails: 0 };
      }
    });
    save();
    render();
    if (apply) toast('Restart weights applied');
  }

  function tapSet(i, s) {
    const ex = state.draft.exercises[i];
    const r = ex.sets[s];
    const nextValue = r === null ? ex.target : r > 0 ? r - 1 : null;
    ex.sets[s] = nextValue;
    if (!state.draft.startedAt) state.draft.startedAt = new Date().toISOString();
    save();
    const allLogged = state.draft.exercises.every(e => e.sets.every(v => v !== null));
    if (nextValue === null || allLogged) stopRest();
    else if (nextValue >= ex.target) startRest(state.settings.restNormal, 'Rest');
    else startRest(state.settings.restHard, 'Longer rest after missed reps');
    syncWakeLock();
    render();
  }

  function setWeight(i, weight) {
    const ex = state.draft.exercises[i];
    ex.weight = weight;
    state.lifts[ex.id] = { weight, fails: 0 };
    // Choosing a weight by hand answers any pending time-off suggestion for this lift.
    const last = L.lastTrained(state.sessions, ex.id);
    if (last !== null) state.layoffHandled[ex.id] = last;
    save();
    render();
  }

  async function finishWorkout() {
    const draft = state.draft;
    const missing = draft.exercises.reduce((n, e) => n + e.sets.filter(r => r === null).length, 0);
    if (missing && !(await confirmDialog('Finish early?', `${missing} set${missing === 1 ? ' is' : 's are'} not logged. Lifts with unlogged sets won't increase next time.`, 'Finish', 'primary'))) return;

    const snapshot = JSON.stringify({ lifts: state.lifts, next: state.next, draft });
    const session = {
      id: newId(), date: new Date().toISOString(), program: draft.program, type: draft.type, unit: state.unit,
      exercises: draft.exercises.map(e => ({ id: e.id, weight: e.weight, target: e.target, sets: [...e.sets] }))
    };
    const results = draft.exercises.map(ex => {
      const r = L.progressLift(state.lifts[ex.id], ex, increment(ex.id), minWeight(ex.id), loadStep(ex.id));
      if (r.outcome !== 'skipped') state.lifts[ex.id] = { weight: r.to, fails: r.fails };
      return { ...r, id: ex.id };
    });
    state.sessions.unshift(session);
    state.next[draft.program] = draft.type === 'A' ? 'B' : 'A';
    state.draft = null;
    ui.openTools.clear();
    stopRest();
    save();
    syncWakeLock();
    render();

    const rows = results.map(r => {
      const name = esc(LIFTS[r.id].name);
      const text = r.outcome === 'up' ? `↑ ${fmt(r.to)} ${state.unit}` : r.outcome === 'same' ? `Repeat ${fmt(r.to)} ${state.unit}` : 'Skipped';
      const deload = r.deloadTo === null ? '' :
        `<label class="check"><input type="checkbox" name="deload" value="${esc(r.id)}" data-weight="${r.deloadTo}" checked> Deload to ${fmt(r.deloadTo)} ${state.unit} after ${r.fails} missed sessions</label>`;
      return `<li><div class="result-row"><span>${name}</span><strong>${text}</strong></div>${deload}</li>`;
    }).join('');

    const result = await modal({
      title: 'Workout complete',
      html: `<p class="muted">${compact(L.sessionVolume(session))} ${state.unit} lifted. Next time:</p><ul class="results">${rows}</ul>`,
      actions: [{ label: 'Undo', value: 'undo' }, { label: 'Done', value: 'done', kind: 'primary' }]
    });
    if (result.value === 'undo') {
      const before = JSON.parse(snapshot);
      state.lifts = before.lifts;
      state.next = before.next;
      state.draft = before.draft;
      state.sessions = state.sessions.filter(s => s.id !== session.id);
      toast('Workout restored');
    } else if (result.form) {
      result.form.querySelectorAll('input[name="deload"]:checked').forEach(box => {
        state.lifts[box.value] = { weight: Number(box.dataset.weight), fails: 0 };
      });
    }
    save();
    render();
  }

  // ---------- Progress ----------

  function liftsWithData() {
    const ids = new Set(program().workouts.A.concat(program().workouts.B).map(e => e.lift));
    state.sessions.forEach(s => s.exercises.forEach(e => {
      if (L.loggedSets(e).some(r => r > 0)) ids.add(e.id);
    }));
    return [...ids];
  }

  function renderProgress() {
    const ids = liftsWithData();
    if (!ids.includes(ui.lift)) ui.lift = ids[0];
    const volume = state.sessions.reduce((sum, s) => sum + (s.unit === state.unit ? L.sessionVolume(s) : L.convertWeight(L.sessionVolume(s), s.unit, state.unit)), 0);
    const monthAgo = Date.now() - 30 * 86400000;
    const recent = state.sessions.filter(s => new Date(s.date).getTime() >= monthAgo).length;
    const months = RANGES[ui.range];
    let since = null;
    if (months) {
      const d = new Date();
      d.setMonth(d.getMonth() - months);
      since = d.getTime();
    }
    const points = L.liftSeries(state.sessions, ui.lift, ui.metric, state.unit, since);

    const liftRows = ids.map(id => {
      const best = L.bestWeight(state.sessions, id, state.unit);
      return `<button class="lift-row ${id === ui.lift ? 'active' : ''}" data-action="chartLift" data-id="${esc(id)}">
        <span>${esc(LIFTS[id].name)}</span>
        <span class="muted small">Best ${best ? `${fmt(best)} ${state.unit}` : '—'}</span>
        <strong>${fmt(state.lifts[id].weight)} ${state.unit}</strong>
      </button>`;
    }).join('');

    $('#view').innerHTML = `
      <div class="tiles">
        <div class="tile"><span>Workouts</span><strong>${state.sessions.length}</strong></div>
        <div class="tile"><span>Last 30 days</span><strong>${recent}</strong></div>
        <div class="tile"><span>Week streak</span><strong>${L.weekStreak(state.sessions)}</strong></div>
        <div class="tile"><span>Total ${state.unit}</span><strong>${compact(volume)}</strong></div>
      </div>
      <section class="card">
        <label class="field-label" for="lift-select">Lift</label>
        <select id="lift-select" data-change="chartLift">${ids.map(id => `<option value="${esc(id)}" ${id === ui.lift ? 'selected' : ''}>${esc(LIFTS[id].name)}</option>`).join('')}</select>
        <div class="filters">
          <div class="segmented compact" role="group" aria-label="Metric">${Object.entries(METRICS).map(([k, v]) => `<button class="${k === ui.metric ? 'active' : ''}" data-action="metric" data-id="${k}" aria-pressed="${k === ui.metric}">${v}</button>`).join('')}</div>
          <div class="segmented compact" role="group" aria-label="Time range">${Object.keys(RANGES).map(k => `<button class="${k === ui.range ? 'active' : ''}" data-action="range" data-id="${k}" aria-pressed="${k === ui.range}">${k}</button>`).join('')}</div>
        </div>
        <div id="chart" class="chart"></div>
        <div id="chart-legend" class="legend"></div>
        <details class="data-table"><summary>View data</summary><div id="chart-table"></div></details>
      </section>
      <h3 class="section-title">Current weights</h3>
      <section class="card flush">${liftRows}</section>`;
    drawChart(points);
  }

  function drawChart(points) {
    const host = $('#chart');
    if (!host) return;
    const unitLabel = state.unit;
    const metricName = METRICS[ui.metric];
    if (!points.length) {
      host.innerHTML = `<div class="empty"><strong>No data in this range</strong><span>Log a ${esc(LIFTS[ui.lift].name)} session to start your graph.</span></div>`;
      $('#chart-legend').innerHTML = '';
      $('#chart-table').innerHTML = '<p class="muted small">Nothing to show yet.</p>';
      return;
    }

    const W = Math.max(280, host.clientWidth || 320);
    const H = 230;
    const m = { top: 24, right: 14, bottom: 28, left: 46 };
    const values = points.map(p => p.value);
    const ticks = L.niceTicks(Math.min(...values), Math.max(...values));
    const yMin = ticks[0];
    const yMax = ticks[ticks.length - 1];
    const tMin = points[0].time;
    const tMax = points[points.length - 1].time;
    const x = t => (tMax === tMin ? (m.left + W - m.right) / 2 : m.left + ((t - tMin) / (tMax - tMin)) * (W - m.left - m.right));
    const y = v => H - m.bottom - ((v - yMin) / (yMax - yMin || 1)) * (H - m.top - m.bottom);
    const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(p.time).toFixed(1)},${y(p.value).toFixed(1)}`).join('');
    const base = H - m.bottom;
    const area = points.length > 1 ? `${line}L${x(tMax).toFixed(1)},${base}L${x(tMin).toFixed(1)},${base}Z` : '';
    const grid = ticks.map(t => `<line class="grid" x1="${m.left}" x2="${W - m.right}" y1="${y(t)}" y2="${y(t)}"/><text class="axis" x="${m.left - 8}" y="${y(t) + 4}" text-anchor="end">${esc(compact(t))}</text>`).join('');
    const xIdx = points.length > 2 ? [0, Math.floor((points.length - 1) / 2), points.length - 1] : points.map((_, i) => i);
    const xLabels = xIdx.map((idx, n) => {
      const anchor = points.length === 1 ? 'middle' : n === 0 ? 'start' : n === xIdx.length - 1 ? 'end' : 'middle';
      return `<text class="axis" x="${x(points[idx].time)}" y="${H - 8}" text-anchor="${anchor}">${esc(shortDate(points[idx].time))}</text>`;
    }).join('');
    const showDots = points.length <= 45;
    // Missed sessions draw last so their hollow markers stay visible.
    const dots = showDots ? [...points].sort((a, b) => b.hit - a.hit).map(p => `<circle class="${p.hit ? 'dot' : 'dot missed'}" cx="${x(p.time)}" cy="${y(p.value)}" r="4"/>`).join('') : '';
    const last = points[points.length - 1];
    const lastX = Math.min(x(last.time), W - m.right);
    const lastAnchor = points.length === 1 ? 'middle' : 'end';

    host.innerHTML = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" tabindex="0"
        aria-label="${esc(LIFTS[ui.lift].name)} ${esc(metricName)}: ${points.length} sessions, latest ${esc(fmt(last.value))} ${unitLabel}. Use arrow keys to read values.">
        ${grid}
        ${area ? `<path class="area" d="${area}"/>` : ''}
        <path class="line" d="${line}"/>
        ${dots}
        <text class="end-label" x="${lastX}" y="${Math.max(13, y(last.value) - 11)}" text-anchor="${lastAnchor}">${esc(fmt(last.value))}</text>
        ${xLabels}
        <line class="crosshair" y1="${m.top}" y2="${base}" visibility="hidden"/>
        <circle class="focus-dot" r="6" visibility="hidden"/>
      </svg><div class="tooltip" hidden></div>`;

    const svg = $('svg', host);
    const tip = $('.tooltip', host);
    const cross = $('.crosshair', host);
    const focus = $('.focus-dot', host);
    let active = points.length - 1;

    const show = i => {
      active = i;
      const p = points[i];
      const px = x(p.time);
      const py = y(p.value);
      cross.setAttribute('x1', px);
      cross.setAttribute('x2', px);
      cross.setAttribute('visibility', 'visible');
      focus.setAttribute('cx', px);
      focus.setAttribute('cy', py);
      focus.setAttribute('visibility', 'visible');
      tip.replaceChildren();
      const value = document.createElement('strong');
      value.textContent = `${fmt(p.value)} ${unitLabel}`;
      const date = document.createElement('span');
      date.textContent = longDate(p.time);
      const sets = document.createElement('span');
      sets.textContent = `${fmt(p.weight)} ${unitLabel} · ${p.sets.map(r => (r === null ? '–' : r)).join('/')}`;
      tip.append(value, date, sets);
      tip.hidden = false;
      const width = tip.offsetWidth;
      tip.style.left = `${Math.max(0, Math.min(W - width, px - width / 2))}px`;
      tip.style.top = `${Math.max(0, py - tip.offsetHeight - 12)}px`;
    };
    const hide = () => {
      tip.hidden = true;
      cross.setAttribute('visibility', 'hidden');
      focus.setAttribute('visibility', 'hidden');
    };
    svg.addEventListener('pointermove', e => {
      const rect = svg.getBoundingClientRect();
      const px = e.clientX - rect.left;
      let nearest = 0;
      points.forEach((p, i) => { if (Math.abs(x(p.time) - px) < Math.abs(x(points[nearest].time) - px)) nearest = i; });
      show(nearest);
    });
    svg.addEventListener('pointerdown', e => svg.dispatchEvent(new PointerEvent('pointermove', e)));
    svg.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') hide(); });
    svg.addEventListener('focus', () => show(active));
    svg.addEventListener('blur', hide);
    svg.addEventListener('keydown', e => {
      if (e.key === 'ArrowLeft') { e.preventDefault(); show(Math.max(0, active - 1)); }
      if (e.key === 'ArrowRight') { e.preventDefault(); show(Math.min(points.length - 1, active + 1)); }
    });

    const note = ui.metric === 'e1rm' ? 'Estimated with the Epley formula.' : ui.metric === 'volume' ? 'Weight × reps for this lift.' : '';
    $('#chart-legend').innerHTML = `${showDots ? '<span><i class="key"></i>All reps</span><span><i class="key missed"></i>Missed reps</span>' : ''}${note ? `<span class="muted">${note}</span>` : ''}`;
    $('#chart-table').innerHTML = `<table><thead><tr><th>Date</th><th>${esc(metricName)} (${unitLabel})</th><th>Reps</th></tr></thead><tbody>
      ${[...points].reverse().map(p => `<tr><td>${esc(shortDate(p.time))}</td><td>${esc(fmt(p.value))}</td><td>${esc(p.sets.map(r => (r === null ? '–' : r)).join('/'))}</td></tr>`).join('')}
    </tbody></table>`;
  }

  // ---------- History ----------

  function renderHistory() {
    if (!state.sessions.length) {
      $('#view').innerHTML = `<div class="card empty"><strong>No workouts yet</strong><span>Finish your first session and it will appear here.</span><button class="btn primary" data-action="nav" data-view="train">Go to workout</button></div>`;
      return;
    }
    $('#view').innerHTML = state.sessions.map(s => `
      <article class="card history">
        <div class="history-top">
          <div><strong>${esc(longDate(s.date))}</strong><div class="muted small">${esc(PROGRAMS[s.program].name)} · Workout ${s.type} · ${esc(compact(L.sessionVolume(s)))} ${s.unit}</div></div>
          <button class="icon-btn" data-action="deleteSession" data-id="${esc(s.id)}" aria-label="Delete workout from ${esc(longDate(s.date))}">✕</button>
        </div>
        ${s.exercises.map(ex => `<div class="history-row">
          <span>${esc(LIFTS[ex.id].name)}<small>${fmt(ex.weight)} ${s.unit}</small></span>
          <span class="mini-sets">${ex.sets.map(r => `<b class="${r === null ? '' : r >= ex.target ? 'hit' : 'miss'}">${r === null ? '–' : r}</b>`).join('')}</span>
        </div>`).join('')}
      </article>`).join('');
  }

  // ---------- Guides ----------

  function guideBlock([type, a, b]) {
    if (type === 'p') return `<p>${esc(a)}</p>`;
    if (type === 'ul') return `<ul>${a.map(x => `<li>${esc(x)}</li>`).join('')}</ul>`;
    return `<table><thead><tr>${a.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${b.map(row => `<tr>${row.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  }

  function schemeText(p, type) {
    return p.workouts[type].map(e => `<li><button class="link-inline" data-action="liftGuide" data-id="${esc(e.lift)}">${esc(LIFTS[e.lift].name)}</button><span>${e.sets} × ${e.reps}</span></li>`).join('');
  }

  function renderGuides() {
    const programs = Object.values(PROGRAMS).map(p => `
      <article class="card program-card">
        <div class="program-head"><h3>${esc(p.name)}</h3>${p.id === state.program ? '<span class="badge">Current</span>' : ''}</div>
        <p class="muted">${esc(p.tagline)}</p>
        <p class="small muted">${esc(p.frequency)} · ${esc(p.time)}</p>
        <div class="program-days">
          <div><h4>Workout A</h4><ul>${schemeText(p, 'A')}</ul></div>
          <div><h4>Workout B</h4><ul>${schemeText(p, 'B')}</ul></div>
        </div>
        ${p.id === state.program ? '' : `<button class="btn ghost" data-action="program" data-id="${p.id}">Switch to ${esc(p.name)}</button>`}
      </article>`).join('');
    const topics = GUIDE_TOPICS.map(t => `<details class="card topic"><summary>${esc(t.title)}</summary><div class="prose">${t.body.map(guideBlock).join('')}</div></details>`).join('');
    const group = eq => Object.entries(LIFTS).filter(([, l]) => l.equipment === eq).map(([id, l]) =>
      `<button class="lift-row guide" data-action="liftGuide" data-id="${esc(id)}"><span>${esc(l.name)}</span><span class="muted small">${esc(l.muscles)}</span><span aria-hidden="true">›</span></button>`).join('');
    $('#view').innerHTML = `
      <h3 class="section-title first">Programs</h3>${programs}
      <h3 class="section-title">The basics</h3>${topics}
      <h3 class="section-title">Barbell lifts</h3><section class="card flush">${group('barbell')}</section>
      <h3 class="section-title">Dumbbell lifts</h3><section class="card flush">${group('dumbbell')}</section>
      <p class="fineprint">LongLifts is an independent app and is not affiliated with StrongLifts.</p>`;
  }

  function showLiftGuide(id) {
    const l = LIFTS[id];
    const list = (title, items, tag = 'ul') => `<h4>${title}</h4><${tag}>${items.map(x => `<li>${esc(x)}</li>`).join('')}</${tag}>`;
    modal({
      title: l.name,
      html: `<div class="prose"><p>${esc(l.why)}</p><p class="muted small">Works: ${esc(l.muscles)}</p>
        ${list('Setup', l.setup)}${list('The rep', l.steps, 'ol')}${list('Common mistakes', l.mistakes)}</div>`
    });
  }

  // ---------- Settings ----------

  function renderSettings() {
    const s = state.settings;
    const restOptions = v => { const opts = []; for (let t = 30; t <= 420; t += 15) opts.push(t); if (!opts.includes(v)) opts.push(v); return opts.sort((a, b) => a - b).map(t => `<option value="${t}" ${t === v ? 'selected' : ''}>${clock(t)}</option>`).join(''); };
    const toggle = (key, label) => `<label class="setting"><span>${label}</span><input type="checkbox" class="switch" data-setting="${key}" ${s[key] ? 'checked' : ''}></label>`;
    const ids = [...new Set(Object.values(program().workouts).flat().map(e => e.lift))];
    $('#view').innerHTML = `
      <h3 class="section-title first">Units and equipment</h3>
      <section class="card flush">
        <div class="setting"><span>Units</span><div class="segmented compact">${['kg', 'lb'].map(u => `<button class="${u === state.unit ? 'active' : ''}" data-action="unit" data-id="${u}" aria-pressed="${u === state.unit}">${u}</button>`).join('')}</div></div>
        <label class="setting"><span>Bar weight</span><span class="inline-input"><input type="number" inputmode="decimal" min="1" max="100" step="0.5" value="${bar()}" data-change="bar"> ${state.unit}</span></label>
      </section>
      <h3 class="section-title">Weight jump · ${esc(program().name)}</h3>
      <section class="card flush">${ids.map(id => `<label class="setting"><span>${esc(LIFTS[id].name)}</span><select data-change="increment" data-id="${esc(id)}">${INCREMENT_OPTIONS[state.unit].map(v => `<option value="${v}" ${v === increment(id) ? 'selected' : ''}>+${fmt(v)} ${state.unit}</option>`).join('')}</select></label>`).join('')}</section>
      <h3 class="section-title">Rest timer</h3>
      <section class="card flush">
        <label class="setting"><span>After a completed set</span><select data-change="restNormal">${restOptions(s.restNormal)}</select></label>
        <label class="setting"><span>After missed reps</span><select data-change="restHard">${restOptions(s.restHard)}</select></label>
        ${toggle('sound', 'Sound')}${toggle('vibrate', 'Vibration')}${toggle('keepAwake', 'Keep screen on during workouts')}
      </section>
      <h3 class="section-title">Coaching</h3>
      <section class="card flush">${toggle('layoffDeload', 'Suggest lighter weights after time off')}</section>
      <h3 class="section-title">Your data</h3>
      <section class="card stack">
        <p class="muted small">Workouts are stored only on this device. Export a backup before clearing browser data or changing phones.</p>
        <button class="btn ghost" data-action="export">Export backup</button>
        <button class="btn ghost" data-action="import">Import backup</button>
        <input id="import-file" type="file" accept="application/json,.json" hidden>
        <button class="btn danger" data-action="reset">Reset all data</button>
      </section>`;
  }

  function changeUnit(unit) {
    if (unit === state.unit) return;
    const from = state.unit;
    const convert = (v, id) => L.roundTo(L.convertWeight(v, from, unit), LOAD_STEP[LIFTS[id].equipment][unit]);
    // Remember the exact pre-conversion weight so switching back never drifts.
    const swap = (item, id) => {
      const memo = item.memo;
      const restored = memo && memo[from] === item.weight && memo[unit] !== undefined;
      const weight = restored ? memo[unit] : convert(item.weight, id);
      item.memo = { [from]: item.weight, [unit]: weight };
      item.weight = weight;
    };
    Object.entries(state.lifts).forEach(([id, lift]) => swap(lift, id));
    if (state.draft) state.draft.exercises.forEach(e => swap(e, e.id));
    state.unit = unit;
    save();
    render();
  }

  function exportData() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `longlifts-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast('Backup exported');
  }

  async function importData(file) {
    try {
      const raw = JSON.parse(await file.text());
      if (!raw || raw.version !== 2 || !Array.isArray(raw.sessions)) throw new Error('format');
      const incoming = sanitize(raw);
      if (!(await confirmDialog('Replace your data?', `This replaces everything on this device with ${incoming.sessions.length} workouts from the backup.`, 'Replace'))) return;
      state = incoming;
      state.onboarded = true;
      stopRest();
      save();
      render();
      toast('Backup imported');
    } catch (e) {
      toast('That file is not a valid LongLifts backup.');
    }
  }

  async function resetData() {
    if (!(await confirmDialog('Reset all data?', 'This permanently deletes your workouts, weights, and settings on this device.', 'Delete everything'))) return;
    ['sl-weights', 'sl-history', 'sl-next-workout', 'sl-rest-duration', STORAGE_KEY].forEach(k => localStorage.removeItem(k));
    state = fillLifts(defaults());
    stopRest();
    ui.view = 'train';
    save();
    render();
    onboard();
  }

  // ---------- Routing and events ----------

  function render() {
    const active = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.key : null;
    ({ train: renderTrain, progress: renderProgress, history: renderHistory, guides: renderGuides, settings: renderSettings })[ui.view]();
    document.querySelectorAll('.nav button').forEach(b => {
      const on = b.dataset.view === ui.view;
      b.classList.toggle('active', on);
      if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
    $('#settings-btn').classList.toggle('active', ui.view === 'settings');
    if (active) {
      const el = document.querySelector(`[data-key="${active}"]`);
      if (el) el.focus({ preventScroll: true });
    }
  }

  async function switchProgram(id) {
    if (id === state.program) return;
    if (hasProgress() && !(await confirmDialog('Switch program?', "This discards the sets you've logged in the current workout.", 'Switch'))) return;
    state.program = id;
    state.draft = null;
    ui.openTools.clear();
    stopRest();
    save();
    render();
    toast(`Switched to ${PROGRAMS[id].name}`);
  }

  async function onboard() {
    if (state.onboarded) return;
    const options = Object.values(PROGRAMS).map((p, i) => `<label class="choice"><input type="radio" name="program" value="${p.id}" ${i === 0 ? 'checked' : ''}><span><strong>${esc(p.name)}</strong><small>${esc(p.tagline)}</small></span></label>`).join('');
    const r = await modal({
      title: 'Welcome to LongLifts',
      html: `<p class="muted">Choose a plan. You can change it any time, and your weights carry over.</p>${options}
        <div class="unit-choice"><span>Units</span><label><input type="radio" name="unit" value="kg" checked> kg</label><label><input type="radio" name="unit" value="lb"> lb</label></div>`,
      actions: [{ label: 'Start training', value: 'start', kind: 'primary' }]
    });
    if (r.form) {
      const picked = r.form.querySelector('input[name="program"]:checked');
      const unit = r.form.querySelector('input[name="unit"]:checked');
      if (picked) state.program = picked.value;
      if (unit && unit.value === 'lb') {
        state.unit = 'lb';
        Object.entries(LIFTS).forEach(([id, lift]) => { state.lifts[id] = { weight: lift.start.lb, fails: 0 }; });
      }
    }
    state.onboarded = true;
    state.draft = null;
    save();
    render();
  }

  const actions = {
    nav: d => { ui.view = d.view; window.scrollTo(0, 0); render(); },
    settings: () => { ui.view = ui.view === 'settings' ? 'train' : 'settings'; window.scrollTo(0, 0); render(); },
    program: d => switchProgram(d.id),
    type: async d => {
      if (d.type === state.draft.type) return;
      if (hasProgress() && !(await confirmDialog('Switch workout?', "This discards the sets you've logged in this workout.", 'Switch'))) return;
      buildDraft(d.type);
      stopRest();
      save();
      render();
    },
    set: d => tapSet(Number(d.ex), Number(d.set)),
    weight: d => {
      const i = Number(d.ex);
      const ex = state.draft.exercises[i];
      setWeight(i, Math.max(0, L.roundTo(ex.weight + Number(d.dir) * loadStep(ex.id), 0.01)));
    },
    editWeight: async d => {
      const i = Number(d.ex);
      const ex = state.draft.exercises[i];
      const r = await modal({
        title: `${LIFTS[ex.id].name} weight`,
        html: `<label class="field-label" for="weight-input">Working weight (${state.unit}${LIFTS[ex.id].equipment === 'dumbbell' ? ', per dumbbell' : ''})</label>
          <input id="weight-input" class="big-input" type="number" inputmode="decimal" min="0" max="2000" step="any" value="${ex.weight}">`,
        actions: [{ label: 'Cancel', value: 'no' }, { label: 'Save', value: 'yes', kind: 'primary' }]
      });
      if (r.value !== 'yes') return;
      const v = Number(r.form.querySelector('#weight-input').value);
      if (Number.isFinite(v) && v >= 0 && v <= 2000) setWeight(i, v);
      else toast('Enter a weight between 0 and 2000.');
    },
    tools: d => { if (ui.openTools.has(d.id)) ui.openTools.delete(d.id); else ui.openTools.add(d.id); render(); },
    liftGuide: d => showLiftGuide(d.id),
    finish: finishWorkout,
    applyLayoff: () => answerLayoff(true),
    keepLayoff: () => answerLayoff(false),
    chartLift: d => { ui.lift = d.id; render(); },
    metric: d => { ui.metric = d.id; render(); },
    range: d => { ui.range = d.id; render(); },
    deleteSession: async d => {
      if (!(await confirmDialog('Delete workout?', 'It will be removed from your history and graphs. Your current weights stay the same.', 'Delete'))) return;
      state.sessions = state.sessions.filter(s => s.id !== d.id);
      save();
      render();
    },
    unit: d => changeUnit(d.id),
    export: exportData,
    import: () => $('#import-file').click(),
    reset: resetData
  };

  const changes = {
    chartLift: el => { ui.lift = el.value; render(); },
    bar: el => {
      const v = Number(el.value);
      if (v >= 1 && v <= 100) { state.settings.bar[state.unit] = v; save(); } else { el.value = bar(); }
    },
    increment: el => { state.settings.increments[state.unit][el.dataset.id] = Number(el.value); save(); },
    restNormal: el => { state.settings.restNormal = Number(el.value); save(); },
    restHard: el => { state.settings.restHard = Number(el.value); save(); }
  };

  document.addEventListener('pointerdown', unlockAudio, { passive: true });
  document.addEventListener('click', e => {
    const modalBtn = e.target.closest('[data-modal-value]');
    if (modalBtn) { closeModal(modalBtn.dataset.modalValue); return; }
    const el = e.target.closest('[data-action]');
    if (el && actions[el.dataset.action]) actions[el.dataset.action](el.dataset, el);
  });
  document.addEventListener('change', e => {
    const el = e.target;
    if (el.id === 'import-file' && el.files[0]) { importData(el.files[0]); el.value = ''; return; }
    if (el.dataset.setting) { state.settings[el.dataset.setting] = el.checked; save(); syncWakeLock(); return; }
    if (el.dataset.change && changes[el.dataset.change]) changes[el.dataset.change](el);
  });
  $('#modal').addEventListener('cancel', e => { e.preventDefault(); closeModal(null); });
  $('#timer-add').addEventListener('click', () => { if (rest) { rest.endAt += 30000; rest.total += 30; renderTimer(); } });
  $('#timer-skip').addEventListener('click', stopRest);
  document.addEventListener('visibilitychange', () => { renderTimer(); syncWakeLock(); });
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { if (ui.view === 'progress') render(); }, 150);
  });

  load();
  render();
  onboard();

  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
})();

// Pure training logic: no DOM or storage access, so it can be unit tested in Node.
(function (root) {
  const KG_PER_LB = 0.45359237;
  const EPS = 1e-6;

  const clean = n => Math.round(n * 1000) / 1000;
  const roundTo = (v, step) => clean(Math.round(v / step + EPS) * step);
  const floorTo = (v, step) => clean(Math.floor(v / step + EPS) * step);

  function convertWeight(value, from, to) {
    if (from === to) return value;
    const converted = from === 'kg' ? value / KG_PER_LB : value * KG_PER_LB;
    return roundTo(converted, 0.5);
  }

  function platesPerSide(total, bar, plates) {
    if (total < bar) return { belowBar: true, plates: [], leftover: 0 };
    let remaining = (total - bar) / 2;
    const out = [];
    [...plates].sort((a, b) => b - a).forEach(plate => {
      const count = Math.floor(remaining / plate + EPS);
      if (count > 0) {
        out.push({ plate, count });
        remaining = clean(remaining - count * plate);
      }
    });
    return { belowBar: false, plates: out, leftover: remaining > EPS ? remaining : 0 };
  }

  function warmupSets(work, equipment, bar, step) {
    if (equipment === 'barbell') {
      if (work <= bar) return [];
      const sets = [{ weight: bar, reps: 5 }, { weight: bar, reps: 5 }];
      [[0.4, 5], [0.6, 3], [0.8, 2]].forEach(([pct, reps]) => {
        const weight = floorTo(work * pct, step);
        if (weight > sets[sets.length - 1].weight && weight < work) sets.push({ weight, reps });
      });
      return sets;
    }
    const sets = [];
    [[0.5, 5], [0.75, 3]].forEach(([pct, reps]) => {
      const weight = floorTo(work * pct, step);
      const last = sets.length ? sets[sets.length - 1].weight : 0;
      if (weight > last && weight < work) sets.push({ weight, reps });
    });
    return sets;
  }

  // Nearest loadable weight to 90%, always at least one step lighter.
  const deloadWeight = (weight, step, min) =>
    Math.max(min, Math.min(roundTo(weight * 0.9, step), clean(weight - step)));
  // Restart reduction by days since a lift was last trained.
  const LAYOFF_TIERS = [
    { days: 90, pct: 50 },
    { days: 56, pct: 30 },
    { days: 28, pct: 20 },
    { days: 14, pct: 10 }
  ];

  function calendarDaysBetween(from, to) {
    const a = new Date(from);
    const b = new Date(to);
    a.setHours(0, 0, 0, 0);
    b.setHours(0, 0, 0, 0);
    return Math.round((b - a) / 86400000); // Rounding absorbs daylight-saving shifts.
  }

  function lastTrained(sessions, liftId) {
    return sessions.reduce((latest, session) => {
      const ex = session.exercises.find(e => e.id === liftId);
      if (!ex || !ex.sets.some(r => r > 0)) return latest;
      const time = new Date(session.date).getTime();
      return latest === null || time > latest ? time : latest;
    }, null);
  }

  function layoffSuggestion(weight, lastTime, now, step, min) {
    if (lastTime === null || lastTime === undefined) return null;
    const days = calendarDaysBetween(lastTime, now);
    const tier = LAYOFF_TIERS.find(t => days >= t.days);
    if (!tier) return null;
    const reduced = Math.min(roundTo(weight * (1 - tier.pct / 100), step), clean(weight - step));
    const to = Math.max(min, reduced);
    return to < weight ? { days, pct: tier.pct, from: weight, to } : null;
  }

  const loggedSets = ex => ex.sets.filter(r => r !== null && r !== undefined);
  const hitAll = ex => ex.sets.every(r => r !== null && r >= ex.target);
  const exerciseVolume = ex => loggedSets(ex).reduce((sum, r) => sum + r * ex.weight, 0);
  const sessionVolume = s => s.exercises.reduce((sum, ex) => sum + exerciseVolume(ex), 0);

  // Epley estimate; a single rep is the lift itself.
  function estimatedMax(weight, reps) {
    if (!reps || reps <= 0) return 0;
    return reps === 1 ? weight : weight * (1 + reps / 30);
  }

  const bestEstimatedMax = ex =>
    loggedSets(ex).reduce((best, r) => Math.max(best, estimatedMax(ex.weight, r)), 0);

  // Decide what one exercise's result means for the next session.
  function progressLift(lift, ex, increment, minWeight, stepForDeload) {
    const from = ex.weight;
    if (loggedSets(ex).length === 0) {
      return { outcome: 'skipped', from, to: lift.weight, fails: lift.fails || 0, deloadTo: null };
    }
    if (hitAll(ex)) {
      return { outcome: 'up', from, to: clean(from + increment), fails: 0, deloadTo: null };
    }
    const fails = (lift.fails || 0) + 1;
    const deloadTo = fails >= 3 ? deloadWeight(from, stepForDeload, minWeight) : null;
    return { outcome: 'same', from, to: from, fails, deloadTo: deloadTo < from ? deloadTo : null };
  }

  function weekStart(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return d;
  }

  // Consecutive Monday-based weeks with a workout. The current week can still be empty.
  function weekStreak(sessions, now = new Date()) {
    const weeks = new Set(sessions.map(s => weekStart(s.date).getTime()));
    const cursor = weekStart(now);
    if (!weeks.has(cursor.getTime())) cursor.setDate(cursor.getDate() - 7);
    let streak = 0;
    while (weeks.has(cursor.getTime())) {
      streak++;
      cursor.setDate(cursor.getDate() - 7);
    }
    return streak;
  }

  // One chart point per session in which the lift was performed, oldest first.
  function liftSeries(sessions, liftId, metric, unit, since = null) {
    const points = [];
    sessions.forEach(session => {
      const time = new Date(session.date).getTime();
      if (since !== null && time < since) return;
      const ex = session.exercises.find(e => e.id === liftId);
      if (!ex || !loggedSets(ex).some(r => r > 0)) return;
      let raw = ex.weight;
      if (metric === 'e1rm') raw = bestEstimatedMax(ex);
      if (metric === 'volume') raw = exerciseVolume(ex);
      const value = session.unit === unit
        ? clean(raw)
        : convertWeight(raw, session.unit, unit);
      points.push({ time, value, hit: hitAll(ex), sets: ex.sets, weight: convertWeight(ex.weight, session.unit, unit) });
    });
    return points.sort((a, b) => a.time - b.time);
  }

  function bestWeight(sessions, liftId, unit) {
    return liftSeries(sessions, liftId, 'weight', unit)
      .filter(p => p.hit)
      .reduce((best, p) => Math.max(best, p.value), 0);
  }

  function niceTicks(min, max, count = 4) {
    if (min === max) {
      const pad = Math.max(Math.abs(min) * 0.1, 1);
      min -= pad;
      max += pad;
    }
    const rough = (max - min) / count;
    const magnitude = Math.pow(10, Math.floor(Math.log10(rough)));
    const step = [1, 2, 2.5, 5, 10].map(m => m * magnitude).find(s => s >= rough - EPS);
    const start = Math.max(0, Math.floor(min / step + EPS) * step);
    const end = Math.ceil(max / step - EPS) * step;
    const ticks = [];
    for (let t = start; t <= end + step / 2; t += step) ticks.push(clean(t));
    return ticks;
  }

  // Convert data saved by the original single-file version.
  function migrateLegacy(legacy, restDefault) {
    const convertSet = s => (s === true ? 5 : s === false ? 0 : null);
    const sessions = (Array.isArray(legacy.history) ? legacy.history : []).map((w, i) => ({
      id: `legacy-${i}-${w.date}`,
      date: w.date,
      program: 'dumbbell5x5',
      type: w.type === 'B' ? 'B' : 'A',
      unit: 'kg',
      exercises: (w.exercises || []).map(ex => ({
        id: ex.id,
        weight: Number(ex.weight) || 0,
        target: 5,
        sets: (ex.sets || []).map(convertSet)
      }))
    }));
    const lifts = {};
    Object.entries(legacy.weights || {}).forEach(([id, weight]) => {
      if (Number.isFinite(Number(weight))) lifts[id] = { weight: Number(weight), fails: 0 };
    });
    return {
      program: 'dumbbell5x5',
      lifts,
      sessions,
      next: { dumbbell5x5: legacy.next === 'B' ? 'B' : 'A' },
      restNormal: Number(legacy.rest) || restDefault
    };
  }

  const api = {
    roundTo, floorTo, convertWeight, platesPerSide, warmupSets, deloadWeight, loggedSets,
    hitAll, exerciseVolume, sessionVolume, estimatedMax, bestEstimatedMax, progressLift,
    weekStart, weekStreak, liftSeries, bestWeight, niceTicks, migrateLegacy,
    calendarDaysBetween, lastTrained, layoffSuggestion
  };

  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.LLLogic = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

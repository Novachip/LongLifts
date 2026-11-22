// Programs, lifts, and guide content.
(function (root) {
  const w = (lift, sets, reps = 5) => ({ lift, sets, reps });

  const PROGRAMS = {
    barbell5x5: {
      id: 'barbell5x5',
      name: 'Barbell 5×5',
      short: '5×5',
      equipment: 'barbell',
      tagline: 'The full program. Best for building strength and muscle.',
      time: '45–60 min',
      frequency: '3 days a week',
      workouts: {
        A: [w('squat', 5), w('bench', 5), w('row', 5)],
        B: [w('squat', 5), w('ohp', 5), w('deadlift', 1)]
      }
    },
    barbell2x5: {
      id: 'barbell2x5',
      name: 'Barbell 2×5 Lite',
      short: '2×5',
      equipment: 'barbell',
      tagline: 'Same lifts, less volume. For busy or recovery-limited periods.',
      time: '25–35 min',
      frequency: '2–3 days a week',
      workouts: {
        A: [w('squat', 2), w('bench', 2), w('row', 2)],
        B: [w('squat', 2), w('ohp', 2), w('deadlift', 2)]
      }
    },
    dumbbell5x5: {
      id: 'dumbbell5x5',
      name: 'Dumbbell 5×5',
      short: 'DB',
      equipment: 'dumbbell',
      tagline: 'The original LongLifts plan. Ideal for home training.',
      time: '35–50 min',
      frequency: '3 days a week',
      workouts: {
        A: [w('goblet-squat', 5), w('db-bench', 5), w('db-row', 5)],
        B: [w('goblet-squat', 5), w('db-ohp', 5), w('db-rdl', 5)]
      }
    }
  };

  const LIFTS = {
    squat: {
      name: 'Squat', equipment: 'barbell', start: { kg: 20, lb: 45 },
      muscles: 'Quads, glutes, adductors, lower back, core',
      why: 'The main lower-body lift, and the only one you train every session.',
      setup: ['Set the bar at mid-chest height in a rack, with safety pins just below your bottom position.', 'Pull your shoulder blades together and rest the bar on your upper back, not your neck.', 'Stand with heels about shoulder-width apart and toes turned out roughly 30°.'],
      steps: ['Take a big breath and brace your stomach.', 'Break at the hips and knees together, pushing knees out over your toes.', 'Descend until your hip crease is just below your knee.', 'Drive up, keeping the bar over your mid-foot.'],
      mistakes: ['Knees collapsing inward.', 'Heels lifting off the floor.', 'Stopping above parallel as the weight gets heavier.']
    },
    bench: {
      name: 'Bench Press', equipment: 'barbell', start: { kg: 20, lb: 45 },
      muscles: 'Chest, front shoulders, triceps',
      why: 'The main horizontal press for upper-body pushing strength.',
      setup: ['Lie with your eyes under the bar and feet flat on the floor.', 'Grip slightly wider than shoulder-width, with the bar over your wrists.', 'Squeeze your shoulder blades together and down into the bench.', 'Set safety arms, or use a spotter. Do not use a thumbless grip.'],
      steps: ['Unrack and hold the bar over your shoulders.', 'Lower it under control to your mid-chest, elbows about 45–70° from your sides.', 'Touch your chest without bouncing.', 'Press up and slightly back toward your shoulders.'],
      mistakes: ['Flaring elbows straight out to the sides.', 'Bouncing the bar off your chest.', 'Lifting your hips off the bench.']
    },
    row: {
      name: 'Barbell Row', equipment: 'barbell', start: { kg: 30, lb: 65 },
      muscles: 'Lats, upper back, rear shoulders, biceps, lower back',
      why: 'Balances your pressing and builds the upper back that supports heavy squats and deadlifts.',
      setup: ['Stand with the bar over your mid-foot, feet hip-width apart.', 'Hinge until your torso is nearly parallel to the floor.', 'Grip just outside your legs and keep your back flat.'],
      steps: ['Brace your core.', 'Pull the bar to your lower chest or upper stomach, leading with your elbows.', 'Return it to the floor under control.', 'Reset your back before the next rep.'],
      mistakes: ['Standing more upright as sets get hard.', 'Jerking the weight with your hips.', 'Rounding your lower back.']
    },
    ohp: {
      name: 'Overhead Press', equipment: 'barbell', start: { kg: 20, lb: 45 },
      muscles: 'Shoulders, triceps, upper chest, core',
      why: 'Builds strong, stable shoulders. Expect it to progress the slowest.',
      setup: ['Set the bar at upper-chest height in the rack.', 'Grip just outside your shoulders, with forearms vertical.', 'Stand with feet hip-width apart and squeeze your glutes.'],
      steps: ['Brace your core and keep your ribs down.', 'Press straight up, moving your head back slightly to clear the bar.', 'Move your head forward under the bar at the top.', 'Lower under control to your upper chest.'],
      mistakes: ['Leaning back into a standing incline press.', 'Pressing the bar out in front of you.', 'Using your legs to push the weight.']
    },
    deadlift: {
      name: 'Deadlift', equipment: 'barbell', start: { kg: 40, lb: 95 },
      muscles: 'Glutes, hamstrings, back, traps, grip',
      why: 'The heaviest lift in the program. Low set counts keep its fatigue manageable.',
      setup: ['Stand with the bar over your mid-foot, about an inch from your shins.', 'Hinge and grip just outside your legs.', 'Bend your knees until your shins touch the bar.', 'Raise your chest to flatten your back. Use full-size plates so the bar starts at the right height.'],
      steps: ['Take a breath, brace, and pull the slack out of the bar.', 'Push the floor away, keeping the bar against your legs.', 'Stand tall with hips and knees locked.', 'Hinge back and lower it under control.'],
      mistakes: ['Rounding your lower back.', 'Letting the bar drift away from your body.', 'Leaning back at the top.']
    },
    'goblet-squat': {
      name: 'Goblet Squat', equipment: 'dumbbell', start: { kg: 10, lb: 20 },
      muscles: 'Quads, glutes, core, upper back',
      why: 'A squat that naturally teaches an upright torso and good depth.',
      setup: ['Hold one dumbbell vertically against your chest.', 'Stand with feet shoulder-width apart and toes slightly out.'],
      steps: ['Brace your core.', 'Sit down between your hips, keeping your elbows inside your knees.', 'Reach just below parallel.', 'Drive up through your whole foot.'],
      mistakes: ['Letting the dumbbell drift away from your chest.', 'Knees collapsing inward.', 'Rounding your upper back.']
    },
    'db-bench': {
      name: 'Dumbbell Bench Press', equipment: 'dumbbell', start: { kg: 8, lb: 15 },
      muscles: 'Chest, front shoulders, triceps',
      why: 'Trains each arm independently with a comfortable range of motion.',
      setup: ['Sit with the dumbbells on your thighs, then lie back as you bring them up.', 'Plant your feet and pull your shoulder blades together.'],
      steps: ['Lower until your upper arms are slightly below the bench.', 'Keep your forearms vertical.', 'Press up and slightly inward.'],
      mistakes: ['Flaring elbows straight out.', 'Dropping the weights too fast.', 'Letting one side race ahead.']
    },
    'db-row': {
      name: 'Dumbbell Row', equipment: 'dumbbell', start: { kg: 8, lb: 15 },
      muscles: 'Lats, upper back, biceps',
      why: 'Builds back strength with less strain on the lower back. Do 5 reps per arm.',
      setup: ['Put one hand and knee on a bench, or hinge with a staggered stance.', 'Keep your back flat and let the dumbbell hang.'],
      steps: ['Pull your elbow toward your hip.', 'Pause briefly at the top.', 'Lower until your arm is straight.', 'Finish all reps, then switch sides.'],
      mistakes: ['Twisting your torso to lift the weight.', 'Shrugging toward your ear.', 'Cutting the bottom of the rep short.']
    },
    'db-ohp': {
      name: 'Dumbbell Overhead Press', equipment: 'dumbbell', start: { kg: 5, lb: 10 },
      muscles: 'Shoulders, triceps, core',
      why: 'Builds shoulder strength and evens out left-right differences.',
      setup: ['Hold the dumbbells at shoulder height.', 'Stand with feet hip-width apart and squeeze your glutes.'],
      steps: ['Brace your core and keep your ribs down.', 'Press overhead until your arms are straight.', 'Lower under control to your shoulders.'],
      mistakes: ['Arching your lower back.', 'Using your legs to drive the weight.', 'Stopping short of lockout.']
    },
    'db-rdl': {
      name: 'Dumbbell Romanian Deadlift', equipment: 'dumbbell', start: { kg: 10, lb: 20 },
      muscles: 'Hamstrings, glutes, lower back',
      why: 'Trains the hip hinge when heavy barbell deadlifts are not available.',
      setup: ['Stand holding the dumbbells in front of your thighs.', 'Keep a slight bend in your knees.'],
      steps: ['Push your hips straight back.', 'Keep the dumbbells close to your legs.', 'Lower until you feel a strong hamstring stretch.', 'Drive your hips forward to stand.'],
      mistakes: ['Rounding your back to reach lower.', 'Turning it into a squat.', 'Letting the weights drift forward.']
    }
  };

  const GUIDE_TOPICS = [
    {
      id: 'how',
      title: 'How the program works',
      body: [
        ['p', 'You alternate two full-body workouts, A and B, with at least one rest day between sessions. A common schedule is Monday, Wednesday, Friday.'],
        ['table', ['Week', 'Mon', 'Wed', 'Fri'], [['1', 'A', 'B', 'A'], ['2', 'B', 'A', 'B']]],
        ['p', 'Start light and add a small amount of weight every time you complete all your reps. The early sessions should feel easy. That is what lets you practice form and keep progressing for months.']
      ]
    },
    {
      id: 'choose',
      title: 'Choosing 5×5 or 2×5',
      body: [
        ['table', ['', '5×5', '2×5 Lite'], [
          ['Main lifts', '5 sets of 5', '2 sets of 5'],
          ['Deadlift', '1 set of 5', '2 sets of 5'],
          ['Sessions', '3 a week', '2–3 a week'],
          ['Best for', 'Maximum progress', 'Limited time or recovery']
        ]],
        ['p', 'Choose 5×5 if you can recover from it. More volume generally builds more strength and muscle.'],
        ['p', 'Choose 2×5 during busy or stressful periods, when sleep is poor, or alongside demanding sports such as martial arts or endurance training. You can move back to 5×5 when life settles down. Your working weights carry over between the two.']
      ]
    },
    {
      id: 'progress',
      title: 'Adding weight',
      body: [
        ['p', 'If you complete every rep of every set, LongLifts raises that lift for next time. If you miss a rep, the weight stays the same until you complete it.'],
        ['ul', ['Default barbell jump: 2.5 kg or 5 lb per session.', 'If progress slows, use a smaller jump such as 1.25 kg or 2.5 lb.', 'Stronger lifters may add 5 kg or 10 lb to the deadlift for the first few weeks.', 'Change the jump for each lift in Settings.']]
      ]
    },
    {
      id: 'stalls',
      title: 'Missed reps and stalls',
      body: [
        ['p', 'A missed rep is normal. Repeat the weight next session, and check your sleep, food, and rest between sets before changing anything else.'],
        ['p', 'After three sessions in a row without completing a lift, LongLifts offers a 10% deload. You drop the weight and build back up with better momentum. This is a LongLifts suggestion, and you can always decline it.'],
        ['p', 'If you keep stalling after deloading, consider moving to a lower-volume or intermediate program.']
      ]
    },
    {
      id: 'layoff',
      title: 'Coming back after time off',
      body: [
        ['p', 'Strength usually returns quickly, but joints and technique need time to catch up. When a lift has not been trained for two weeks or more, LongLifts suggests a lighter restart.'],
        ['table', ['Time since last trained', 'Suggested drop'], [['Under 2 weeks', 'None'], ['2–3 weeks', 'About 10%'], ['4–7 weeks', 'About 20%'], ['8–12 weeks', 'About 30%'], ['13 weeks or more', 'About 50%']]],
        ['p', 'Each lift is checked separately, and weights are rounded to something you can load. These are LongLifts guidelines, so choose lighter if you were ill, injured, or feel unusually weak. If you are returning from an injury or illness, check with a medical professional first.']
      ]
    },
    {
      id: 'warmup',
      title: 'Warming up',
      body: [
        ['p', 'Warm up for each lift, starting with the empty bar and adding weight while dropping reps. Open "Warm-up & plates" on any exercise for sets calculated from today’s weight.'],
        ['p', 'Warm-up sets should feel easy. Their job is to rehearse the movement without creating fatigue.']
      ]
    },
    {
      id: 'rest',
      title: 'Rest between sets',
      body: [
        ['table', ['How the set felt', 'Rest'], [['Easy', '1–2 min'], ['Normal', 'About 3 min'], ['Hard or missed reps', 'Up to 5 min']]],
        ['p', 'The timer starts when you log a set. It uses your normal rest after a completed set and your longer rest after missed reps.']
      ]
    },
    {
      id: 'safety',
      title: 'Training safely',
      body: [
        ['ul', ['Squat and bench inside a rack with safeties set, or use a spotter.', 'Stop a set if you feel sharp pain. Muscle effort is fine, joint pain is not.', 'Never sacrifice form to finish a rep.', 'Talk to a doctor before starting if you have an injury, a heart condition, or are pregnant.']],
        ['p', 'These guides are general education and do not replace advice from a medical professional or qualified coach.']
      ]
    }
  ];

  const api = { PROGRAMS, LIFTS, GUIDE_TOPICS };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.LLData = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

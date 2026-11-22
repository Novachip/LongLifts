# LongLifts

An offline strength-training tracker inspired by the StrongLifts method. LongLifts is independent and not affiliated with StrongLifts.

## Programs

| Program | Workout A | Workout B |
| --- | --- | --- |
| **Barbell 5×5** | Squat 5×5, Bench 5×5, Row 5×5 | Squat 5×5, Overhead Press 5×5, Deadlift 1×5 |
| **Barbell 2×5 Lite** | Squat 2×5, Bench 2×5, Row 2×5 | Squat 2×5, Overhead Press 2×5, Deadlift 2×5 |
| **Dumbbell 5×5** | Goblet Squat, DB Bench, DB Row | Goblet Squat, DB Overhead Press, DB Romanian Deadlift |

## Features

- Rep-by-rep logging with automatic weight progression
- Optional 10% deload after three missed sessions
- Suggested restart weights after two or more weeks away from a lift
- Progress graphs for weight, estimated 1RM, and volume
- Warm-up and plate calculators
- Guides for every program, lift, and core training rule
- Rest timer with sound and vibration
- kg or lb, custom bar weight, and per-lift weight jumps
- Workouts survive a page reload, and finished workouts can be undone
- JSON backup and restore
- Works offline and installs as a PWA

## How to Use

1. Choose a program and check your starting weights.
2. Tap a set when you finish it. Tap again to lower the rep count.
3. Rest until the timer ends.
4. Tap **Finish workout** to see next session's weights.

## Run Locally

Open `index.html` directly, or serve the folder to enable offline support:

```bash
python3 -m http.server 8000
```

## Install on Mobile

The app must be hosted over HTTPS to install.

- **Android**: Open in Chrome > Menu > "Install app"
- **iOS**: Open in Safari > Share > "Add to Home Screen"

## Data Storage

All data stays in your browser's localStorage and does not sync between devices. Use **Settings > Export backup** to keep a copy. Data from the original version of LongLifts migrates automatically.

## License

MIT

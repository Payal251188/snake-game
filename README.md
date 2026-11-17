# Arcade games

## New: Cloudstep jumping game

Open **`jumping/index.html`**, or serve this folder and visit **http://localhost:5173/jumping/**. Jump with **Space**, **↑**, **W**, or touch; press twice to double jump. See [`jumping/README.md`](jumping/README.md) for full instructions.

## Snake Club

A responsive Snake game built with HTML, CSS, and Canvas. No dependencies, build step, or network connection required.

## Play

Open `index.html` in a modern browser, or serve this folder:

```sh
python3 -m http.server 5173
```

Visit **http://localhost:5173**.

- Steer with **arrow keys** or **W/A/S/D**. On touchscreens, swipe on the board or use the direction buttons.
- Enter your name, then click **LET’S PLAY** (or press **Enter**).
- Catch a **rat**, **rabbit**, or **frog** to grow and score. Prey changes after every catch. The catches table tracks each animal and your level. Every set of **10 rats + 10 rabbits + 10 frogs** raises your level, adding 20% of base speed (level 1: 1.0×, level 2: 1.2×, level 3: 1.4×). Counts and level reset each round.
- Three snake friends above the board clap after every catch. Reduced-motion preferences show a static celebration instead.
- The player snake has a shaded, tapered body, olive saddle markings, fine scales, a shaped head, slit pupils, and a forked flicking tongue.
- Edges wrap: leaving one side brings you in from the opposite side. Avoid your own body; you cannot reverse direction directly.
- **Space** starts, pauses, or resumes. **Escape** pauses. **R** restarts.
- Fill the entire board to win.
- Each catch plays a local chomp clip, independently of Web Audio; game over plays a distinct descending sound (Web Audio). Both follow the volume slider and mute button. Use **Test chomp** to hear the bite without music.
- Local MP3 music starts with play, independently of Web Audio effects. Use **Test sound** before playing, the volume slider, or the header mute button. Playback failures show a retry message. Music pauses with the game.
- Your name is displayed during play. The best score and its player’s name are saved in this browser (ties keep the first champion). Change the name before replaying to switch players. If storage is blocked, the record lasts for the session instead.

Switching tabs or leaving the window pauses play automatically. Resizing preserves the board. High-DPI displays, reduced-motion preferences, keyboard navigation, and screen-reader status announcements are supported.

## Files

- `snake-engine.js`: independent movement, collision, growth, food, and win rules.
- `game.js`: rendering, input, audio, storage, and UI states.
- `index.html`, `style.css`: responsive arcade interface.

## Test

With Node.js 18 or newer:

```sh
node --test tests/*.test.cjs
```

Tests cover the game rules and UI lifecycle, including rapid turns, tail movement, winning, rotating prey, player names, champion persistence and ties, music lifecycle, pause/resume, storage fallback, and touch input.

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
- Enter your name, choose one of three human face avatars (**Mint**, **Peach**, or **Olive**), then click **LET’S PLAY** (or press **Enter**). Your avatar appears beside your name during play and is remembered in this browser. Use **Tab** and arrow keys to choose an avatar with the keyboard.
- Catch a **rat**, **rabbit**, or **frog** to grow and score. Prey changes after every catch. The catches table tracks each animal and your level. Every set of **10 rats + 10 rabbits + 10 frogs** raises your level, adding 20% of base speed (level 1: 1.0×, level 2: 1.2×, level 3: 1.4×). Counts and level reset each round.
- Three snake friends above the board clap after every catch. Reduced-motion preferences show a static celebration instead.
- The player snake has a shaded, tapered body, olive saddle markings, fine scales, a shaped head, slit pupils, and a forked flicking tongue.
- **Obstacles is the default mode**, with walls, barriers, and rocks visible even before you press Play. Use **Choose your challenge** above the board to select another mode before starting a round. Your explicit choice is remembered in this browser and locked while playing or paused:
  - **Classic**: edges wrap to the opposite side; no obstacles.
  - **Obstacles**: solid outer walls, orange striped barriers, and angular rocks. Hitting any hazard ends the round.
  - **Maze**: solid outer walls and staggered stone walls with winding, three-cell-wide passages.
- Avoid your own body in every mode; you cannot reverse direction directly. Every layout has connected open cells, a safe starting area, and prey that never spawns inside a wall or obstacle.
- **Space** starts, pauses, or resumes. **Escape** pauses. **R** restarts.
- Fill every **open cell** to win; walls and obstacles do not count toward the required snake length.
- Each catch plays a local chomp clip, independently of Web Audio; game over plays a distinct descending sound (Web Audio). Both follow the volume slider and mute button. Use **Test chomp** to hear the bite without music.
- Local MP3 music starts with play, independently of Web Audio effects. Use **Test sound** before playing, the volume slider, or the header mute button. Playback failures show a retry message. Music pauses with the game.
- Your name is displayed during play. The best score and its player’s name are saved in this browser (ties keep the first champion). Change the name before replaying to switch players. If storage is blocked, the record lasts for the session instead.

If an already-open tab still shows the old game, hard-refresh it (**Ctrl+Shift+R**, or **Cmd+Shift+R** on macOS). If you previously selected Classic, switch the challenge dropdown to Obstacles or Maze before playing.

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

Tests cover the game rules and UI lifecycle, including mode selection and persistence, wall/barrier/rock collisions, layout connectivity across board sizes, safe spawns and food placement, open-cell wins, rapid turns, tail movement, rotating prey, player names, champion persistence and ties, music lifecycle, pause/resume, storage fallback, and touch input. The best score remains shared across modes.

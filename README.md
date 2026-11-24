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

The arena fits the viewport, with document scrolling locked during play and pause. Open **Settings & Stats** in the header for player/mode selection, audio tools, round statistics, and help. Opening this panel pauses an active game; **Escape** closes it without resuming.

- **AI Arena:** open **Settings & Stats → Players → AI Arena** before a round. Choose **2 or 3 AI opponents**. You control the green snake with WASD, arrow keys, or the first touch pad. The orange, cyan, and purple bots find reachable food, avoid walls/bodies, consider escape space, and compete under the same movement and collision rules. No network or AI service is required.
- Crashed bots disappear and stop blocking cells. You win by being the last snake standing; your own crash ends the round. If the board fills first, the highest surviving score wins (ties draw). The scoreboard shows **AI LEFT**, with individual bot scores and elimination status in **Settings & Stats**. Bots cannot replace your saved best score. Pause, restart, and automatic tab/blur pause apply to every snake.
- **Snake skins:** open **Settings & Stats → Your snake, your style** and choose **Classic Olive**, **Neon Circuit**, **Ember Viper**, or **Frost Pearl**. The live preview uses the same renderer as the board. Your selection applies immediately to Player 1, is saved independently of the portrait/avatar, and survives restart and reload. You can also change skins while paused without resetting the round. Opponents keep their original colors. Skins change appearance only—not movement, collision, food, scoring, or difficulty. If browser storage is unavailable, the choice still works for the session.
- **More food:** **5 prey items** are now available by default. Change **Food on board** to **1 · original**, **5 · plentiful**, or **10 · feast** before a round, in any mode. Each item has its own animal type; catches refill available free cells without overlapping snakes, obstacles, other food, or the golden bonus. Food density and AI preferences are saved locally. Selectors remain locked during play and pause.
- **Two-player local versus is the default.** Both players share the same board and keyboard: **Player 1 (green): W/A/S/D**, **Player 2 (orange): arrow keys**. On touchscreens, each player has a separate, labeled direction pad; swiping the board controls Player 1.
- Enter both players’ names (Player 2 defaults to “Player 2”), choose Player 1’s avatar (**Mint**, **Peach**, or **Olive**), then click **LET’S PLAY** or press **Enter**. Names, avatar, and explicitly selected player count are remembered in this browser.
- **Last snake standing wins.** Hitting a wall, obstacle, your body, or the other snake awards the round to your opponent, regardless of score. Head-on collisions, swapping heads, or both players crashing on the same tick are a **draw**. Moves resolve simultaneously, with no first-player advantage. A non-growing tail vacates its cell that tick; a growing tail remains solid.
- Each player has a separate score. Prey is shared: whoever reaches it grows and scores. If the snakes fill all open cells, the higher score wins; equal scores draw. Click **REMATCH** to reset both snakes and scores.
- For the original game, choose **1 player · solo** in **Settings & Stats** before starting. Solo accepts either WASD or arrow keys, plus swipe or the first direction pad. Player-count and challenge selectors are locked during play and pause.
- Catch a **rat**, **rabbit**, or **frog** to grow and score. The original single-food setting rotates prey after each catch; plentiful settings show several animals at once. The catches table tracks combined catches and the shared level in versus and AI Arena (individual catches in solo). Every set of **10 rats + 10 rabbits + 10 frogs** raises your level, adding 20% of base speed (level 1: 1.0×, level 2: 1.2×, level 3: 1.4×). Counts and level reset each round.
- **Golden food:** a glowing gold star appears at a random free cell after **25–55 successful moves** (about 4–9 seconds at the starting speed). Either player can collect it for **+5 points** and one extra body segment. Normal prey stays on the board. The star expires after **50 moves** (about 8 seconds at starting speed), then a new random waiting period begins. Pausing freezes both timers. The golden-food banner announces availability and shows the remaining time.
- Golden catches have their own table row. They count as one item eaten, not five, and do **not** increase animal counts, skip prey rotation, or advance the level. Normal and golden food can be collected by different players on the same move; each player receives their own points. Golden bonuses count toward the best score and board-completion tiebreaker.
- Three snake friends in **Settings & Stats** clap after every catch. Reduced-motion preferences show a static celebration instead.
- The player snake has a shaded, tapered body, olive saddle markings, fine scales, a shaped head, slit pupils, and a forked flicking tongue.
- **Obstacles is the default mode**, with walls, barriers, and rocks visible even before you press Play. Use **Choose your challenge** in **Settings & Stats** to select another mode before starting a round. Your explicit choice is remembered in this browser and locked while playing or paused:
  - **Classic**: edges wrap to the opposite side; no obstacles.
  - **Obstacles**: solid outer walls, orange striped barriers, and angular rocks. Hitting any hazard ends the round.
  - **Maze**: solid outer walls and staggered stone walls with winding, three-cell-wide passages.
- Avoid your own body in every mode; you cannot reverse direction directly. Every layout has connected open cells, a safe starting area, and prey that never spawns inside a wall or obstacle.
- **Space** starts, pauses, or resumes. **Escape** pauses. **R** restarts.
- In solo, fill every **open cell** to win. In versus, filling the board ends the match and compares scores. Walls and obstacles never count toward the required snake length.
- Each catch plays a local chomp clip, independently of Web Audio; game over plays a distinct descending sound (Web Audio). Both follow the volume slider and mute button. Use **Test chomp** to hear the bite without music.
- Local MP3 music starts with play, independently of Web Audio effects. Use **Test sound** before playing, the volume slider, or the header mute button. Playback failures show a retry message. Music pauses with the game.
- Both names and individual scores are displayed during versus play. The best individual score and its player’s name are saved in this browser (ties keep the first champion). Change the name before replaying to switch players. If storage is blocked, the record lasts for the session instead.

If an already-open tab still shows the old game, hard-refresh it (**Ctrl+Shift+R**, or **Cmd+Shift+R** on macOS). If you previously selected Classic, switch the challenge dropdown to Obstacles or Maze before playing.

Switching tabs or leaving the window pauses play automatically. Resizing preserves the board. High-DPI displays, reduced-motion preferences, keyboard navigation, and screen-reader status announcements are supported.

## Files

- `snake-engine.js`: independent movement, simultaneous multi-snake collisions, elimination, multi-food spawning, growth, and win rules.
- `snake-ai.js`: deterministic bot steering with shortest-path food search, flood-fill escape-space checks, and collision-risk avoidance.
- `snake-skins.js`: immutable cosmetic catalog, safe skin lookup, and fixed opponent palettes.
- `snake-renderer.js`: shared Canvas snake rendering and patterns for gameplay and skin previews.
- `game.js`: browser controller, board rendering, input, audio, storage, and UI states.
- `index.html`, `style.css`: responsive arcade interface.

## Test

With Node.js 18 or newer:

```sh
node --test tests/*.test.cjs
```

Optional viewport checks in `tests/viewport.test.cjs` use Playwright and Google Chrome; they skip when Playwright is unavailable. With Playwright installed, run `node --test tests/viewport.test.cjs` (or set `PLAYWRIGHT_MODULE` to its module path and `CHROME_PATH` to a Chrome executable). These checks cover eight desktop/mobile sizes in both local versus and AI Arena, scrollbar-free play, visible controls, and settings/pause behavior.

Skin tests cover palette/pattern definitions, safe fallback values, opponent-color stability, rendering without simulation mutations, saved/session preferences, avatar independence, pause/restart/reload behavior, and pixel-distinct previews and board rendering in desktop/mobile Chrome. Viewport checks also run with selected skins.

AI and plentiful-food tests cover safe spawns across maps/board sizes, simultaneous multi-food and bonus catches, individual bot elimination, human loss and survival wins, three-way head clashes, head swaps, dead-body cleanup, crowded-board refilling, saved preferences, pause/restart, human-only records, pathfinding, and seeded AI simulations. Existing solo and local-versus regression tests remain in place.

Tests cover randomized golden-food spawning and expiry, safe bonus placement, +5-point attribution, simultaneous normal/bonus catches, pause/reset behavior, near-full boards and bonus-aware records, as well as simultaneous two-player movement, separate inputs and touch pads, food and score attribution, both players’ spawn safety, shared levels, head-on/head-swap draws, opponent-body and tail collisions, winners, rematches, player-count switching and persistence, as well as mode selection and persistence, wall/barrier/rock collisions, layout connectivity across board sizes, safe spawns and food placement, open-cell wins, rapid turns, tail movement, rotating prey, player names, champion persistence and ties, music lifecycle, pause/resume, storage fallback, and touch input. The best score remains shared across modes.

# Arcade games

## Cloudstep jumping game

Open **`jumping/index.html`**, or visit **http://localhost:45006/jumping/** when serving this folder. Jump with **Space**, **↑**, **W**, or touch; press twice to double jump. See [`jumping/README.md`](jumping/README.md).

## Snake Club

A responsive, dependency-free Snake game built with HTML, CSS, and Canvas. No build step or network connection required.

### Play

Open `index.html` in a modern browser, or run:

```sh
python3 -m http.server 45006
```

Visit **http://localhost:45006/**. Hard-refresh an older tab if necessary.

### Simple, smooth 2D play

- A fixed, fully visible **24×20 board** replaces the previous arena presentation. There are no camera modes, tilted boards, minimaps, planets, or fullscreen controls.
- **Settings** contains play type and map. **Appearance** holds snake skins and the **Nightfall**, **Meadow**, and **Sunset** backdrops. **More options** holds food density, AI opponent count, and audio tools. Cosmetic changes apply immediately and are saved independently.
- **Stats** is a separate panel: three progress bars show human animal catches toward the next level. Detailed round counts, records, and AI standings are collapsed below.
- Opening either header panel pauses active play. **Escape** closes the panel without resuming. Gameplay and pause do not scroll the document; touch controls and all three cheering snakes remain visible.
- Grid simulation stays deterministic, while snake bodies interpolate smoothly between ticks. Starting movement is **240 ms per cell**, slower than before. Rendering never changes collision positions.
- Backgrounds, the grid, and obstacles are rasterized once per size/theme/map change. Display resolution is capped at 1.5× and approximately two million backing pixels. Expensive blurred body shadows are removed.
- System reduced-motion preferences disable decorative bobbing, hopping, ear/tongue motion, and cheering animations. Pause freezes animation and gameplay timers; tab switches and window blur pause automatically.

### Players and controls

- **Two-player local versus** is the default. Enter Player 1's name; Player 2 has a ready-made name that can be changed. Player 1's avatar is optional under a collapsed chooser. Names and avatars are saved locally.
- **Player 1:** WASD. **Player 2:** arrow keys. Solo and AI Arena accept either key set. Touchscreens have labeled direction pads; swiping controls Player 1. A snake cannot reverse directly into itself.
- **Space** starts, pauses, or resumes. **Escape** pauses. **R** restarts.
- Select **1 player · solo** or **AI Arena** in Settings before playing. AI Arena has two or three colored bots that seek reachable food, avoid hazards, and consider escape space. Bots follow the same collision and pickup rules. No remote AI service is used.
- Gameplay selectors lock during play/pause. Skins and backdrops remain changeable without resetting the round. Choose **Classic Olive**, **Neon Circuit**, **Ember Viper**, or **Frost Pearl**; opponents retain their identifying colors.

### Animals and levels

- Rats, rabbits, and frogs each award **+1 point** and one body segment. There are **5 animals** by default; More options offers 1, 5, or 10.
- Shaded animal sprites have individual behavior: **rats scurry one cell**, **rabbits hop two cells**, and **frogs jump to a random clear location**. Rabbits require a clear intervening cell. Food never lands on snakes, hazards, or other items, or near a snake's head. Animals within two cells of a head stay put so an approaching catch remains fair.
- Each animal retains its type until caught. Moving food updates the real board position, so bots chase the same targets humans see. Pausing freezes relocation timers.
- **Level 2 requires 10 rats, 10 rabbits, and 10 frogs caught by humans.** Level 3 requires 20 of each, then 30, and so on. In local versus both humans contribute; **AI catches never advance the level**. Each level adds 20% of the starting speed: 1.0×, 1.2×, 1.4×, etc.
- The round details count all snakes' catches; the progress bars count humans only. Scores, catches, levels, and effects reset each round.

### Special items

- **Shield:** a cyan shield pickup protects against **one collision for up to 8 active seconds**. A dangerous move is stopped in place and consumes the shield; turn to safety before the next tick. Stopped bodies remain solid, and simultaneous collisions are rechecked so shields never create overlapping snakes or allow movement through walls.
- **Slow motion:** a purple clock pickup slows the **whole board by 1.5× for 6 active seconds**, including opponents. It scales the current level speed rather than resetting it. Shields and clocks give no points or growth; both humans and bots can collect them.
- Power-ups appear automatically, one at a time, beginning after seven active seconds. An untouched pickup disappears after ten seconds. Active shield and slow-motion timers appear above the board. Pause freezes them; restart clears them.
- **Mushrooms (Classic only):** four red mushrooms spawn and replenish in free cells. Obstacles and Maze have no mushrooms or healing herbs; their mushroom status and statistics are hidden. Each gives **+50 points**, one body segment, and reversed input: **left ↔ right**, **up ↔ down** for keyboard, touch buttons, and swipes. Repeated mushrooms give more points but neither toggle inversion nor postpone its cure. A warning identifies affected humans.
- **Healing herbs:** after **5 active seconds** following mushroom ingestion, a green herb appears. Collecting it restores normal controls, clears queued turns, and gives no points or growth. Herbs remain available while needed; ready cures take precedence over mushroom replenishment on crowded boards. Bots avoid mushrooms and seek herbs when affected.
- **Golden food:** a gold star appears after **25–55 successful moves**, awards **+5 points** and one segment, and expires after 50 moves. At the starting speed that is roughly 6–13 seconds before appearing and 12 seconds of availability. The banner reports remaining time. Normal food remains available.
- Special items never advance animal-based levels. All placement avoids food, other items, live snakes, and obstacles. Timers stop while paused.

### Maps, collisions, and records

- **Obstacles** is the default: solid outer walls, striped barriers, and rocks. **Classic** wraps at the edges with no hazards. **Maze** has solid outer walls and connected winding passages. Map preferences are saved locally.
- Wall, obstacle, self, and opponent-body collisions end an unshielded snake's run. Local versus awards the round to the survivor, regardless of score. Simultaneous crashes, head-on collisions, and head swaps draw unless a shield safely stops a move.
- Moves resolve simultaneously, without a first-player advantage. A non-growing tail vacates its cell; a growing or shield-stopped tail stays solid.
- Crashed AI disappears. In AI Arena, surviving all bots wins; your own crash ends the round. If the board fills first, surviving scores decide the winner, with ties drawing. Solo wins by filling all open cells. Hazards do not count as open cells.
- Scores remain individual. **Best scores and champion names are saved separately for every map × play type**: Classic/Obstacles/Maze × Solo/Local versus/AI Arena. For example, Classic · Solo never shares its record with Maze · Solo or Classic · AI Arena. Stats identifies the active record category. Ties keep the first champion, and bots never replace human best records. Food density, skins, and the number of AI opponents do not create extra categories. Older unclassified records are preserved as “Previous overall best” in round details, without assigning them to an unknown game type. If storage is blocked, each category still keeps its own record for the current session.
- Three snake friends at the top of the arena cheer after catches. Local music starts with play; catches play a chomp and game over has its own sound. The header mute button and More options volume slider control audio; test buttons and failure messages help diagnose playback. Music pauses with the game.

### Files

- `snake-engine.js`: grid movement, simultaneous collisions, human progression, food behavior, power-ups, mushrooms, herbs, and win rules.
- `snake-ai.js`: local shortest-path food/power-up search, escape-space checks, and collision avoidance.
- `snake-motion.js`: read-only snake interpolation, wrap handling, growth, and food hop positions.
- `snake-board.js`: cached fixed 2D board, simple backdrops, obstacles, and resolution limits.
- `snake-skins.js`, `snake-renderer.js`: immutable skin catalog and shared snake/preview rendering.
- `snake-items-renderer.js`: shaded mushroom, herb, shield, and clock sprites.
- `game.js`: browser controller, animal drawing, keyboard/touch input, audio, storage, and UI states.
- `index.html`, `style.css`: compact responsive layout, Settings, Stats, start screen, and cheering snakes.

### Tests

With Node.js 18 or newer:

```sh
node --test tests/*.test.cjs
```

Optional real-browser checks use Playwright and Google Chrome. Set `PLAYWRIGHT_MODULE` to its module path and optionally `CHROME_PATH` to a Chrome executable:

```sh
PLAYWRIGHT_MODULE=/path/to/playwright node --test tests/*.test.cjs
```

Coverage includes human-only levels, slower pacing, non-mutating smooth interpolation, wrap/growth/reset handling, cached rendering and resolution limits, food motion and fair safe placement, power-up spawning/expiry/pause/reset, simultaneous shield collisions and stopped tails, slow-motion scaling, mushroom/herb recovery, skins and saved backdrops, audio/storage fallbacks, per-map/play-type record isolation and persistence, legacy-record preservation, golden bonuses, AI simulations, and solo/local-versus rules. Real-browser tests cover eight desktop/mobile sizes, scrollbar-free play and pause, visible cheering snakes and controls, separate Settings/Stats, cosmetic preferences, and actual mushroom pickup/recovery flows.

# Arcade games

## Cloudstep jumping game

Open **`jumping/index.html`**, or visit **http://localhost:45006/jumping/** when serving this folder. Jump with **Space**, **↑**, **W**, or touch; press twice to double jump. See [`jumping/README.md`](jumping/README.md).

## Snake Club

A responsive Snake game built with HTML, CSS, and Canvas. No build step is required; guest play works offline. Optional social sign-in uses Firebase Authentication and requires network access and provider configuration.

### Play

Open `index.html` in a modern browser, or run:

```sh
python3 -m http.server 45006
```

Visit **http://localhost:45006/**. Hard-refresh an older tab if necessary.

### Simple, smooth 2D play

- A dedicated **home page** welcomes you with the snake friends, your selected map/play type, a setup shortcut, player names, and a prominent Play button. Avatars stay optional. Use **HOME** beside the game controls to leave a round and return; records and preferences are preserved.
- Every new round, restart, and rematch shows **1 → 2 → 3 → GO!** before snakes move. The countdown freezes all simulation timers and bots, allows you to choose your first direction, and pauses safely on Escape, blur, or opening Settings/Stats. Resuming continues the countdown rather than skipping it. Home asks whether to cancel, pause for later, or end the round; it no longer discards a running game immediately.
- A fixed, fully visible **24×20 board** replaces the previous arena presentation. There are no camera modes, tilted boards, minimaps, planets, or fullscreen controls.
- **How to play**, beside Settings (shown as **HELP** on small screens), explains controls, maps/winning, food and every special item, Classic-only mushroom reversal and herb recovery, human-only level targets, exact speed increases and examples, catch chains, medals, and records. It includes the current level/pace and scrolls inside its own panel. Opening it pauses play/countdown; Escape or its close button returns focus without auto-resuming.
- **Map and Play** are on Home, immediately above **Let’s play**, after choosing guest play or signing in. They are no longer in Settings. Compact Home cards can scroll internally; gameplay and pause keep the document locked.
- **Settings** contains appearance, audio, account, and break preferences. **Appearance** holds snake skins and the **Golden glow**, **Sunny meadow**, and **Amber sunset** summer backdrops. **More options** holds food density, AI opponent count, and audio tools. Cosmetic changes apply immediately and are saved independently.
- A bold **on-screen catch chart** shows **Eaten / Required / Pending** for rats, rabbits and frogs in the current level. It stays beside the board on wide screens and above it on phones. Co-op totals both humans; AI catches and score bonuses never count. Excess catches remain visible, pending cannot go below zero, and completed rows gain a check mark. All counts reset for each new summer target.
- **Stats** is a separate panel: three progress bars show human animal catches toward the next level. Detailed round counts, records, and AI standings are collapsed below.
- Opening either header panel pauses active play. **Escape** closes the panel without resuming. Gameplay and pause do not scroll the document; touch controls and all three cheering snakes remain visible.
- Grid simulation stays deterministic, while snake bodies interpolate smoothly between ticks. Starting movement is **240 ms per cell**, slower than before. Rendering never changes collision positions.
- Backgrounds, the grid, and obstacles are rasterized once per size/theme/map change. Snake body shading and patterns also reuse small, fixed 96×96 material tiles per immutable skin; heads and tapered tails retain vector detail. A vector fallback works without offscreen surfaces. Display resolution is capped at 1.5× and approximately two million backing pixels. No expensive blurred body shadows or particle systems are used.
- System reduced-motion preferences disable decorative bobbing, hopping, ear/tongue motion, and cheering animations. Pause freezes animation and gameplay timers; tab switches and window blur pause automatically.

### Players and controls

- **Two-player local co-op** is the default. Choose a team name: both humans’ points contribute to the team score, with individual points shown beside their names. Any unshielded crash ends the team run; filling the board is a shared win. The players share this device, keyboard, or touch pads—not separate online sessions.
- Home offers **Continue with Google**, **Continue with Facebook**, and **Play without login**. Only guest selection opens the player-name form. Configured social sign-in uses the verified profile name instead. Player 2 has an editable default name; team names and guest names are remembered locally. Avatars remain optional.
- **Player 1:** WASD. **Player 2:** arrow keys. Solo and AI Arena accept either key set. Two turns can be buffered: fresh legal input can correct the second turn without replacing the imminent turn or allowing a reversal. Touch pads respond on pointer press, support both local players touching simultaneously, and suppress the matching synthetic click. Keyboard button activation still works. Swipes control Player 1, use a screen-sized threshold, and ignore ambiguous diagonals.
- **Space** starts, pauses, or resumes. **Escape** pauses. **R** restarts.
- Select **1 player · solo** or **AI Arena** in Settings before playing. Opponents have fixed personalities, shown in More options and standings: **AI 1 · Hungry** pursues food, **AI 2 · Cautious** values escape space, and **AI 3 · Collector** favors useful power-ups. Every personality avoids solid hazards, considers head conflicts, seeks herbs when reversed, and follows the same collision/pickup rules. Bot speed is unchanged and there are no extra difficulty selectors or remote AI calls.
- **Home during an ongoing round** pauses immediately and asks: **Cancel**, **Resume later · Go Home**, or **End game · Go Home**. Cancel returns to the previous phase. Resume later puts a **Resume game** card on Home, keeping the exact snakes, score, animal counts, AI, items/effects, countdown, and winter animation frozen. Resuming restores the original phase—including an already paused game. End game discards the round but keeps records. Finished rounds return Home without a warning.
- Paused-on-Home games live **only in the current tab**, not local storage: refreshing/closing the tab or changing accounts ends them. Gameplay setup remains locked until you explicitly end the saved game; skins/audio remain changeable. Restart shortcuts on Home ask before discarding it. Break reminders restart their uninterrupted-play interval as usual.
- Gameplay selectors lock during play/pause. Skins and backdrops remain changeable without resetting the round. Choose **Classic Olive**, **Neon Circuit**, **Ember Viper**, or **Frost Pearl**; opponents retain their identifying colors.

### Animals and levels

- Rats, rabbits, and frogs each award **+1 point** and one body segment. There are **5 animals** by default; More options offers 1, 5, or 10.
- Shaded animal sprites have individual behavior: **rats scurry one cell**, **rabbits hop two cells**, and **frogs jump to a random clear location**. Rabbits require a clear intervening cell. Food never lands on snakes, hazards, or other items, or near a snake's head. Animals within two cells of a head stay put so an approaching catch remains fair.
- Each animal retains its type until caught. Moving food updates the real board position, so bots chase the same targets humans see. Pausing freezes relocation timers.
- **Level 1 requires 10 rats, 10 rabbits, and 10 frogs caught by humans.** Each next level requires **5 more of each**: Level 2 needs 15 each, Level 3 needs 20 each, then 25, 30, etc. Progress is fresh for each level, not cumulative round totals. Both co-op humans contribute; AI catches and score bonuses never satisfy these targets.
- Meeting the quota shows **Level completed — Winter is coming**. Choose Find shelter and steer into the labeled **hollow TREE DEN at the edge**. A boundary-wall cell opens in Obstacles/Maze. Food rests, controls return to normal, and AI snakes hibernate automatically; hazards and body collisions still matter. Both co-op teammates must enter; resting bodies stop blocking the board.
- Winter has light, bounded snowfall and at most **three spaced-out frozen × blocks**. Blocks are deadly like normal hazards (a ready shield can absorb one hit). They never spawn on snakes, within three cells of a human head/the den, or on the reserved clear routes. They disappear in summer. Crowded boards with no clear current route receive no extra blocks.
- Snakes glide into the tree slowly, **head first and tail last**, rather than fading out as a whole. Duration scales with length and current pace (3–15 seconds), with gentle acceleration/deceleration. Co-op waits for both entries **and all visible tails** before summer. Pausing, opening Help/Settings, or hiding the tab freezes the entry and snowfall. Reduced-motion mode omits falling particles and shortens entry to 0.8 seconds.
- Summer has a **shiny golden-yellow floor, warm sunshine and cached light highlights**; the three backdrops offer different warm tints. Winter keeps its existing blue palette, snowy tree and light snowfall.
- After the snake settles inside, **summer arrives**. Surviving snakes restart with **three segments**, but round scores, names, total catches, records, and earned achievements are kept. Eliminated bots do not return. Level progress and temporary effects reset. Speed rises by 20% of the starting speed per level: 1.0×, 1.2×, 1.4×, etc. Start the next level through its countdown.
- The round details count all snakes' catches; the progress bars count humans only. Scores, catches, levels, and effects reset each round.

### Chains, goals, medals, and round results

- **Catch chains:** humans have 12 active seconds after each animal catch to catch another. Each third catch gives just **+1 bonus point**, with no extra body growth. Golden food, mushrooms, herbs, and power-ups neither advance nor refresh the chain. AI receives ordinary base scoring. The banner, cheering snakes, and a short notice explain bonuses. Chain bonuses never change animal-based level requirements.
- **Optional goals:** new rounds rotate between catching one of each animal, surviving 60 active seconds, and building a three-animal chain. Home, the countdown, and Stats describe the goal. Each human has independent progress; goals add no points and are never required to win.
- **Round medals:** Balanced diet, Survivor, Shield save, Catch rhythm, and New record recognize achievements. The record medal recognizes the human who set a solo/AI category record, or both members of a record-setting co-op team—not bots or ties. Medals are round acknowledgments, not another settings/progression system.
- **Results:** after a round, each human gets score, survival time, animal counts, best chain/bonus points, medals, and goal progress. The current map/play-type record is identified below. Names/avatars are edited on Home rather than repeated before rematches. Rematch reuses the setup and starts the countdown; an adjacent Home button returns to setup. Small screens scroll only the result details if necessary, keeping the action buttons accessible.
- All reward and survival timers use simulation time: pause, Home, and countdown do not advance them. Restart clears chains, medals, timers, and goal progress, without clearing saved category records.

### Special items

- **Shield:** a cyan shield pickup protects against **one collision for up to 8 active seconds**. A saved collision briefly highlights the head; humans also see a clear “shield saved you — turn now” notice. A dangerous move is stopped in place and consumes the shield; turn to safety before the next tick. Stopped bodies remain solid, and simultaneous collisions are rechecked so shields never create overlapping snakes or allow movement through walls.
- **Slow motion:** a purple clock pickup slows the **whole board by 1.5× for 6 active seconds**, including opponents. It scales the current level speed rather than resetting it. Shields and clocks give no points or growth; both humans and bots can collect them.
- Power-ups appear automatically, one at a time, beginning after seven active seconds. An untouched pickup disappears after ten seconds. Active shield and slow-motion timers appear above the board. Pause freezes them; restart clears them.
- **Mushrooms (Classic only):** four red mushrooms spawn and replenish in free cells. Obstacles and Maze have no mushrooms or healing herbs; their mushroom status and statistics are hidden. Each gives **+50 points**, one body segment, and reversed input: **left ↔ right**, **up ↔ down** for keyboard, touch buttons, and swipes. Repeated mushrooms give more points but neither toggle inversion nor postpone its cure. A visible notice, warning banner, explicitly labeled reversed touch pads, and accurate directional accessibility labels identify affected humans; the warning does not depend on color or sound.
- **Healing herbs:** after **5 active seconds** following mushroom ingestion, a green herb appears. Collecting it restores normal controls, clears queued turns, and gives no points or growth. Herbs remain available while needed; ready cures take precedence over mushroom replenishment on crowded boards. Bots avoid mushrooms and seek herbs when affected.
- **Golden food:** a gold star appears after **25–55 successful moves**, awards **+5 points** and one segment, and expires after 50 moves. At the starting speed that is roughly 6–13 seconds before appearing and 12 seconds of availability. The banner reports remaining time. Normal food remains available.
- Special items never advance animal-based levels. All placement avoids food, other items, live snakes, and obstacles. Timers stop while paused.

### Maps, collisions, and records

- **Obstacles** is the default: solid outer walls, striped barriers, and square stone blocks marked with a high-contrast amber × so they cannot be mistaken for food. **Classic** wraps at the edges with no hazards. **Maze** has solid outer walls and connected winding passages. Map preferences are saved locally.
- Wall, obstacle, self, and opponent-body collisions end an unshielded snake's run. In local co-op, any unshielded crash—including head-on or teammate collisions—ends the shared team run. Shields can safely stop a dangerous move; teammates still occupy solid cells.
- Moves resolve simultaneously, without a first-player advantage. A non-growing tail vacates its cell; a growing or shield-stopped tail stays solid.
- Crashed AI disappears. In AI Arena, surviving all bots wins; your own crash ends the round. If the board fills first, surviving scores decide the winner, with ties drawing. Solo wins by filling all open cells. Hazards do not count as open cells.
- Individual points are tracked, but co-op uses their sum as the team score. **Best scores and champion names are saved separately for every map × play type**: Classic/Obstacles/Maze × Solo/Local team/AI Arena. Team records store the team name; solo/AI records store the scoring player’s name, whether Google, Facebook, or guest. Records are local to this browser, not a cloud/global leaderboard. Earlier individual-versus records are not reused as team totals. For example, Classic · Solo never shares its record with Maze · Solo or Classic · AI Arena. Stats identifies the active record category. Ties keep the first champion, and bots never replace human best records. Food density, skins, and the number of AI opponents do not create extra categories. Older unclassified records are preserved as “Previous overall best” in round details, without assigning them to an unknown game type. If storage is blocked, each category still keeps its own record for the current session.
- Three snake friends at the top of the arena cheer after catches. Local music starts with play; catches play a chomp and game over has its own sound. Completing all three level targets plays one short offline **“Hurray!” cheer with a fanfare**, and the chart shows HURRAY! ALL DONE. It works without browser speech or Web Audio, respects mute/volume, never repeats on redraw, and stops on Home or leaving the completion screen. The clip is a playful synthetic cheer, not a recorded human crowd. The header mute button and More options volume slider control audio; test buttons and failure messages help diagnose playback. Music pauses with the game.

### Accounts, invites, and break auto-pause

Social sign-in is deliberately unconfigured by default; it never simulates a successful login. Guest play remains available without credentials or network access.

To enable real Google/Facebook login:

1. Create a Firebase project and a Firebase web app. Copy its public `apiKey`, `authDomain`, `projectId`, and `appId` into `firebase` in `auth-config.js`.
2. Enable Google and/or Facebook under Firebase Authentication → Sign-in providers. Add the deployed hostname (and localhost for development) to Authorized domains. Serve over HTTP(S), rather than opening a file URL, for OAuth.
3. For Facebook, create a Facebook app, configure Facebook Login, and register `https://YOUR_AUTH_DOMAIN/__/auth/handler` as a valid OAuth redirect URI. Put the Facebook app ID/secret in the Firebase provider console. **Never put the app secret, passwords, or private keys in browser files.** Facebook app publication/review and allowed test users are controlled by Meta.
4. Set the public `facebookAppId` and a public HTTPS `inviteUrl` in `auth-config.js` to enable sharing. The Invite friends button appears only for a verified Facebook session and opens a user-confirmed Facebook sharing dialog; it never reads contacts or automatically sends messages. Localhost/private preview URLs are not a substitute for a public deployment.

The Firebase SDK is loaded from its official CDN only when configured. Popup/network errors are shown honestly with a guest-play fallback. Signing out or changing identity during a round returns Home so scores cannot switch identities mid-round. Sign-in does not move local scores to another device.

In **Settings → More options**, enable **Break auto-pause** and choose **1–60 minutes** of uninterrupted play; the suggested setting is **2 minutes**, initially off. It pauses safely with “Rest your eyes” and waits for Resume. Manual pauses, hidden tabs/blur, new rounds, Home, and countdown do not accumulate continuous-play time. Resume starts a fresh interval. Switching it off prevents reminders. Preferences persist locally when storage is available. A bold red-on-black digital clock shows round play time and, when enabled, the countdown to the next break. The final ten seconds are spoken once each, followed by a rest message. Speech uses a slower, low-pitched browser voice; a specific husky voice cannot be guaranteed on every device. Missing/blocked speech never stops the visible countdown or auto-pause. Mute or zero volume silences speech, and disabling break auto-pause hides its countdown and prevents spoken alerts.

A shared URL currently opens independent games on each browser. Public HTTPS deployment, cross-device competition/matchmaking, credits, global ranking, and WhatsApp match challenges require an online backend and are not implemented in this static app.

### Files

- `snake-engine.js`: grid movement, simultaneous collisions, human progression, food behavior, power-ups, mushrooms, herbs, and win rules.
- `snake-ai.js`: deterministic Hungry/Cautious/Collector steering with food/power-up search, escape-space checks, and collision avoidance.
- `snake-rewards.js`: read-only optional goals, medals, time formatting, and individual round summaries.
- `snake-motion.js`: read-only snake interpolation, wrap handling, growth, food hops, and length-aware, segment-by-segment den entry.
- `snake-winter.js`: cached snowy hollow-tree artwork, foreground entrance masking, and bounded lightweight snowfall.
- `snake-board.js`: cached fixed 2D board, golden summer sunshine, unchanged winter colors, obstacles, and resolution limits.
- `assets/hurray.wav`: bundled offline level-completion cheer. Rebuild with `python3 scripts/generate-hurray.py` (requires `espeak-ng` only when rebuilding).
- `snake-skins.js`, `snake-renderer.js`: immutable skin catalog and shared snake/preview rendering.
- `snake-items-renderer.js`: shaded mushroom, herb, shield, and clock sprites.
- `auth-config.js`, `snake-auth.js`: public provider settings, optional real OAuth, verified profile identity, and Facebook sharing links.
- `snake-breaks.js`: configurable continuous-play break timer, separate from game speed and scoring.
- `snake-voice.js`: optional low-pitched browser speech for the final break countdown, with safe mute/cancel/failure handling.
- `game.js`: browser controller, animal drawing, keyboard/touch input, audio, storage, and UI states.
- `index.html`, `style.css`: responsive home page, countdown, compact game layout, Settings, Stats, and cheering snakes.

### Tests

With Node.js 18 or newer:

```sh
node --test tests/*.test.cjs
```

Optional real-browser checks use Playwright and Google Chrome. Set `PLAYWRIGHT_MODULE` to its module path and optionally `CHROME_PATH` to a Chrome executable:

```sh
PLAYWRIGHT_MODULE=/path/to/playwright node --test tests/*.test.cjs
```

Coverage includes human-only levels, slower pacing, non-mutating smooth interpolation, wrap/growth/reset handling, cached rendering and resolution limits, food motion and fair safe placement, power-up spawning/expiry/pause/reset, simultaneous shield collisions and stopped tails, slow-motion scaling, mushroom/herb recovery, skins and saved backdrops, audio/storage fallbacks, per-map/play-type record isolation and persistence, legacy-record preservation, home setup placement, seasonal quotas/den entry/co-op hibernation/summer resets, home navigation, countdown/rematch/pause lifecycle, responsive touch/queued-turn corrections, independent chain bonuses and goals, medals/results, bounded body-material caching, AI personality choices, unmistakable stone hazards, golden bonuses, AI simulations, and solo/co-op rules (plus legacy pure-engine versus regressions). Account adapters, honest unconfigured-login behavior, team-name records, and break auto-pause are tested without requiring live OAuth credentials. Real-browser tests cover eight desktop/mobile sizes, scrollbar-free play and pause, visible cheering snakes and controls, separate Settings/Stats, cosmetic preferences, and actual mushroom pickup/recovery flows.

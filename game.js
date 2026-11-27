(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const canvas = $('board');
  const ctx = canvas.getContext('2d');
  const engine = new SnakeGame({ mode: 'obstacles', playerCount: 2, foodCount: 5, mushroomCount: 4, animatedFood: true, powerupsEnabled: true, combosEnabled: true, teamMode: true, seasonalLevels: true });
  const storageKey = 'snake-club-record-v3';
  const headerPanels = { gameSettings: 'settingsSummary', gameHelp: 'helpSummary', gameStats: 'statsSummary' };
  function closeHeaderPanels() { for (const id of Object.keys(headerPanels)) $(id).open = false; }
  const playerKey = 'snake-club-player-v1';
  const avatarKey = 'snake-club-avatar-v1';
  const skinKey = 'snake-club-skin-v1';
  const backdropKey = 'snake-club-backdrop-v1';
  const modeKey = 'snake-club-mode-v1';
  const playersKey = 'snake-club-players-v1';
  const opponentKey = 'snake-club-player-two-v1';
  const aiCountKey = 'snake-club-ai-count-v1';
  const foodKey = 'snake-club-food-count-v1';
  const teamKey = 'snake-club-team-v1';
  const breakKey = 'snake-club-breaks-v1';
  const breakTimer = SnakeBreaks.create();
  let breakLastTime = null;
  let breakDue = false;
  let lastSpokenBreakSecond = null;
  const breakVoice = SnakeVoice.create();
  const authConfig = window.SNAKE_AUTH_CONFIG || {};
  let authUser = null;
  let identityChoice = 'choose';
  let authBusy = false;
  let authMessage = '';
  let guestName = '';
  let teamName = 'Snake Squad';
  let preferredAICount = 3;
  const modes = {
    classic: { name: 'Classic', hint: 'Edges wrap. Avoid your own body.' },
    obstacles: { name: 'Obstacles', hint: 'Solid edges. Avoid walls, striped barriers, and stone blocks marked ×.' },
    maze: { name: 'Maze', hint: 'Solid edges. Wind through the gaps between the maze walls.' },
  };
  const avatars = { mint: 'Mint', peach: 'Peach', olive: 'Olive' };
  let playerAvatar = 'mint';
  let playerSkin = 'classic';
  let backdrop = 'night';
  let previousPlayers = SnakeMotion.capture(engine.players);
  let visualTime = 0;
  let lastVisualFrame = null;
  let sceneDirty = true;
  const boardPainter = SnakeBoard.createPainter();
  const cleanName = (value) => typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, 24) : '';
  const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
  let reducedMotion = motionPreference.matches;
  let state = 'ready';
  let best = 0;
  let bestName = '';
  const records = new Map();
  const recordType = () => engine.aiCount ? 'ai' : engine.playerCount === 2 ? 'team' : 'solo';
  const recordKey = () => `${engine.mode}:${recordType()}`;
  const recordLabel = () => `${modes[engine.mode].name} · ${{ solo: 'Solo', team: 'Local team', ai: 'AI Arena' }[recordType()]}`;
  let playerName = '';
  let opponentName = 'Player 2';
  const nameFor = (index) => index === 0 ? playerName || 'Player 1' : engine.players[index]?.ai ? `AI ${index}` : opponentName;
  const steeringHint = () => engine.aiCount
    ? `Use WASD or arrow keys. Compete against ${engine.aiCount} AI snakes. Last snake standing wins; crashed bots disappear.`
    : engine.playerCount === 2
    ? 'Team play: P1 uses WASD; P2 uses arrow keys. Add your points together. Any unshielded crash ends the team run.'
    : 'Use arrow keys or W A S D to steer.';
  let startingBest = 0;
  let roundNumber = 0;
  let roundGoal = SnakeRewards.goalFor(1);
  let roundRecordPlayer = null;
  const completedGoals = new Set();
  let canSave = true;
  let lastTime = null;
  let elapsed = 0;
  let countdownElapsed = 0;
  let countdownLastTime = null;
  let pausedCountdown = false;
  let width = 720;
  let height = 600;
  let soundOn = true;
  let audio = null;
  let effectsGain = null;
  const music = $('music');
  const chomp = $('chomp');
  let chompRequest = 0;
  let chompPriming = false;
  music.volume = 0.75;
  let previewSound = false;
  let playbackRequest = 0;
  let gesture = null;
  let cheerRemaining = 0;
  let cheerFrame = null;
  let noticeRemaining = 0;
  const shieldFlashes = new Map();
  const denAnimations = new Map();
  let seasonTransitionRemaining = 0;

  function resetCheer() {
    cheerRemaining = 0;
    cheerFrame = null;
    $('snakeFriends').dataset.cheering = 'false';
    $('friendMessage').textContent = 'Your snake friends are rooting for you!';
  }

  function showNotice(message, kind = 'reward') {
    noticeRemaining = 2200;
    $('eventNotice').textContent = message;
    $('eventNotice').dataset.kind = kind;
    $('eventNotice').hidden = false;
  }

  function cheer() {
    cheerRemaining = 1200;
    $('snakeFriends').dataset.cheering = 'true';
    const names = engine.lastCatches.map(({ playerIndex }) => nameFor(playerIndex)).join(' & ');
    const golden = engine.lastCatches.some(({ type }) => type === 'golden');
    const mushroom = engine.lastCatches.some(({ type }) => type === 'mushroom');
    const herb = engine.lastCatches.some(({ type }) => type === 'herb');
    const combo = engine.lastEvents.find((event) => event.type === 'combo-bonus');
    const powerup = engine.lastCatches.find(({ type }) => type === 'shield' || type === 'slow');
    $('friendMessage').textContent = combo ? `${combo.streak}-catch chain! +1 bonus for ${nameFor(combo.playerIndex)}! 🎵` : powerup ? `${powerup.type === 'shield' ? 'Shield ready! 🛡' : 'Slow and steady! ⏱'} ${names}` : mushroom ? `Mushroom! +50 for ${names}! 🍄`
      : herb ? `Healing herb! Controls restored for ${names}! 🌿`
      : golden ? `Golden catch! +5 for ${names}! ⭐` : `Nice catch, ${names}! 👏`;
  }

  function parseRecord(raw) {
    let record;
    try { record = JSON.parse(raw); } catch { return null; }
    return record && Number.isSafeInteger(record.score) && record.score > 0
      ? { score: record.score, name: cleanName(record.name) || 'Unknown player' } : null;
  }

  function selectBestRecord() {
    const key = recordKey();
    if (!records.has(key)) {
      let saved = null;
      if (canSave) {
        try { saved = parseRecord(localStorage.getItem(`${storageKey}:${key}`)); }
        catch { storageUnavailable(); }
      }
      records.set(key, saved || { score: 0, name: '' });
    }
    const record = records.get(key);
    best = record.score;
    bestName = record.name;
  }

  function storageUnavailable() {
    canSave = false;
    $('storageNote').textContent = 'Best scores kept per game type for this session. Browser storage is unavailable.';
  }
  $('legacyRecord').hidden = true;
  try {
    const legacy = Number(localStorage.getItem('snake-club-best-v1'));
    const record = parseRecord(localStorage.getItem('snake-club-record-v2'))
      || (Number.isSafeInteger(legacy) && legacy > 0 ? { score: legacy, name: 'Unknown player' } : null);
    if (record) {
      $('legacyRecord').hidden = false;
      $('legacyRecord').textContent = `Previous overall best: ${record.score} by ${record.name} (game type unknown).`;
    }
    playerName = cleanName(localStorage.getItem(playerKey));
    teamName = cleanName(localStorage.getItem(teamKey)) || 'Snake Squad';
    try { breakTimer.configure(JSON.parse(localStorage.getItem(breakKey))); } catch { /* Invalid preferences use the defaults. */ }
    opponentName = cleanName(localStorage.getItem(opponentKey)) || 'Player 2';
    const savedAI = Number(localStorage.getItem(aiCountKey));
    if ([2, 3].includes(savedAI)) preferredAICount = savedAI;
    const savedPlayers = localStorage.getItem(playersKey);
    if (savedPlayers === 'ai') engine.reset({ playerCount: 1, aiCount: preferredAICount });
    else if (savedPlayers === '1' || savedPlayers === '2') engine.reset({ playerCount: Number(savedPlayers) });
    const savedFood = Number(localStorage.getItem(foodKey));
    if ([1, 5, 10].includes(savedFood)) engine.reset({ foodCount: savedFood });
    playerSkin = SnakeSkins.get(localStorage.getItem(skinKey)).id;
    backdrop = SnakeBoard.resolve(localStorage.getItem(backdropKey));
    const savedAvatar = localStorage.getItem(avatarKey);
    if (Object.hasOwn(avatars, savedAvatar)) playerAvatar = savedAvatar;
    const savedMode = localStorage.getItem(modeKey);
    if (Object.hasOwn(modes, savedMode)) engine.reset({ mode: savedMode });
  } catch { storageUnavailable(); }

  guestName = playerName;
  $('teamInput').value = teamName;
  $('breakToggle').checked = breakTimer.settings.enabled;
  $('breakMinutes').value = String(breakTimer.settings.minutes);
  $('breakOptions').hidden = !breakTimer.settings.enabled;
  $('playerInput').value = playerName;
  $('opponentInput').value = opponentName;
  for (const id of Object.keys(avatars)) {
    const radio = $(`avatar-${id}`);
    radio.checked = id === playerAvatar;
    radio.addEventListener('change', () => {
      if (radio.checked) playerAvatar = id;
    });
    radio.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.repeat) { event.preventDefault(); startGame(); }
    });
  }
  function focusHome() {
    $(identityChoice === 'choose' ? 'guestPlayButton' : authUser ? 'playButton' : 'playerInput').focus({ preventScroll: true });
  }

  function syncIdentityUI() {
    const home = state === 'ready';
    $('authPanel').hidden = !home;
    $('authChoices').hidden = identityChoice !== 'choose';
    $('authSession').hidden = identityChoice === 'choose';
    $('playerEntry').hidden = !home || identityChoice !== 'guest';
    $('teamEntry').hidden = !home || engine.playerCount !== 2 || identityChoice === 'choose';
    $('homeSetup').hidden = !home || identityChoice === 'choose';
    $('playButton').hidden = home && identityChoice === 'choose';
    $('signOutButton').hidden = !authUser;
    $('settingsSignOutButton').hidden = !authUser;
    $('changeIdentityButton').hidden = Boolean(authUser);
    $('googleLoginButton').disabled = authBusy;
    $('facebookLoginButton').disabled = authBusy;
    $('signOutButton').disabled = authBusy;
    $('settingsSignOutButton').disabled = authBusy;
    $('inviteFriendsButton').hidden = authUser?.provider !== 'facebook';
    const identity = authUser ? `${authUser.name} · ${authUser.provider === 'facebook' ? 'Facebook' : 'Google'}` : 'Playing without login';
    $('accountIdentity').textContent = identity;
    $('settingsAccountName').textContent = authUser ? identity : 'Guest play · records stay on this device';
    $('authStatus').textContent = authMessage || (identityChoice === 'choose'
      ? SnakeAuth.configured(authConfig) ? 'Sign in or play as a guest. Scores keep the scorer’s name.' : 'Social sign-in needs setup. You can play without login now.'
      : authUser ? 'Your profile name is used for scores. Best records remain on this device.' : 'Enter your name below. Your records count just like signed-in players.');
    document.querySelector('.game-shell').dataset.identity = identityChoice;
    if (home && identityChoice === 'choose') $('overlayTitle').textContent = 'Choose how to play';
    else if (home && authUser) $('overlayTitle').textContent = `Ready, ${authUser.name}?`;
  }

  function handleAuth(snapshot) {
    const previous = authUser;
    authUser = snapshot.user;
    authBusy = snapshot.busy;
    authMessage = snapshot.message || '';
    const changed = previous?.id !== authUser?.id || previous?.provider !== authUser?.provider;
    if (authUser) {
      identityChoice = 'account';
      playerName = cleanName(authUser.name);
      $('playerInput').value = playerName;
    } else if (previous) {
      identityChoice = 'choose';
      playerName = guestName;
      $('playerInput').value = guestName;
    }
    if (changed && state !== 'ready') goHome();
    updateAvatarPicker();
    updateMode();
    updateScores();
    if (changed && state === 'ready') focusHome();
  }

  function updateGameClocks() {
    const elapsed = SnakeRewards.timeLabel(engine.elapsedMs).padStart(5, '0');
    const settings = breakTimer.settings;
    const remaining = breakDue ? 0 : Math.max(0, settings.minutes * 60000 - breakTimer.continuousMs);
    const seconds = Math.ceil(remaining / 1000);
    const countdown = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
    if ($('playTime').textContent !== elapsed) $('playTime').textContent = elapsed;
    if ($('breakTime').textContent !== countdown) $('breakTime').textContent = countdown;
    $('breakReadout').hidden = !settings.enabled;
    const urgent = String(settings.enabled && seconds <= 10);
    if ($('gameClock').dataset.urgent !== urgent) $('gameClock').dataset.urgent = urgent;
  }

  function saveBreakSettings() {
    const minutes = Number($('breakMinutes').value);
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 60) {
      $('breakMinutes').value = String(breakTimer.settings.minutes);
      announce('Choose a whole number of minutes from 1 to 60.');
      return;
    }
    breakTimer.configure({ enabled: $('breakToggle').checked, minutes });
    breakDue = false;
    lastSpokenBreakSecond = null;
    breakVoice.cancel();
    breakLastTime = null;
    updateGameClocks();
    $('breakOptions').hidden = !breakTimer.settings.enabled;
    $('breakMinutes').disabled = !breakTimer.settings.enabled;
    if (canSave) {
      try { localStorage.setItem(breakKey, JSON.stringify(breakTimer.settings)); } catch { storageUnavailable(); }
    }
    announce(breakTimer.settings.enabled ? `Break auto-pause enabled after ${minutes} uninterrupted minute${minutes === 1 ? '' : 's'}.` : 'Break auto-pause is off.');
  }

  function updateAvatarPicker() {
    const hasName = Boolean(cleanName($('playerInput').value));
    $('avatarPicker').disabled = !hasName;
    $('avatarHint').textContent = hasName
      ? 'Pick a face, then press Let’s play.'
      : 'Enter your name to unlock the avatars.';
  }
  $('playerInput').addEventListener('input', updateAvatarPicker);
  updateAvatarPicker();

  function updateSkinUI() {
    const skin = SnakeSkins.get(playerSkin);
    $('skinSelect').value = skin.id;
    canvas.dataset.skin = skin.id;
    $('skinDescription').textContent = `${skin.description} ${canSave ? 'Saved in this browser.' : 'Available for this session.'}`;
    const preview = $('skinPreview');
    preview.dataset.skin = skin.id;
    preview.setAttribute('aria-label', `${skin.name} snake preview. ${skin.description}`);
    const previewContext = preview.getContext('2d');
    previewContext.clearRect(0, 0, preview.width, preview.height);
    previewContext.fillStyle = '#101e25';
    previewContext.fillRect(0, 0, preview.width, preview.height);
    const sample = {
      direction: 'right',
      snake: [
        { x: 13, y: 1 }, { x: 12, y: 1 }, { x: 11, y: 1 }, { x: 10, y: 1 },
        { x: 9, y: 1 }, { x: 8, y: 1 }, { x: 8, y: 2 }, { x: 7, y: 2 },
        { x: 6, y: 2 }, { x: 5, y: 2 }, { x: 4, y: 2 }, { x: 3, y: 2 },
      ],
    };
    SnakeRenderer.draw(previewContext, { left: 40, top: 0, cell: 40, player: sample, skin });
  }
  $('skinSelect').addEventListener('change', () => {
    const selected = $('skinSelect').value;
    if (!SnakeSkins.has(selected)) { updateSkinUI(); return; }
    playerSkin = selected;
    if (canSave) {
      try { localStorage.setItem(skinKey, playerSkin); } catch { storageUnavailable(); }
    }
    updateMode();
    draw();
    announce(`${SnakeSkins.get(playerSkin).name} skin applied to Player 1. Gameplay is unchanged.`);
  });

  function resetPresentation() {
    previousPlayers = SnakeMotion.capture(engine.players);
    visualTime = 0;
    noticeRemaining = 0;
    shieldFlashes.clear();
    denAnimations.clear();
    seasonTransitionRemaining = 0;
    $('eventNotice').hidden = true;
    sceneDirty = true;
  }
  $('backdropSelect').addEventListener('change', () => {
    const selected = $('backdropSelect').value;
    if (!Object.hasOwn(SnakeBoard.themes, selected)) { $('backdropSelect').value = backdrop; return; }
    backdrop = selected;
    if (canSave) {
      try { localStorage.setItem(backdropKey, backdrop); } catch { storageUnavailable(); }
    }
    canvas.dataset.backdrop = backdrop;
    draw();
    announce(`${SnakeBoard.themes[backdrop].name} backdrop selected.`);
  });

  function updateMode() {
    updateSkinUI();
    $('backdropSelect').value = backdrop;
    canvas.dataset.backdrop = backdrop;
    $('modeSelect').value = engine.mode;
    document.querySelector('.game-shell').dataset.mode = engine.mode;
    document.querySelector('.game-shell').dataset.players = engine.aiCount ? 'ai' : String(engine.playerCount);
    $('playersSelect').value = engine.aiCount ? 'ai' : String(engine.playerCount);
    $('aiSettings').hidden = !engine.aiCount;
    $('aiCountSelect').value = String(preferredAICount);
    $('foodSelect').value = String(engine.foodCount);
    $('aiStandings').hidden = !engine.aiCount;
    $('aiPersonalityHint').hidden = !engine.aiCount;
    $('aiPersonalityHint').textContent = engine.players.flatMap((player, index) => player.ai ? [`AI ${index}: ${SnakeAI.personality(engine, index).name}`] : []).join(' · ');
    const dual = engine.playerCount === 2;
    $('opponentEntry').hidden = !dual;
    $('opponentInput').required = dual;
    $('opponentScoreGroup').hidden = !engine.aiCount;
    $('opponentIdentity').hidden = !dual && !engine.aiCount;
    $('opponentScoreLabel').textContent = engine.aiCount ? 'AI LEFT' : 'P2 SCORE';
    $('opponentControlsLabel').textContent = engine.aiCount ? 'AI ARENA' : 'P2 · ARROWS';
    $('playerTwoControls').hidden = !dual;
    $('playerOneControlsLabel').textContent = dual ? 'P1 · WASD' : 'STEER';
    $('scoreLabel').textContent = dual ? 'TEAM SCORE' : 'YOUR SCORE';
    $('playerInputLabel').textContent = dual ? `Player 1 · ${SnakeSkins.get(playerSkin).name} · WASD` : 'Who’s playing?';
    $('controlsHint').textContent = steeringHint();
    $('modeHint').textContent = modes[engine.mode].hint;
    $('homeSummary').textContent = recordLabel();
    $('homeGoal').textContent = `Optional goal: ${roundGoal.description}`;
    $('itemGuide').textContent = `Animals +1 · × blocks are hazards · 🛡 one safe collision · ⏱ slows the board${engine.wraps ? ' · 🍄 +50 reverses controls · 🌿 cures them' : ''}`;
    if (state === 'ready') {
      $('playLabel').textContent = 'LET’S PLAY';
      $('overlayTag').textContent = `${modes[engine.mode].name.toUpperCase()} MODE`;
      $('overlayTitle').textContent = engine.aiCount ? `You vs ${engine.aiCount} AI snakes.` : dual ? 'One team. Two snakes.' : engine.wraps ? 'Small snake. Big plans.' : 'Watch your step.';
      $('overlayText').textContent = `${modes[engine.mode].hint}\n${engine.aiCount ? steeringHint() : dual ? 'P1: WASD · P2: arrow keys. Combine your catches and avoid collisions together.' : 'Choose Obstacles, Maze, or Classic in Settings, then play.'}`;
    }
    syncIdentityUI();
    canvas.setAttribute('aria-label', `Snake board. ${modes[engine.mode].name} mode. ${steeringHint()} Catch rats, rabbits, and frogs. ${modes[engine.mode].hint} Space pauses.`);
  }
  $('modeSelect').addEventListener('change', () => {
    if (['playing', 'countdown', 'paused', 'level-complete', 'season-transition', 'level-ready'].includes(state)) return;
    const mode = $('modeSelect').value;
    if (!Object.hasOwn(modes, mode)) return;
    engine.reset({ mode });
    resetPresentation();
    if (canSave) {
      try { localStorage.setItem(modeKey, mode); } catch { storageUnavailable(); }
    }
    updateMode();
    updateScores();
    draw();
    announce(`${modes[mode].name} mode selected. ${modes[mode].hint}`);
  });
  $('playersSelect').addEventListener('change', () => {
    if (['playing', 'countdown', 'paused', 'level-complete', 'season-transition', 'level-ready'].includes(state)) return;
    const selection = $('playersSelect').value;
    if (!['1', '2', 'ai'].includes(selection)) return;
    const playerCount = selection === 'ai' ? 1 : Number(selection);
    engine.reset({ playerCount, aiCount: selection === 'ai' ? preferredAICount : 0 });
    resetPresentation();
    if (canSave) {
      try { localStorage.setItem(playersKey, selection); } catch { storageUnavailable(); }
    }
    updateMode();
    updateScores();
    draw();
    announce(`${engine.aiCount ? 'AI Arena' : playerCount === 2 ? 'Two-player team' : 'Solo'} selected. ${steeringHint()}`);
  });
  $('aiCountSelect').addEventListener('change', () => {
    if (['playing', 'countdown', 'paused', 'level-complete', 'season-transition', 'level-ready'].includes(state)) return;
    const count = Number($('aiCountSelect').value);
    if (![2, 3].includes(count)) return;
    preferredAICount = count;
    if (engine.aiCount) {
      engine.reset({ aiCount: count });
      resetPresentation();
    }
    if (canSave) {
      try { localStorage.setItem(aiCountKey, String(count)); } catch { storageUnavailable(); }
    }
    updateMode();
    updateScores();
    draw();
    announce(`${count} AI opponents selected.`);
  });
  $('foodSelect').addEventListener('change', () => {
    if (['playing', 'countdown', 'paused', 'level-complete', 'season-transition', 'level-ready'].includes(state)) return;
    const foodCount = Number($('foodSelect').value);
    if (![1, 5, 10].includes(foodCount)) return;
    engine.reset({ foodCount });
    resetPresentation();
    if (canSave) {
      try { localStorage.setItem(foodKey, String(foodCount)); } catch { storageUnavailable(); }
    }
    updateMode();
    updateScores();
    draw();
    announce(`${foodCount} food items on the board.`);
  });
  updateMode();

  const announce = (message) => { $('announcer').textContent = message; };
  const format = (value) => String(value).padStart(2, '0');
  function updateGoldenStatus() {
    if (engine.season !== 'summer') {
      $('goldenStatus').dataset.active = 'false';
      $('goldenStatus').textContent = engine.season === 'sleeping' ? '❄ Hibernating… summer is next.' : `❄ WINTER · Guide ${engine.playerCount === 2 ? 'both snakes' : 'your snake'} into the ${engine.den.side}-edge DEN.`;
      return;
    }
    $('goldenStatus').dataset.active = String(Boolean(engine.goldenFood));
    $('goldenStatus').textContent = engine.goldenFood
      ? `On the board! +5 points · ${Math.ceil(engine.goldenTicks * engine.interval / 1000)}s left`
      : '★ Golden food · +5';
  }
  function updateEffectStatus() {
    const classic = engine.mode === 'classic' && engine.season === 'summer';
    $('mushroomStatus').hidden = !classic;
    $('mushroomRow').hidden = !classic;
    $('herbRow').hidden = !classic;
    $('mushroomStatus').textContent = `🍄 ${engine.mushrooms.length} · +50`;
    const affected = engine.players.filter((player) => !player.ai && player.alive && player.controlsReversed);
    $('controlStatus').hidden = affected.length === 0;
    $('controlStatus').dataset.reversed = String(affected.length > 0);
    const labels = engine.players.flatMap((player, index) => affected.includes(player) ? [`P${index + 1}`] : []);
    const wait = affected.length ? Math.ceil(Math.min(...affected.map((player) => engine.herbWaitMs(player))) / 1000) : 0;
    const remedy = engine.herbs.length ? '🌿 herb ready' : wait > 0 ? `🌿 in ${wait}s` : '🌿 awaiting space';
    $('controlStatus').textContent = affected.length ? `${labels.join('/')} REVERSED · ${remedy}` : '';
    $('playerOneControls').dataset.reversed = String(Boolean(engine.players[0].controlsReversed));
    $('playerTwoControls').dataset.reversed = String(Boolean(engine.players[1]?.controlsReversed));
    $('playerOneControlsLabel').textContent = engine.players[0].controlsReversed ? 'P1 · REVERSED' : engine.playerCount === 2 ? 'P1 · WASD' : 'STEER';
    $('playerTwoControlsLabel').textContent = engine.players[1]?.controlsReversed ? 'P2 · REVERSED' : 'P2 · ARROWS';
    const opposite = { up: 'down', down: 'up', left: 'right', right: 'left' };
    document.querySelectorAll('[data-direction]').forEach((button) => {
      const index = Number(button.dataset.player || 0);
      const reversed = engine.players[index]?.controlsReversed;
      const input = button.dataset.direction;
      button.setAttribute('aria-label', `Player ${index + 1}: ${input}${reversed ? ` input moves ${opposite[input]} (reversed)` : ''}`);
    });
    const powers = engine.players.flatMap((player, index) => !player.ai && engine.shieldRemainingMs(player) ? [`🛡 P${index + 1} ${Math.ceil(engine.shieldRemainingMs(player) / 1000)}s`] : []);
    if (engine.slowRemainingMs) powers.push(`⏱ SLOW ${Math.ceil(engine.slowRemainingMs / 1000)}s`);
    $('powerupStatus').hidden = powers.length === 0;
    $('powerupStatus').textContent = powers.join(' · ');
    const chains = engine.players.slice(0, engine.playerCount).flatMap((player, index) => player.comboCount >= 2 && engine.comboRemainingMs(player) > 0 ? [`P${index + 1} CHAIN ${player.comboCount}`] : []);
    $('comboStatus').hidden = chains.length === 0;
    $('comboStatus').textContent = chains.join(' · ');
  }
  function updateScores() {
    selectBestRecord();
    $('recordType').textContent = recordLabel();
    $('best').setAttribute('title', `${recordLabel()} best${bestName ? ` by ${bestName}` : ''}`);
    $('best').setAttribute('aria-label', `${recordLabel()} best score: ${best}`);
    $('score').textContent = format(engine.isTeam ? engine.totalScore : engine.score);
    $('teamNameBanner').hidden = !engine.isTeam;
    $('teamNameBanner').textContent = engine.isTeam ? `TEAM · ${teamName}` : '';
    $('playerOneScore').hidden = !engine.isTeam;
    $('playerTwoScore').hidden = !engine.isTeam;
    $('playerOneScore').textContent = `${engine.players[0].score} pts${engine.players[0].hibernating ? ' · RESTING' : ''}`;
    $('playerTwoScore').textContent = `${engine.players[1]?.score || 0} pts${engine.players[1]?.hibernating ? ' · RESTING' : ''}`;
    const livingBots = engine.players.filter((player) => player.ai && player.alive).length;
    $('opponentScore').textContent = format(engine.aiCount ? livingBots : engine.players[1]?.score || 0);
    $('opponentName').textContent = engine.aiCount ? `${livingBots}/${engine.aiCount} alive` : opponentName;
    $('aiStandings').textContent = engine.players.filter((player) => player.ai)
      .map((player, index) => `AI ${index + 1}: ${player.score} points${player.alive ? '' : ' · eliminated'}${player.controlsReversed ? ' · reversed' : ''} · ${SnakeAI.personality(engine, index + 1).name}`).join(' | ');
    $('best').textContent = format(best);
    $('bestDetailScore').textContent = format(best);
    $('playerName').textContent = playerName || '—';
    $('playerAvatar').hidden = !playerName;
    $('playerAvatar').dataset.avatar = playerAvatar;
    $('playerAvatar').setAttribute('src', `assets/avatar-${playerAvatar}.svg`);
    $('playerAvatar').setAttribute('alt', `${avatars[playerAvatar]} human face avatar`);
    $('bestName').textContent = bestName || 'No record yet';
    $('preyName').textContent = engine.foods.length > 1 ? `${engine.foods.length} items` : engine.foodType || 'None';
    const speed = `${(engine.baseInterval / engine.interval).toFixed(1)}×`;
    $('pace').textContent = speed;
    $('level').textContent = String(engine.level);
    $('arenaLevel').textContent = String(engine.level);
    $('levelSpeed').textContent = speed;
    $('helpCurrent').textContent = `Current setup: ${recordLabel()} — Level ${engine.level}, ${speed}, ${Math.round(engine.interval)} ms per cell${engine.slowRemainingMs ? ' (slow motion active)' : ''}.`;
    $('totalEaten').textContent = String(engine.totalCatches);
    $('goldenCount').textContent = String(engine.goldenCaught);
    $('mushroomCount').textContent = String(engine.mushroomCaught);
    $('herbCount').textContent = String(engine.herbsCaught);
    $('powerupCount').textContent = String(engine.powerupsCaught);
    updateGoldenStatus();
    updateEffectStatus();
    const catches = engine.totalEaten;
    for (const animal of ['rat', 'rabbit', 'frog']) {
      $(`${animal}Count`).textContent = String(catches[animal]);
      $(`${animal}Target`).textContent = String(engine.levelTarget);
    }
    const target = engine.levelTarget;
    for (const animal of ['rat', 'rabbit', 'frog']) {
      const count = Math.min(engine.progressionEaten[animal], target);
      $(`${animal}Progress`).max = target;
      $(`${animal}Progress`).value = count;
      $(`${animal}ProgressText`).textContent = `${count}/${target}`;
    }
    $('roundGoal').textContent = `Optional goal — ${roundGoal.description} ${engine.players.slice(0, engine.playerCount).map((player, index) => { const progress = SnakeRewards.goalProgress(player, roundGoal); return `P${index + 1}: ${progress.value}/${progress.target}${progress.complete ? ' ✓' : ''}`; }).join(' · ')}`;
    $('levelHint').textContent = engine.season === 'summer' ? `This level: ${target} of each animal, caught by humans. Then find the winter den. Next level needs ${target + 5} of each.` : 'Level completed! Winter is coming. Reach the edge den to hibernate; your score will be kept.';
  }

  function setState(next) {
    state = next;
    sceneDirty = true;
    const active = ['playing', 'countdown', 'paused', 'level-complete', 'season-transition', 'level-ready'].includes(state);
    if (state === 'playing' || state === 'countdown') {
      closeHeaderPanels();
    }
    if (state === 'paused' || state === 'over' || state === 'won') resetCheer();
    document.querySelector('.game-shell').dataset.state = state;
    document.querySelector('.game-shell').dataset.season = engine.season;
    $('matchStatus').textContent = {
      ready: 'READY TO GROW', countdown: 'GET READY', playing: 'ON THE MOVE', paused: 'TAKING A BREATHER',
      over: 'GOOD GAME', won: 'BOARD COMPLETE', 'level-complete': 'WINTER IS COMING', 'season-transition': 'HIBERNATING', 'level-ready': 'SUMMER HAS ARRIVED',
    }[state];
    $('overlay').hidden = ['playing', 'countdown', 'season-transition'].includes(state);
    $('homeIntro').hidden = state !== 'ready';
    $('countdown').hidden = state !== 'countdown';
    $('playerEntry').hidden = state !== 'ready';
    $('roundResults').hidden = !['over', 'won'].includes(state);
    $('resultHome').hidden = !['over', 'won'].includes(state);
    previewSound = false;
    syncMusic();
    for (const id of ['modeSelect', 'playersSelect', 'aiCountSelect', 'foodSelect']) $(id).disabled = active;
    $('pauseButton').disabled = !['playing', 'countdown', 'paused'].includes(state);
    $('pauseButton').textContent = state === 'paused' ? '▷ RESUME' : 'Ⅱ PAUSE';
    $('pauseButton').setAttribute('aria-label', state === 'paused' ? 'Resume game' : 'Pause game');
    breakTimer.reset();
    breakLastTime = null;
    breakDue = false;
    lastSpokenBreakSecond = null;
    breakVoice.cancel();
    updateGameClocks();
    syncIdentityUI();
    lastTime = null;
    countdownLastTime = null;
    gesture = null;
  }

  function showOverlay(tag, title, text, button, hint) {
    $('overlayTag').textContent = tag;
    $('overlayTitle').textContent = title;
    $('overlayText').textContent = text;
    $('playLabel').textContent = button;
    $('spaceHint').textContent = hint;
    (['paused', 'over', 'won', 'level-complete', 'level-ready'].includes(state) ? $('playButton') : $('playerInput')).focus({ preventScroll: true });
  }

  // Effects are optional; failure here must never disable the music track.
  async function unlockAudio() {
    if (!soundOn) return;
    // Prime native playback during the user gesture, even without Web Audio.
    const request = ++chompRequest;
    chompPriming = true;
    chomp.muted = true;
    try {
      Promise.resolve(chomp.play()).then(() => {
        if (request !== chompRequest) return;
        chomp.pause();
        chomp.currentTime = 0;
        chompPriming = false;
        chomp.muted = !soundOn;
      }).catch(() => { /* An actual catch or Test chomp can retry. */ });
    } catch { /* Retry on the next catch. */ }
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      if (!audio) audio = new AudioContext();
      if (!effectsGain) {
        effectsGain = audio.createGain();
        effectsGain.connect(audio.destination);
      }
      effectsGain.gain.setValueAtTime(soundOn ? music.volume : 0, audio.currentTime);
      if (audio.state !== 'running') await audio.resume();
    } catch { /* Native media playback still works without Web Audio. */ }
  }

  function updateSoundControls() {
    chomp.volume = music.volume;
    chomp.muted = !soundOn || chompPriming;
    if (effectsGain) effectsGain.gain.setValueAtTime(soundOn ? music.volume : 0, audio.currentTime);
    $('soundButton').setAttribute('aria-pressed', String(soundOn));
    $('soundButton').setAttribute('aria-label', soundOn ? 'Mute music and sound' : 'Enable music and sound');
    $('testSoundButton').textContent = previewSound ? '■ Stop test' : '♪ Test sound';
    $('testSoundButton').setAttribute('aria-pressed', String(previewSound));
  }

  function syncMusic() {
    const request = ++playbackRequest;
    updateSoundControls();
    if (!soundOn || (!['playing', 'countdown'].includes(state) && !previewSound)) {
      music.pause();
      $('soundLabel').textContent = soundOn ? 'MUSIC READY' : 'MUSIC OFF';
      $('audioStatus').textContent = soundOn ? 'Music starts with Play, or try Test sound.' : 'Music and effects are muted.';
      return;
    }
    music.muted = false;
    $('soundLabel').textContent = 'STARTING…';
    $('audioStatus').textContent = 'Starting audio…';
    // Call play directly inside the click/key handler to satisfy autoplay rules.
    try {
      Promise.resolve(music.play()).then(() => {
        if (request !== playbackRequest) return;
        $('soundLabel').textContent = 'MUSIC PLAYING';
        $('audioStatus').textContent = music.volume === 0 ? 'Volume is zero. Move the volume slider to hear music.' : 'Track playing. If silent, check the browser tab/site mute and your speaker output.';
      }).catch((error) => audioFailed(error, request));
    } catch (error) { audioFailed(error, request); }
  }

  function audioFailed(error, request) {
    if (request !== playbackRequest) return;
    previewSound = false;
    updateSoundControls();
    $('soundLabel').textContent = 'RETRY SOUND';
    $('audioStatus').textContent = error.name === 'NotAllowedError'
      ? 'Browser blocked audio. Click Test sound to allow playback.'
      : 'Music could not load. Refresh the page, then click Test sound to retry.';
  }

  function tone(frequency, duration = 0.09, { delay = 0, end = frequency, type = 'sine', volume = 0.22 } = {}) {
    if (!soundOn || !effectsGain || audio.state !== 'running' || music.volume === 0) return;
    const start = audio.currentTime + delay;
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    oscillator.frequency.exponentialRampToValueAtTime(end, start + duration);
    gain.gain.setValueAtTime(0.001, start);
    gain.gain.linearRampToValueAtTime(volume, start + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
    oscillator.connect(gain);
    gain.connect(effectsGain);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
    oscillator.start(start);
    oscillator.stop(start + duration);
  }

  function playChomp() {
    if (!soundOn || music.volume === 0) return;
    const request = ++chompRequest;
    chompPriming = false;
    chomp.muted = false;
    chomp.volume = music.volume;
    const failed = () => {
      if (request === chompRequest) $('audioStatus').textContent = 'Chomp could not play. Click Test chomp to retry, or refresh the page.';
    };
    try {
      chomp.currentTime = 0;
      Promise.resolve(chomp.play()).catch(failed);
    } catch { failed(); }
  }

  function playGameOver() {
    // A longer descending buzz is deliberately distinct from a bite.
    tone(220, 0.16, { end: 175, type: 'sawtooth', volume: 0.16 });
    tone(165, 0.18, { delay: 0.17, end: 125, type: 'sawtooth', volume: 0.16 });
    tone(110, 0.38, { delay: 0.36, end: 45, type: 'sawtooth', volume: 0.18 });
  }

  function startGame() {
    if (state === 'countdown') return;
    if (identityChoice === 'choose') { announce('Choose Google, Facebook, or Play without login first.'); $('guestPlayButton').focus({ preventScroll: true }); return; }
    const name = authUser ? authUser.name : cleanName($('playerInput').value);
    if (engine.playerCount === 2 && !cleanName($('teamInput').value)) {
      $('teamEntry').hidden = false;
      $('teamInput').setAttribute('aria-invalid', 'true');
      $('teamHint').textContent = 'Please enter a team name.';
      $('teamInput').focus({ preventScroll: true });
      return;
    }
    if (engine.playerCount === 2) teamName = cleanName($('teamInput').value);
    if (!name) {
      if (state === 'playing') pause();
      $('playerEntry').hidden = false;
      $('playerInput').setAttribute('aria-invalid', 'true');
      $('nameHint').textContent = 'Please enter your name before playing.';
      $('playerInput').focus({ preventScroll: true });
      announce('Who is playing? Please enter your name.');
      return;
    }
    const secondName = cleanName($('opponentInput').value);
    if (engine.playerCount === 2 && !secondName) {
      if (state === 'playing') pause();
      $('playerEntry').hidden = false;
      $('opponentInput').setAttribute('aria-invalid', 'true');
      $('opponentHint').textContent = 'Please enter a name for Player 2.';
      $('opponentInput').focus({ preventScroll: true });
      announce('Please enter a name for Player 2.');
      return;
    }
    if (secondName) opponentName = secondName;
    $('opponentInput').value = opponentName;
    $('opponentInput').setAttribute('aria-invalid', 'false');
    $('opponentHint').textContent = 'Orange snake · arrow keys. Both players share this keyboard.';
    playerName = name;
    $('playerInput').value = name;
    $('playerInput').setAttribute('aria-invalid', 'false');
    $('nameHint').textContent = 'Your name is saved on this device. Avatar is optional.';
    updateAvatarPicker();
    if (canSave) {
      try {
        if (!authUser) { guestName = playerName; localStorage.setItem(playerKey, playerName); }
        if (engine.playerCount === 2) localStorage.setItem(teamKey, teamName);
        localStorage.setItem(avatarKey, playerAvatar);
        localStorage.setItem(opponentKey, opponentName);
      } catch { storageUnavailable(); }
    }
    void unlockAudio();
    engine.reset();
    roundGoal = SnakeRewards.goalFor(++roundNumber);
    roundRecordPlayer = null;
    completedGoals.clear();
    resetPresentation();
    updateMode();
    resetCheer();
    startingBest = best;
    elapsed = -250; // A brief runway to choose your first direction.
    updateScores();
    countdownElapsed = 0;
    pausedCountdown = false;
    $('countdownNumber').textContent = '1';
    $('countdownGoal').textContent = `Optional goal: ${roundGoal.description}`;
    setState('countdown');
    $('footerMessage').textContent = modes[engine.mode].hint;
    canvas.focus({ preventScroll: true });
    announce(`${playerName}, get ready. 1, 2, 3, GO! Playing with the ${avatars[playerAvatar]} avatar. ${modes[engine.mode].name} mode. ${modes[engine.mode].hint} ${steeringHint()} ${engine.playerCount === 2 ? `${opponentName} is Player 2. ` : ''}Catch the ${engine.foodType}.`);
  }

  function pause() {
    if (state === 'playing' || state === 'countdown') {
      pausedCountdown = state === 'countdown';
      setState('paused');
      showOverlay('NO RUSH. WE’LL WAIT.', 'A little breather.', pausedCountdown ? 'Your countdown will continue when you return.' : 'Your next bite is right where you left it.', 'BACK TO IT', 'or press space to resume');
      announce('Game paused.');
    } else if (state === 'paused') {
      void unlockAudio();
      setState(pausedCountdown ? 'countdown' : 'playing');
      canvas.focus({ preventScroll: true });
      announce(pausedCountdown ? 'Countdown resumed.' : 'Game resumed.');
    }
  }

  function goHome() {
    closeHeaderPanels();
    countdownElapsed = 0;
    pausedCountdown = false;
    elapsed = 0;
    roundGoal = SnakeRewards.goalFor(roundNumber + 1);
    roundRecordPlayer = null;
    completedGoals.clear();
    engine.reset();
    resetPresentation();
    resetCheer();
    setState('ready');
    updateMode();
    updateScores();
    draw();
    focusHome();
    announce('Welcome home. Choose your map and players, then play.');
  }

  function advance() {
    previousPlayers = SnakeMotion.capture(engine.players);
    const previousLevel = engine.level;
    const hadGoldenFood = Boolean(engine.goldenFood);
    const hadHerb = engine.herbs.length > 0;
    if (engine.aiCount) SnakeAI.steer(engine);
    const result = engine.tick();
    const caughtGolden = engine.lastCatches.some(({ type }) => type === 'golden');
    const bonusNotice = !hadGoldenFood && engine.goldenFood ? 'Golden food appeared! Catch the gold star for 5 bonus points.'
      : hadGoldenFood && !engine.goldenFood && !caughtGolden && result !== 'lost' ? 'Golden food expired. Watch for the next one!' : '';
    const herbNotice = !hadHerb && engine.herbs.length ? 'Healing herbs appeared! Collect a green herb to restore normal controls.' : '';
    const comboNotice = engine.lastEvents.filter((event) => event.type === 'combo-bonus').map((event) => `${nameFor(event.playerIndex)}: ${event.streak}-animal chain! +${event.bonus} combo bonus.`).join(' ');
    const shieldNotice = engine.lastEvents.filter((event) => event.type === 'shield-block').map((event) => `${nameFor(event.playerIndex)}: shield absorbed a hit! Turn to safety.`).join(' ');
    if (engine.lastCatches.length) {
      const candidates = engine.isTeam ? [{ score: engine.totalScore, name: teamName, index: 'team' }]
        : engine.lastCatches.filter(({ playerIndex }) => !engine.players[playerIndex].ai).map(({ playerIndex }) => ({ score: engine.players[playerIndex].score, name: nameFor(playerIndex), index: playerIndex }));
      for (const candidate of candidates) {
        if (candidate.score <= best) continue;
        best = candidate.score;
        bestName = candidate.name;
        roundRecordPlayer = candidate.index;
        records.set(recordKey(), { score: best, name: bestName });
        if (canSave) {
          try { localStorage.setItem(`${storageKey}:${recordKey()}`, JSON.stringify({ score: best, name: bestName })); }
          catch { storageUnavailable(); }
        }
      }
      updateScores();
      cheer();
      playChomp();
      if (caughtGolden) tone(1046, 0.18, { end: 1568, volume: 0.12 });
      const levelUp = engine.level > previousLevel;
      if (engine.lastCatches.some(({ type }) => type === 'mushroom')) tone(330, 0.22, { end: 165, volume: 0.12 });
      if (engine.lastCatches.some(({ type }) => type === 'herb')) tone(528, 0.2, { end: 1056, volume: 0.12 });
      const catches = engine.lastCatches.map(({ playerIndex, type, points }) => {
        if (type === 'mushroom') return `${nameFor(playerIndex)} ate a mushroom! +50. Controls reversed: left ↔ right, up ↔ down until a herb.`;
        if (type === 'herb') return `${nameFor(playerIndex)} collected a healing herb. Normal controls restored.`;
        if (type === 'shield') return `${nameFor(playerIndex)} collected a shield: one safe collision, up to 8 seconds.`;
        if (type === 'slow') return `${nameFor(playerIndex)} collected slow motion: the board slows for 6 seconds.`;
        return `${nameFor(playerIndex)} ${type === 'golden' ? 'caught golden food' : 'caught another bite'}! +${points}`;
      });
      $('footerMessage').textContent = `${levelUp ? `Level ${engine.level}! ` : ''}${catches.join(' · ')}`;
      announce(`${levelUp ? `Level ${engine.level}! Speed increased. ` : ''}${engine.lastCatches.map(({ playerIndex, type, points }) => `${nameFor(playerIndex)}: ${type === 'golden' ? `Golden food! +${points} bonus points. ` : ''}Score ${engine.players[playerIndex].score}.`).join(' ')} Next prey: ${engine.foodType || 'none'}. ${catches.filter((_, index) => ['mushroom', 'herb', 'shield', 'slow'].includes(engine.lastCatches[index].type)).join(' ')} ${bonusNotice} ${herbNotice} ${shieldNotice} ${comboNotice}`);
    } else {
      updateScores();
      if (bonusNotice || herbNotice || shieldNotice) announce([bonusNotice, herbNotice, shieldNotice].filter(Boolean).join(' '));
      if (shieldNotice) $('footerMessage').textContent = shieldNotice;
    }
    const newGoals = engine.players.slice(0, engine.playerCount).flatMap((player, index) => {
      if (completedGoals.has(index) || !SnakeRewards.goalProgress(player, roundGoal).complete) return [];
      completedGoals.add(index);
      return [nameFor(index)];
    });
    const goalNotice = newGoals.length ? `${newGoals.join(' & ')}: goal complete — ${roundGoal.title}!` : '';
    if (goalNotice) announce(`${$('announcer').textContent} ${goalNotice}`);
    const shieldSaves = engine.lastEvents.filter((event) => event.type === 'shield-block');
    for (const event of shieldSaves) shieldFlashes.set(event.playerIndex, 1000);
    const humanShieldSaves = shieldSaves.filter((event) => !engine.players[event.playerIndex].ai);
    if (humanShieldSaves.length) {
      showNotice(`${humanShieldSaves.map((event) => nameFor(event.playerIndex)).join(' & ')}: shield saved you — turn now!`, 'shield');
    } else {
      const pickup = engine.lastCatches.find((caught) => !engine.players[caught.playerIndex].ai && ['mushroom', 'herb', 'shield', 'slow'].includes(caught.type));
      if (!pickup && comboNotice) showNotice([comboNotice, goalNotice].filter(Boolean).join(' '), 'combo');
      else if (!pickup && goalNotice) showNotice(goalNotice);
      if (pickup) showNotice({ mushroom: 'Controls REVERSED: left ↔ right, up ↔ down. Find a green herb!', herb: 'Controls restored. You’re back on track!', shield: 'Shield ready: one safe collision, up to 8 seconds.', slow: 'Slow motion: breathing room for 6 seconds.' }[pickup.type], pickup.type);
    }
    for (const event of engine.lastEvents.filter((entry) => entry.type === 'den-entered')) {
      const player = engine.players[event.playerIndex];
      denAnimations.set(event.playerIndex, { player: { ...player, snake: previousPlayers[event.playerIndex].snake }, remaining: 1000 });
      announce(`${nameFor(event.playerIndex)} is hibernating.${engine.playerCount === 2 && engine.season === 'winter' ? ' Guide your teammate into the den too.' : ' Summer is coming next.'}`);
    }
    if (result === 'level-complete') {
      setState('level-complete');
      canvas.setAttribute('aria-label', `Winter board. Guide ${engine.playerCount === 2 ? 'both snakes' : 'your snake'} into the den on the ${engine.den.side} edge. Normal steering controls. Avoid walls and bodies.`);
      showOverlay(`LEVEL ${engine.level} COMPLETED`, 'Winter is coming', `${engine.levelTarget} of every animal caught! Guide ${engine.playerCount === 2 ? 'both teammates' : 'your snake'} into the DEN on the ${engine.den.side} edge to hibernate. Your score stays with you. Controls are normal; avoid the remaining hazards.`, 'FIND SHELTER', 'Summer brings a fresh three-segment snake and a higher target.');
      announce(`Level ${engine.level} completed. Winter is coming. Find the ${engine.den.side}-edge den.`);
    } else if (result === 'hibernated') {
      seasonTransitionRemaining = 1100;
      setState('season-transition');
    }
    if (result === 'lost' || result === 'won') {
      const won = result === 'won';
      setState(won ? 'won' : 'over');
      renderRoundResults();
      if (won) tone(880, 0.25);
      else playGameOver();
      const reasons = { wall: 'hit a wall', barrier: 'hit a barrier', rock: 'hit a stone block', body: 'ran into your own body', opponent: 'hit the other snake', 'head-on': 'collided head-on' };
      if (engine.aiCount) {
        const humanWon = engine.winner === 0;
        const title = humanWon ? 'You win the AI Arena!' : engine.endReason === 'filled' && engine.winner === null ? 'It’s a draw!' : 'The AI got this round.';
        const scores = engine.players.map((player, index) => `${nameFor(index)}: ${player.score}`).join(' · ');
        const cause = engine.endReason === 'survival' ? 'You are the last snake standing.'
          : engine.endReason === 'filled' ? 'The board is full. Highest surviving score wins.'
          : `You ${reasons[engine.collision] || 'crashed'}.`;
        showOverlay('AI ARENA COMPLETE', title, `${cause}\n${scores}`, 'REMATCH', 'or press space for a rematch');
        announce(`${title} ${cause} ${scores}`);
      } else if (engine.isTeam) {
        const title = won ? `${teamName} wins!` : `${teamName} · round over`;
        const scores = `Team score: ${engine.totalScore}. P1 ${playerName}: ${engine.players[0].score} · P2 ${opponentName}: ${engine.players[1].score}.`;
        const cause = won ? 'You filled the board together!' : engine.players.map((player, index) => player.collision ? `${nameFor(index)} ${reasons[player.collision] || 'crashed'}.` : '').filter(Boolean).join(' ');
        showOverlay('TEAM ROUND COMPLETE', title, `${scores}\n${cause}`, 'REMATCH', 'or press space for a rematch');
        announce(`${title} ${scores} ${cause}`);
      } else {
        const lossReason = engine.collision ? `You ${reasons[engine.collision] || 'crashed'}.` : 'Game over.';
        showOverlay(won ? 'EVERY LAST BITE' : engine.score > startingBest ? 'A NEW CLUB RECORD' : 'EVERY END IS A NEW BEGINNING',
          won ? 'You outgrew the board.' : 'One more bite?',
          `${playerName}, you scored ${engine.score}. Best: ${best} by ${bestName || '—'}.\n${won ? 'A perfectly full plate. Well played.' : `${lossReason} Try another route!`}`,
          'PLAY AGAIN', 'or press space for another round');
        announce(`${won ? 'You won!' : `Game over. ${lossReason}`} ${playerName} scored ${engine.score}. Best score ${best} by ${bestName || 'no one yet'}.`);
      }
    }
  }

  function playAction() {
    if (state === 'level-complete') {
      elapsed = 0;
      setState('playing');
      canvas.focus({ preventScroll: true });
      announce(`Find the den on the ${engine.den.side} edge. ${engine.playerCount === 2 ? 'Both teammates must enter.' : 'Steer your snake inside.'}`);
    } else if (state === 'level-ready') {
      elapsed = -250;
      countdownElapsed = 0;
      pausedCountdown = false;
      $('countdownNumber').textContent = '1';
      $('countdownGoal').textContent = `Summer · Level ${engine.level} · Catch ${engine.levelTarget} of each animal`;
      setState('countdown');
      canvas.focus({ preventScroll: true });
    } else if (state === 'paused') pause();
    else startGame();
  }

  function renderRoundResults() {
    $('roundResults').dataset.players = String(engine.playerCount);
    for (let index = 0; index < 2; index++) {
      const player = index < engine.playerCount ? engine.players[index] : null;
      $(`result${index}Card`).hidden = !player;
      if (!player) continue;
      const result = SnakeRewards.summary(player, { goal: roundGoal, newRecord: engine.isTeam ? roundRecordPlayer === 'team' && engine.totalScore > startingBest : roundRecordPlayer === index && player.score > startingBest });
      $(`result${index}Name`).textContent = nameFor(index);
      $(`result${index}Score`).textContent = String(result.score);
      $(`result${index}Time`).textContent = result.time;
      $(`result${index}Animals`).textContent = String(result.animals);
      $(`result${index}Chain`).textContent = `${result.bestCombo} · +${result.comboBonus} bonus`;
      $(`result${index}Prey`).textContent = `Rat ${result.eaten.rat} · Rabbit ${result.eaten.rabbit} · Frog ${result.eaten.frog}`;
      $(`result${index}Medals`).textContent = result.medals.join(' · ') || 'A fresh start is one bite away.';
      $(`result${index}Goal`).textContent = result.goal.complete ? `✓ Goal complete: ${result.goal.title}` : `Optional: ${result.goal.title} — ${result.goal.value}/${result.goal.target}`;
    }
    $('resultRecord').textContent = `${recordLabel()} · Best ${best}${bestName ? ` by ${bestName}` : ''}`;
  }

  function ellipse(x, y, rx, ry, color, rotation = 0) {
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rotation, 0, Math.PI * 2); ctx.fill();
  }

  function drawPrey(x, y, cell, type, time, lift = 0) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(cell, cell);
    ellipse(0.04, 0.25, 0.36, 0.15, '#0008');
    ctx.translate(0, -0.08 - (reducedMotion ? 0 : lift));
    if (!reducedMotion && type === 'rat') ctx.rotate(Math.sin(time / 100 + x) * 0.035);
    // A warm halo keeps the small animals easy to spot against the court.
    ellipse(0, 0, 0.48, 0.46, '#f8b48722');
    if (type === 'frog') {
      for (const side of [-1, 1]) {
        ellipse(side * 0.29, 0.18, 0.15, 0.19, '#79ad45', side * 0.65);
        ellipse(side * 0.23, -0.24, 0.13, 0.14, '#a8d95f');
      }
      ellipse(0, 0.05, 0.27, 0.3, '#8dc34f');
      const croak = reducedMotion ? 1 : 1 + Math.max(0, Math.sin(time / 350 + x)) * 0.12;
      ellipse(0, 0.11, 0.16 * croak, 0.18 * croak, '#c1db7a');
      for (const side of [-1, 1]) {
        ellipse(side * 0.23, -0.27, 0.075, 0.08, '#f8edbc');
        ellipse(side * 0.23, -0.29, 0.035, 0.05, '#172c23');
      }
    } else {
      const rabbit = type === 'rabbit';
      const fur = rabbit ? '#e4d7b9' : '#aaa59e';
      if (!rabbit) {
        ctx.strokeStyle = '#d99f99'; ctx.lineWidth = 0.055; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(-0.2, 0.2); ctx.bezierCurveTo(-0.55, 0.48, -0.48, -0.12, -0.28, 0.04); ctx.stroke();
      }
      ellipse(0, 0.12, 0.26, 0.28, fur);
      if (rabbit) ellipse(-0.25, 0.22, 0.1, 0.1, '#fff2db');
      for (const side of [-1, 1]) {
        ellipse(side * 0.16, rabbit ? -0.3 : -0.2, rabbit ? 0.085 : 0.13, rabbit ? 0.23 : 0.13, fur, side * 0.2 + (rabbit && !reducedMotion ? Math.sin(time / 500) * 0.06 : 0));
        ellipse(side * 0.16, rabbit ? -0.31 : -0.2, rabbit ? 0.04 : 0.075, rabbit ? 0.15 : 0.075, '#d99f99', side * 0.2);
      }
      ellipse(0, -0.08, 0.21, 0.2, fur);
      for (const side of [-1, 1]) {
        ellipse(side * 0.12, -0.12, 0.035, 0.04, '#182a29');
        ctx.strokeStyle = '#ede5d3'; ctx.lineWidth = 0.018;
        ctx.beginPath(); ctx.moveTo(side * 0.07, 0.01); ctx.lineTo(side * 0.32, -0.02);
        ctx.moveTo(side * 0.07, 0.04); ctx.lineTo(side * 0.32, 0.09); ctx.stroke();
      }
      ellipse(0, 0.025, 0.045, 0.035, '#c98685');
    }
    ctx.restore();
  }

  function drawGoldenFood(x, y, cell, time) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(cell, cell);
    ellipse(0.04, 0.28, 0.35, 0.13, '#0009');
    ctx.translate(0, -0.12);
    const pulse = reducedMotion ? 1 : 1 + Math.sin(time / 200) * 0.08;
    ellipse(0, 0, 0.49 * pulse, 0.49 * pulse, '#ffda6533');
    ctx.fillStyle = '#ffda65';
    ctx.strokeStyle = '#bd7b16';
    ctx.lineWidth = 0.04;
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const angle = -Math.PI / 2 + i * Math.PI / 5;
      const radius = (i % 2 === 0 ? 0.4 : 0.2) * pulse;
      if (i === 0) ctx.moveTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
      else ctx.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
    }
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ellipse(-0.08, -0.1, 0.07, 0.05, '#fff8d5', -0.5);
    ctx.font = 'bold 0.34px system-ui';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffe9a3';
    ctx.fillText('+5', 0, -0.55);
    ctx.restore();
  }

  function draw() {
    sceneDirty = false;
    const { cell, left, top } = boardPainter.draw(ctx, {
      width, height, columns: engine.columns, rows: engine.rows, obstacles: engine.obstacles,
      theme: backdrop, season: engine.season, pixelRatio: canvas.width / width,
    });
    canvas.dataset.layout = '2d';
    canvas.dataset.season = engine.season;
    const den = engine.den ? { x: left + (engine.den.x + 0.5) * cell, y: top + (engine.den.y + 0.5) * cell } : null;
    if (den) {
      ellipse(den.x, den.y, cell * 0.49, cell * 0.4, '#d8c3a2');
      ellipse(den.x, den.y, cell * 0.42, cell * 0.34, '#806349');
      ellipse(den.x, den.y, cell * 0.35, cell * 0.27, '#080d10');
      ctx.fillStyle = '#f8eed1'; ctx.font = `bold ${Math.max(9, cell * 0.28)}px system-ui`; ctx.textAlign = 'center';
      ctx.fillText('DEN', den.x, den.y + (engine.den.y === 0 ? cell * 0.95 : -cell * 0.65));
    }
    const progress = ['playing', 'paused'].includes(state) ? Math.max(0, Math.min(1, elapsed / engine.interval)) : 1;
    const players = SnakeMotion.interpolate(previousPlayers, engine.players, progress, engine);
    const foodTime = engine.elapsedMs + Math.max(0, elapsed);
    for (const food of engine.foods) {
      const point = reducedMotion ? { ...food, lift: 0 } : SnakeMotion.foodPosition(food, foodTime, engine);
      drawPrey(left + (point.x + 0.5) * cell, top + (point.y + 0.5) * cell, cell, food.type, visualTime, point.lift);
    }
    if (engine.goldenFood) drawGoldenFood(left + (engine.goldenFood.x + 0.5) * cell, top + (engine.goldenFood.y + 0.5) * cell, cell, visualTime);
    SnakeItemsRenderer.draw(ctx, { mushrooms: engine.mushrooms, herbs: engine.herbs, powerups: engine.powerups, left, top, cell, time: visualTime, animate: !reducedMotion });
    players.forEach((player, index) => {
      if (!player.alive || player.hibernating) return;
      const skin = SnakeSkins.forPlayer(index, playerSkin);
      SnakeRenderer.draw(ctx, { left, top, cell, time: visualTime, player, skin, animate: state === 'playing' && !reducedMotion });
      const x = left + (player.snake[0].x + 0.5) * cell;
      const y = top + (player.snake[0].y + 0.5) * cell;
      if (engine.shieldRemainingMs(player) || shieldFlashes.has(index)) {
        ctx.save(); ctx.strokeStyle = shieldFlashes.has(index) ? '#ffffff' : '#a2e6ff'; ctx.lineWidth = Math.max(1, cell * (shieldFlashes.has(index) ? 0.09 : 0.045));
        ctx.beginPath(); ctx.ellipse(x, y, cell * 0.56, cell * 0.43, 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
      }
      if (engine.players.length > 1 || player.controlsReversed) {
        ctx.fillStyle = skin.palette.label;
        ctx.font = `bold ${Math.max(9, cell * 0.4)}px system-ui`; ctx.textAlign = 'center';
        const label = player.ai ? `AI ${index}` : engine.playerCount === 1 ? 'YOU' : `P${index + 1}`;
        ctx.fillText(`${label}${player.controlsReversed ? ' ↔↕' : ''}`, x, y - cell * 0.65);
      }
    });
    if (den) {
      for (const [index, animation] of denAnimations) {
        const progress = 1 - animation.remaining / 1000;
        const player = { ...animation.player, snake: SnakeMotion.hibernate(animation.player.snake, engine.den, progress, engine) };
        ctx.save(); ctx.globalAlpha = Math.max(0, 1 - progress * 0.8);
        SnakeRenderer.draw(ctx, { left, top, cell, player, skin: SnakeSkins.forPlayer(index, playerSkin), time: visualTime, animate: false });
        ctx.restore();
      }
      ellipse(den.x, den.y, cell * 0.35, cell * 0.27, '#080d10');
    }
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    width = Math.max(1, rect.width);
    height = Math.max(1, rect.height);
    const dpr = SnakeBoard.pixelRatio(width, height, window.devicePixelRatio || 1);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(canvas.width / width, 0, 0, canvas.height / height, 0, 0);
    draw();
  }

  motionPreference.addEventListener?.('change', (event) => {
    reducedMotion = event.matches;
    draw();
  });

  const directionKeys = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', w: 'up', s: 'down', a: 'left', d: 'right' };
  for (const id of Object.keys(headerPanels)) {
    $(id).addEventListener('toggle', () => {
      if (!$(id).open) return;
      for (const other of Object.keys(headerPanels)) if (other !== id) $(other).open = false;
      if (state === 'playing' || state === 'countdown') pause();
      if (id === 'gameHelp') {
        $('helpPanel').scrollTop = 0;
        $('helpPanel').focus({ preventScroll: true });
      }
    });
  }
  window.addEventListener('keydown', (event) => {
    const openPanel = Object.keys(headerPanels).find((id) => $(id).open);
    if (event.key === 'Escape' && openPanel) {
      event.preventDefault();
      $(openPanel).open = false;
      $(headerPanels[openPanel]).focus({ preventScroll: true });
      return;
    }
    if (event.ctrlKey || event.metaKey || event.altKey || /^(INPUT|TEXTAREA|SELECT|SUMMARY)$/.test(event.target.tagName) || event.target.isContentEditable || event.target.closest('.settings-panel')) return;
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    // Let focused buttons handle Space themselves; do not trigger two actions.
    if (key === ' ' && event.target.closest('button')) return;
    if (directionKeys[key] || [' ', 'r', 'Escape'].includes(key)) event.preventDefault();
    if (event.repeat) return;
    if (directionKeys[key] && ['playing', 'countdown'].includes(state)) {
      const playerIndex = engine.playerCount === 2 && key.startsWith('Arrow') ? 1 : 0;
      engine.steer(directionKeys[key], playerIndex);
    }
    if (key === ' ') { if (['ready', 'over', 'won', 'level-complete', 'level-ready'].includes(state)) playAction(); else pause(); }
    if (key === 'r') startGame();
    if (key === 'Escape' && ['playing', 'countdown'].includes(state)) pause();
  });
  $('playerInput').addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.repeat) { event.preventDefault(); startGame(); }
  });
  $('opponentInput').addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.repeat) { event.preventDefault(); startGame(); }
  });
  $('playButton').addEventListener('click', playAction);
  $('pauseButton').addEventListener('click', pause);
  $('restartButton').addEventListener('click', startGame);
  $('homeButton').addEventListener('click', goHome);
  $('guestPlayButton').addEventListener('click', () => { if (authUser) return; identityChoice = 'guest'; authMessage = ''; updateMode(); updateAvatarPicker(); focusHome(); });
  $('changeIdentityButton').addEventListener('click', () => { if (authUser) return; identityChoice = 'choose'; authMessage = ''; updateMode(); focusHome(); });
  $('googleLoginButton').addEventListener('click', () => { void authClient.signIn('google'); });
  $('facebookLoginButton').addEventListener('click', () => { void authClient.signIn('facebook'); });
  for (const id of ['signOutButton', 'settingsSignOutButton']) $(id).addEventListener('click', () => { void authClient.signOut(); });
  $('breakToggle').addEventListener('change', saveBreakSettings);
  $('breakMinutes').addEventListener('change', saveBreakSettings);
  $('teamInput').addEventListener('keydown', (event) => { if (event.key === 'Enter' && !event.repeat) { event.preventDefault(); startGame(); } });
  $('inviteFriendsButton').addEventListener('click', () => {
    if (authUser?.provider !== 'facebook') return;
    if (state === 'playing' || state === 'countdown') pause();
    const link = SnakeAuth.inviteLink(authConfig, window.location?.href || '');
    if (!link) { const message = 'Invites need a Facebook app ID and a public HTTPS game URL in auth-config.js.'; authMessage = message; syncIdentityUI(); showNotice(message); announce(message); return; }
    const popup = window.open(link, 'snake-club-invite', 'popup,width=640,height=520');
    if (popup) { try { popup.opener = null; } catch { /* Cross-origin popup remains isolated by the browser. */ } }
    if (!popup) { const message = 'Allow popups to share the game with friends.'; showNotice(message); announce(message); }
  });
  $('resultHome').addEventListener('click', goHome);
  $('helpCloseButton').addEventListener('click', () => {
    $('gameHelp').open = false;
    $('helpSummary').focus({ preventScroll: true });
  });
  $('homeSettings').addEventListener('click', () => {
    closeHeaderPanels();
    if (identityChoice === 'choose') { $('guestPlayButton').focus({ preventScroll: true }); return; }
    $('homeSetup').scrollIntoView?.({ block: 'nearest' });
    $('playersSelect').focus({ preventScroll: true });
  });
  document.querySelectorAll('[data-direction]').forEach((button) => {
    let pointerHandled = false;
    const steer = () => {
      const playerIndex = Number(button.dataset.player || 0);
      if (['playing', 'countdown'].includes(state) && playerIndex < engine.playerCount) engine.steer(button.dataset.direction, playerIndex);
    };
    button.addEventListener('pointerdown', (event) => {
      if (event.button !== undefined && event.button !== 0) return;
      pointerHandled = true;
      event.preventDefault();
      steer();
    });
    button.addEventListener('pointercancel', () => { pointerHandled = false; });
    button.addEventListener('click', (event) => {
      if (pointerHandled && event?.detail !== 0) { pointerHandled = false; return; }
      pointerHandled = false;
      steer();
    });
  });
  canvas.addEventListener('pointerdown', (event) => {
    if (!['playing', 'countdown'].includes(state) || !event.isPrimary) return;
    canvas.setPointerCapture(event.pointerId);
    gesture = { x: event.clientX, y: event.clientY, id: event.pointerId };
  });
  canvas.addEventListener('pointermove', (event) => {
    if (!gesture || gesture.id !== event.pointerId || !['playing', 'countdown'].includes(state)) return;
    const dx = event.clientX - gesture.x;
    const dy = event.clientY - gesture.y;
    const threshold = Math.max(14, Math.min(22, Math.min(width, height) * 0.05));
    if (Math.max(Math.abs(dx), Math.abs(dy)) < threshold || Math.max(Math.abs(dx), Math.abs(dy)) < Math.min(Math.abs(dx), Math.abs(dy)) * 1.25) return;
    engine.steer(Math.abs(dx) > Math.abs(dy) ? dx > 0 ? 'right' : 'left' : dy > 0 ? 'down' : 'up');
    gesture = { x: event.clientX, y: event.clientY, id: event.pointerId };
  });
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((name) => canvas.addEventListener(name, () => { gesture = null; }));
  function suspendPlayback() {
    if (state === 'playing' || state === 'countdown') pause();
    else if (previewSound) { previewSound = false; syncMusic(); }
  }
  window.addEventListener('blur', suspendPlayback);
  document.addEventListener('visibilitychange', () => { if (document.hidden) suspendPlayback(); });
  $('soundButton').addEventListener('click', () => {
    soundOn = !soundOn;
    if (!soundOn) { previewSound = false; breakVoice.cancel(); }
    syncMusic();
    if (soundOn) void unlockAudio();
  });
  $('testChompButton').addEventListener('click', () => {
    if (state === 'playing' || state === 'countdown') pause();
    soundOn = true;
    if (music.volume === 0) { music.volume = 0.75; $('volumeInput').value = '0.75'; }
    previewSound = false;
    syncMusic();
    playChomp();
  });
  $('testSoundButton').addEventListener('click', () => {
    if (state === 'playing' || state === 'countdown') pause();
    previewSound = !previewSound;
    if (previewSound) {
      soundOn = true;
      if (music.volume === 0) { music.volume = 0.75; $('volumeInput').value = '0.75'; }
    }
    syncMusic();
  });
  $('volumeInput').addEventListener('input', () => {
    music.volume = Number($('volumeInput').value);
    if (music.volume === 0) breakVoice.cancel();
    updateSoundControls();
    if (soundOn && (['playing', 'countdown'].includes(state) || previewSound)) syncMusic();
  });
  music.addEventListener('error', () => {
    if (soundOn && (['playing', 'countdown'].includes(state) || previewSound)) audioFailed(new Error('Media failed'), playbackRequest);
  });

  function frame(time) {
    if (state === 'playing') {
      const needsBreak = breakTimer.advance(breakLastTime === null ? 0 : Math.max(0, time - breakLastTime));
      breakLastTime = time;
      const secondsLeft = Math.ceil(Math.max(0, breakTimer.settings.minutes * 60000 - breakTimer.continuousMs) / 1000);
      if (!needsBreak && breakTimer.settings.enabled && secondsLeft > 0 && secondsLeft <= 10 && secondsLeft !== lastSpokenBreakSecond) {
        lastSpokenBreakSecond = secondsLeft;
        if (soundOn) breakVoice.speak(String(secondsLeft), music.volume);
        if (secondsLeft === 10) announce('A rest break starts in 10 seconds.');
      }
      if (needsBreak) {
        const minutes = breakTimer.settings.minutes;
        pause();
        breakDue = true;
        if (soundOn) breakVoice.speak('Time for a break. Rest your eyes.', music.volume);
        showOverlay('TIME FOR A BREAK', 'Rest your eyes.', `You played for ${minutes} uninterrupted minute${minutes === 1 ? '' : 's'}. Take a break, then resume when you are ready.`, 'RESUME', 'Your round is safely paused.');
        announce('Time for a break. The game is paused. Resume when you are ready.');
      }
    }
    const delta = lastVisualFrame === null ? 0 : Math.min(50, Math.max(0, time - lastVisualFrame));
    lastVisualFrame = time;
    if (state === 'playing' || state === 'season-transition') {
      for (const [index, animation] of denAnimations) {
        animation.remaining = Math.max(0, animation.remaining - delta);
        if (!animation.remaining) denAnimations.delete(index);
      }
    }
    if (state === 'season-transition') {
      seasonTransitionRemaining = Math.max(0, seasonTransitionRemaining - delta);
      if (!seasonTransitionRemaining && engine.startNextLevel()) {
        resetPresentation();
        updateMode(); updateScores();
        setState('level-ready');
        showOverlay('SUMMER HAS ARRIVED', `Level ${engine.level} · Summer`, `Your score is safe and your snake is short again. Catch ${engine.levelTarget} rats, ${engine.levelTarget} rabbits, and ${engine.levelTarget} frogs this level. Speed: ${engine.speedMultiplier.toFixed(1)}×.`, 'START THIS LEVEL', 'Each new level needs 5 more of each animal.');
        announce(`Summer has arrived. Level ${engine.level}. Three segments, ${engine.speedMultiplier.toFixed(1)} times speed. Catch ${engine.levelTarget} of each animal.`);
      }
    }
    if (state === 'playing') {
      if (!reducedMotion) visualTime += delta;
      noticeRemaining = Math.max(0, noticeRemaining - delta);
      if (!noticeRemaining) $('eventNotice').hidden = true;
      for (const [index, remaining] of shieldFlashes) {
        if (remaining <= delta) shieldFlashes.delete(index);
        else shieldFlashes.set(index, remaining - delta);
      }
    }
    if (state === 'countdown') {
      if (countdownLastTime !== null) countdownElapsed += Math.min(200, Math.max(0, time - countdownLastTime));
      countdownLastTime = time;
      const word = ['1', '2', '3', 'GO!'][Math.min(3, Math.floor(countdownElapsed / 1000))];
      if ($('countdownNumber').textContent !== word) $('countdownNumber').textContent = word;
      if (countdownElapsed >= 3450) {
        pausedCountdown = false;
        setState('playing');
        canvas.focus({ preventScroll: true });
        announce(`GO! ${playerName}, ${modes[engine.mode].name} mode with the ${avatars[playerAvatar]} avatar. ${steeringHint()} Optional goal: ${roundGoal.description}`);
      }
    }
    if (cheerRemaining > 0 && cheerFrame !== null) {
      cheerRemaining -= Math.min(time - cheerFrame, 200);
      if (cheerRemaining <= 0) resetCheer();
    }
    cheerFrame = time;
    if (state === 'playing') {
      if (lastTime !== null) elapsed += Math.min(time - lastTime, 200);
      lastTime = time;
      while (elapsed >= engine.interval && state === 'playing') {
        elapsed -= engine.interval;
        advance();
      }
    }
    updateGameClocks();
    if (state === 'playing' || state === 'season-transition' || sceneDirty) draw();
    requestAnimationFrame(frame);
  }
  const authClient = SnakeAuth.create({ config: authConfig, onChange: handleAuth });
  new ResizeObserver(resize).observe($('boardWrap'));
  resetCheer();
  updateScores();
  setState('ready');
  syncIdentityUI();
  focusHome();
  if (SnakeAuth.configured(authConfig)) void authClient.initialize();
  resize();
  requestAnimationFrame(frame);
})();

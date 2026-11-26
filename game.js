(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const canvas = $('board');
  const ctx = canvas.getContext('2d');
  const engine = new SnakeGame({ mode: 'obstacles', playerCount: 2, foodCount: 5, mushroomCount: 4, animatedFood: true, powerupsEnabled: true });
  const storageKey = 'snake-club-record-v3';
  const playerKey = 'snake-club-player-v1';
  const avatarKey = 'snake-club-avatar-v1';
  const skinKey = 'snake-club-skin-v1';
  const backdropKey = 'snake-club-backdrop-v1';
  const modeKey = 'snake-club-mode-v1';
  const playersKey = 'snake-club-players-v1';
  const opponentKey = 'snake-club-player-two-v1';
  const aiCountKey = 'snake-club-ai-count-v1';
  const foodKey = 'snake-club-food-count-v1';
  let preferredAICount = 3;
  const modes = {
    classic: { name: 'Classic', hint: 'Edges wrap. Avoid your own body.' },
    obstacles: { name: 'Obstacles', hint: 'Solid edges. Dodge stone walls, striped barriers, and rocks.' },
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
  const recordType = () => engine.aiCount ? 'ai' : engine.playerCount === 2 ? 'versus' : 'solo';
  const recordKey = () => `${engine.mode}:${recordType()}`;
  const recordLabel = () => `${modes[engine.mode].name} · ${{ solo: 'Solo', versus: 'Local versus', ai: 'AI Arena' }[recordType()]}`;
  let playerName = '';
  let opponentName = 'Player 2';
  const nameFor = (index) => index === 0 ? playerName || 'Player 1' : engine.players[index]?.ai ? `AI ${index}` : opponentName;
  const steeringHint = () => engine.aiCount
    ? `Use WASD or arrow keys. Compete against ${engine.aiCount} AI snakes. Last snake standing wins; crashed bots disappear.`
    : engine.playerCount === 2
    ? 'Player 1: W A S D. Player 2: arrow keys. Avoid both snakes. Last snake standing wins; simultaneous crashes draw.'
    : 'Use arrow keys or W A S D to steer.';
  let startingBest = 0;
  let canSave = true;
  let lastTime = null;
  let elapsed = 0;
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

  function resetCheer() {
    cheerRemaining = 0;
    cheerFrame = null;
    $('snakeFriends').dataset.cheering = 'false';
    $('friendMessage').textContent = 'Your snake friends are rooting for you!';
  }

  function cheer() {
    cheerRemaining = 1200;
    $('snakeFriends').dataset.cheering = 'true';
    const names = engine.lastCatches.map(({ playerIndex }) => nameFor(playerIndex)).join(' & ');
    const golden = engine.lastCatches.some(({ type }) => type === 'golden');
    const mushroom = engine.lastCatches.some(({ type }) => type === 'mushroom');
    const herb = engine.lastCatches.some(({ type }) => type === 'herb');
    const powerup = engine.lastCatches.find(({ type }) => type === 'shield' || type === 'slow');
    $('friendMessage').textContent = powerup ? `${powerup.type === 'shield' ? 'Shield ready! 🛡' : 'Slow and steady! ⏱'} ${names}` : mushroom ? `Mushroom! +50 for ${names}! 🍄`
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
    const dual = engine.playerCount === 2;
    $('opponentEntry').hidden = !dual;
    $('opponentInput').required = dual;
    $('opponentScoreGroup').hidden = !dual && !engine.aiCount;
    $('opponentIdentity').hidden = !dual && !engine.aiCount;
    $('opponentScoreLabel').textContent = engine.aiCount ? 'AI LEFT' : 'P2 SCORE';
    $('opponentControlsLabel').textContent = engine.aiCount ? 'AI ARENA' : 'P2 · ARROWS';
    $('playerTwoControls').hidden = !dual;
    $('playerOneControlsLabel').textContent = dual ? 'P1 · WASD' : 'STEER';
    $('scoreLabel').textContent = dual ? 'P1 SCORE' : 'YOUR SCORE';
    $('playerInputLabel').textContent = dual ? `Player 1 · ${SnakeSkins.get(playerSkin).name} · WASD` : 'Who’s playing?';
    $('controlsHint').textContent = steeringHint();
    $('modeHint').textContent = modes[engine.mode].hint;
    if (state === 'ready') {
      $('overlayTag').textContent = `${modes[engine.mode].name.toUpperCase()} MODE`;
      $('overlayTitle').textContent = engine.aiCount ? `You vs ${engine.aiCount} AI snakes.` : dual ? 'Two snakes. One arena.' : engine.wraps ? 'Small snake. Big plans.' : 'Watch your step.';
      $('overlayText').textContent = `${modes[engine.mode].hint}\n${engine.aiCount ? steeringHint() : dual ? 'P1: WASD · P2: arrow keys. Last snake standing wins.' : 'Choose Obstacles, Maze, or Classic in Settings, then play.'}`;
    }
    canvas.setAttribute('aria-label', `Snake board. ${modes[engine.mode].name} mode. ${steeringHint()} Catch rats, rabbits, and frogs. ${modes[engine.mode].hint} Space pauses.`);
  }
  $('modeSelect').addEventListener('change', () => {
    if (state === 'playing' || state === 'paused') return;
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
    if (state === 'playing' || state === 'paused') return;
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
    announce(`${engine.aiCount ? 'AI Arena' : playerCount === 2 ? 'Two-player versus' : 'Solo'} selected. ${steeringHint()}`);
  });
  $('aiCountSelect').addEventListener('change', () => {
    if (state === 'playing' || state === 'paused') return;
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
    if (state === 'playing' || state === 'paused') return;
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
    $('goldenStatus').dataset.active = String(Boolean(engine.goldenFood));
    $('goldenStatus').textContent = engine.goldenFood
      ? `On the board! +5 points · ${Math.ceil(engine.goldenTicks * engine.interval / 1000)}s left`
      : '★ Golden food · +5';
  }
  function updateEffectStatus() {
    const classic = engine.mode === 'classic';
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
    const powers = engine.players.flatMap((player, index) => !player.ai && engine.shieldRemainingMs(player) ? [`🛡 P${index + 1} ${Math.ceil(engine.shieldRemainingMs(player) / 1000)}s`] : []);
    if (engine.slowRemainingMs) powers.push(`⏱ SLOW ${Math.ceil(engine.slowRemainingMs / 1000)}s`);
    $('powerupStatus').hidden = powers.length === 0;
    $('powerupStatus').textContent = powers.join(' · ');
  }
  function updateScores() {
    selectBestRecord();
    $('recordType').textContent = recordLabel();
    $('best').setAttribute('title', `${recordLabel()} best${bestName ? ` by ${bestName}` : ''}`);
    $('best').setAttribute('aria-label', `${recordLabel()} best score: ${best}`);
    $('score').textContent = format(engine.score);
    const livingBots = engine.players.filter((player) => player.ai && player.alive).length;
    $('opponentScore').textContent = format(engine.aiCount ? livingBots : engine.players[1]?.score || 0);
    $('opponentName').textContent = engine.aiCount ? `${livingBots}/${engine.aiCount} alive` : opponentName;
    $('aiStandings').textContent = engine.players.filter((player) => player.ai)
      .map((player, index) => `AI ${index + 1}: ${player.score} points${player.alive ? '' : ' · eliminated'}${player.controlsReversed ? ' · reversed' : ''}`).join(' | ');
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
      $(`${animal}Target`).textContent = String(engine.level * 10);
    }
    const target = engine.level * 10;
    for (const animal of ['rat', 'rabbit', 'frog']) {
      const count = Math.min(engine.progressionEaten[animal], target);
      $(`${animal}Progress`).max = target;
      $(`${animal}Progress`).value = count;
      $(`${animal}ProgressText`).textContent = `${count}/${target}`;
    }
    $('levelHint').textContent = `Next level: ${target} of each animal. Human catches only; AI catches never increase the level.`;
  }

  function setState(next) {
    state = next;
    sceneDirty = true;
    if (state === 'playing') {
      $('gameSettings').open = false;
      $('gameStats').open = false;
    }
    if (state === 'paused' || state === 'over' || state === 'won') resetCheer();
    document.querySelector('.game-shell').dataset.state = state;
    $('matchStatus').textContent = {
      ready: 'READY TO GROW', playing: 'ON THE MOVE', paused: 'TAKING A BREATHER',
      over: 'GOOD GAME', won: 'BOARD COMPLETE',
    }[state];
    $('overlay').hidden = state === 'playing';
    $('playerEntry').hidden = state === 'playing' || state === 'paused';
    previewSound = false;
    syncMusic();
    $('modeSelect').disabled = state === 'playing' || state === 'paused';
    $('playersSelect').disabled = state === 'playing' || state === 'paused';
    $('aiCountSelect').disabled = state === 'playing' || state === 'paused';
    $('foodSelect').disabled = state === 'playing' || state === 'paused';
    $('pauseButton').disabled = !['playing', 'paused'].includes(state);
    $('pauseButton').textContent = state === 'paused' ? '▷ RESUME' : 'Ⅱ PAUSE';
    $('pauseButton').setAttribute('aria-label', state === 'paused' ? 'Resume game' : 'Pause game');
    lastTime = null;
    gesture = null;
  }

  function showOverlay(tag, title, text, button, hint) {
    $('overlayTag').textContent = tag;
    $('overlayTitle').textContent = title;
    $('overlayText').textContent = text;
    $('playLabel').textContent = button;
    $('spaceHint').textContent = hint;
    (state === 'paused' ? $('playButton') : $('playerInput')).focus({ preventScroll: true });
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
    if (!soundOn || (state !== 'playing' && !previewSound)) {
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
    const name = cleanName($('playerInput').value);
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
        localStorage.setItem(playerKey, playerName);
        localStorage.setItem(avatarKey, playerAvatar);
        localStorage.setItem(opponentKey, opponentName);
      } catch { storageUnavailable(); }
    }
    void unlockAudio();
    engine.reset();
    resetPresentation();
    updateMode();
    resetCheer();
    startingBest = best;
    elapsed = -250; // A brief runway to choose your first direction.
    updateScores();
    setState('playing');
    $('footerMessage').textContent = modes[engine.mode].hint;
    canvas.focus({ preventScroll: true });
    announce(`${playerName}, game started with the ${avatars[playerAvatar]} avatar. ${modes[engine.mode].name} mode. ${modes[engine.mode].hint} ${steeringHint()} ${engine.playerCount === 2 ? `${opponentName} is Player 2. ` : ''}Catch the ${engine.foodType}.`);
  }

  function pause() {
    if (state === 'playing') {
      setState('paused');
      showOverlay('NO RUSH. WE’LL WAIT.', 'A little breather.', 'Your next bite is right where you left it.', 'BACK TO IT', 'or press space to resume');
      announce('Game paused.');
    } else if (state === 'paused') {
      void unlockAudio();
      setState('playing');
      canvas.focus({ preventScroll: true });
      announce('Game resumed.');
    }
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
    const shieldNotice = engine.lastEvents.filter((event) => event.type === 'shield-block').map((event) => `${nameFor(event.playerIndex)}: shield absorbed a hit! Turn to safety.`).join(' ');
    if (engine.lastCatches.length) {
      for (const { playerIndex } of engine.lastCatches) {
        if (engine.players[playerIndex].ai) continue; // Bots never replace human records.
        const score = engine.players[playerIndex].score;
        if (score > best) {
          best = score;
          bestName = nameFor(playerIndex);
          records.set(recordKey(), { score: best, name: bestName });
          if (canSave) {
            try { localStorage.setItem(`${storageKey}:${recordKey()}`, JSON.stringify({ score: best, name: bestName })); }
            catch { storageUnavailable(); }
          }
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
      announce(`${levelUp ? `Level ${engine.level}! Speed increased. ` : ''}${engine.lastCatches.map(({ playerIndex, type, points }) => `${nameFor(playerIndex)}: ${type === 'golden' ? `Golden food! +${points} bonus points. ` : ''}Score ${engine.players[playerIndex].score}.`).join(' ')} Next prey: ${engine.foodType || 'none'}. ${catches.filter((_, index) => ['mushroom', 'herb', 'shield', 'slow'].includes(engine.lastCatches[index].type)).join(' ')} ${bonusNotice} ${herbNotice} ${shieldNotice}`);
    } else {
      updateScores();
      if (bonusNotice || herbNotice || shieldNotice) announce([bonusNotice, herbNotice, shieldNotice].filter(Boolean).join(' '));
      if (shieldNotice) $('footerMessage').textContent = shieldNotice;
    }
    if (result === 'lost' || result === 'won') {
      const won = result === 'won';
      setState(won ? 'won' : 'over');
      if (won) tone(880, 0.25);
      else playGameOver();
      const reasons = { wall: 'hit a wall', barrier: 'hit a barrier', rock: 'hit a rock', body: 'ran into your own body', opponent: 'hit the other snake', 'head-on': 'collided head-on' };
      if (engine.aiCount) {
        const humanWon = engine.winner === 0;
        const title = humanWon ? 'You win the AI Arena!' : engine.endReason === 'filled' && engine.winner === null ? 'It’s a draw!' : 'The AI got this round.';
        const scores = engine.players.map((player, index) => `${nameFor(index)}: ${player.score}`).join(' · ');
        const cause = engine.endReason === 'survival' ? 'You are the last snake standing.'
          : engine.endReason === 'filled' ? 'The board is full. Highest surviving score wins.'
          : `You ${reasons[engine.collision] || 'crashed'}.`;
        showOverlay('AI ARENA COMPLETE', title, `${cause}\n${scores}`, 'REMATCH', 'or press space for a rematch');
        announce(`${title} ${cause} ${scores}`);
      } else if (engine.playerCount === 2) {
        const title = engine.winner === null ? 'It’s a draw!' : `${nameFor(engine.winner)} wins!`;
        const scores = `P1 ${playerName}: ${engine.players[0].score} · P2 ${opponentName}: ${engine.players[1].score}.`;
        const causes = won ? 'All open cells filled. Highest score wins.' : engine.players
          .map((player, index) => player.collision ? `${nameFor(index)} ${reasons[player.collision] || 'crashed'}.` : '')
          .filter(Boolean).join(' ');
        showOverlay('ROUND COMPLETE', title, `${scores}\n${causes}`, 'REMATCH', 'or press space for a rematch');
        announce(`${title} ${scores} ${causes}`);
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
      theme: backdrop, pixelRatio: canvas.width / width,
    });
    canvas.dataset.layout = '2d';
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
      if (!player.alive) return;
      const skin = SnakeSkins.forPlayer(index, playerSkin);
      SnakeRenderer.draw(ctx, { left, top, cell, time: visualTime, player, skin, animate: state === 'playing' && !reducedMotion });
      const x = left + (player.snake[0].x + 0.5) * cell;
      const y = top + (player.snake[0].y + 0.5) * cell;
      if (engine.shieldRemainingMs(player)) {
        ctx.save(); ctx.strokeStyle = '#a2e6ff'; ctx.lineWidth = Math.max(1, cell * 0.045);
        ctx.beginPath(); ctx.ellipse(x, y, cell * 0.56, cell * 0.43, 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
      }
      if (engine.players.length > 1 || player.controlsReversed) {
        ctx.fillStyle = skin.palette.label;
        ctx.font = `bold ${Math.max(9, cell * 0.4)}px system-ui`; ctx.textAlign = 'center';
        const label = player.ai ? `AI ${index}` : engine.playerCount === 1 ? 'YOU' : `P${index + 1}`;
        ctx.fillText(`${label}${player.controlsReversed ? ' ↔↕' : ''}`, x, y - cell * 0.65);
      }
    });
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
  for (const [id, other] of [['gameSettings', 'gameStats'], ['gameStats', 'gameSettings']]) {
    $(id).addEventListener('toggle', () => {
      if (!$(id).open) return;
      $(other).open = false;
      if (state === 'playing') pause();
    });
  }
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && ($('gameSettings').open || $('gameStats').open)) {
      event.preventDefault();
      const menu = $('gameSettings').open ? 'gameSettings' : 'gameStats';
      $(menu).open = false;
      $(menu === 'gameSettings' ? 'settingsSummary' : 'statsSummary').focus({ preventScroll: true });
      return;
    }
    if (event.ctrlKey || event.metaKey || event.altKey || /^(INPUT|TEXTAREA|SELECT|SUMMARY)$/.test(event.target.tagName) || event.target.isContentEditable || event.target.closest('.settings-panel')) return;
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    // Let focused buttons handle Space themselves; do not trigger two actions.
    if (key === ' ' && event.target.closest('button')) return;
    if (directionKeys[key] || [' ', 'r', 'Escape'].includes(key)) event.preventDefault();
    if (event.repeat) return;
    if (directionKeys[key] && state === 'playing') {
      const playerIndex = engine.playerCount === 2 && key.startsWith('Arrow') ? 1 : 0;
      engine.steer(directionKeys[key], playerIndex);
    }
    if (key === ' ') { if (['ready', 'over', 'won'].includes(state)) startGame(); else pause(); }
    if (key === 'r') startGame();
    if (key === 'Escape' && state === 'playing') pause();
  });
  $('playerInput').addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.repeat) { event.preventDefault(); startGame(); }
  });
  $('opponentInput').addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.repeat) { event.preventDefault(); startGame(); }
  });
  $('playButton').addEventListener('click', () => state === 'paused' ? pause() : startGame());
  $('pauseButton').addEventListener('click', pause);
  $('restartButton').addEventListener('click', startGame);
  document.querySelectorAll('[data-direction]').forEach((button) => {
    button.addEventListener('click', () => {
      const playerIndex = Number(button.dataset.player || 0);
      if (state === 'playing' && playerIndex < engine.playerCount) engine.steer(button.dataset.direction, playerIndex);
    });
  });
  canvas.addEventListener('pointerdown', (event) => {
    if (state !== 'playing' || !event.isPrimary) return;
    canvas.setPointerCapture(event.pointerId);
    gesture = { x: event.clientX, y: event.clientY, id: event.pointerId };
  });
  canvas.addEventListener('pointermove', (event) => {
    if (!gesture || gesture.id !== event.pointerId || state !== 'playing') return;
    const dx = event.clientX - gesture.x;
    const dy = event.clientY - gesture.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 18) return;
    engine.steer(Math.abs(dx) > Math.abs(dy) ? dx > 0 ? 'right' : 'left' : dy > 0 ? 'down' : 'up');
    gesture = { x: event.clientX, y: event.clientY, id: event.pointerId };
  });
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((name) => canvas.addEventListener(name, () => { gesture = null; }));
  function suspendPlayback() {
    if (state === 'playing') pause();
    else if (previewSound) { previewSound = false; syncMusic(); }
  }
  window.addEventListener('blur', suspendPlayback);
  document.addEventListener('visibilitychange', () => { if (document.hidden) suspendPlayback(); });
  $('soundButton').addEventListener('click', () => {
    soundOn = !soundOn;
    if (!soundOn) previewSound = false;
    syncMusic();
    if (soundOn) void unlockAudio();
  });
  $('testChompButton').addEventListener('click', () => {
    if (state === 'playing') pause();
    soundOn = true;
    if (music.volume === 0) { music.volume = 0.75; $('volumeInput').value = '0.75'; }
    previewSound = false;
    syncMusic();
    playChomp();
  });
  $('testSoundButton').addEventListener('click', () => {
    if (state === 'playing') pause();
    previewSound = !previewSound;
    if (previewSound) {
      soundOn = true;
      if (music.volume === 0) { music.volume = 0.75; $('volumeInput').value = '0.75'; }
    }
    syncMusic();
  });
  $('volumeInput').addEventListener('input', () => {
    music.volume = Number($('volumeInput').value);
    updateSoundControls();
    if (soundOn && (state === 'playing' || previewSound)) syncMusic();
  });
  music.addEventListener('error', () => {
    if (soundOn && (state === 'playing' || previewSound)) audioFailed(new Error('Media failed'), playbackRequest);
  });

  function frame(time) {
    const delta = lastVisualFrame === null ? 0 : Math.min(50, Math.max(0, time - lastVisualFrame));
    lastVisualFrame = time;
    if (state === 'playing') {
      if (!reducedMotion) visualTime += delta;
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
    if (state === 'playing' || sceneDirty) draw();
    requestAnimationFrame(frame);
  }
  new ResizeObserver(resize).observe($('boardWrap'));
  resetCheer();
  updateScores();
  setState('ready');
  $('playerInput').focus({ preventScroll: true });
  resize();
  requestAnimationFrame(frame);
})();

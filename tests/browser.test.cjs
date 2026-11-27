const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');
const { SnakeGame } = require('../snake-engine.js');
const { SnakeAI } = require('../snake-ai.js');
const { SnakeSkins } = require('../snake-skins.js');
const { SnakeRenderer } = require('../snake-renderer.js');
const { SnakeItemsRenderer } = require('../snake-items-renderer.js');
const { SnakeMotion } = require('../snake-motion.js');
const { SnakeRewards } = require('../snake-rewards.js');
const { SnakeBoard } = require('../snake-board.js');
const { SnakeAuth } = require('../snake-auth.js');
const { SnakeBreaks } = require('../snake-breaks.js');

// Run the real UI controller with a small DOM/Canvas stand-in, no production test hooks.
// Existing lifecycle cases use solo; playerCount: null exercises the production two-player default.
function load({ storage = new Map(), blocked = false, player = 'Alex', audioSupport = false, mediaError = null, playerCount = 1, reducedMotion = true, renderer = SnakeRenderer, autoCountdown = true, autoGuest = true, authModule = SnakeAuth, authConfig = {} } = {}) {
  const elements = new Map();
  const noop = () => {};
  const openedWindows = [];
  let focused;
  let frameOffset = 0;
  let lastFrameTime = 0;
  function finishCountdown() {
    if (!autoCountdown || element('.game-shell').dataset.state !== 'countdown') return;
    let time = lastFrameTime;
    for (let i = 0; i < 30 && element('.game-shell').dataset.state === 'countdown'; i++) { time += 200; frame(time); }
    frameOffset = lastFrameTime = time;
  }
  function handle(callback) {
    return (...args) => { const result = callback(...args); finishCountdown(); return result; };
  }
  function element(id) {
    if (!elements.has(id)) elements.set(id, {
      textContent: '', value: '', hidden: false, disabled: false, dataset: {}, attrs: {}, listeners: {},
      tagName: id.endsWith('Select') ? 'SELECT' : id === 'playerInput' || id === 'opponentInput' || id.startsWith('avatar-') ? 'INPUT' : id.endsWith('Button') ? 'BUTTON' : 'CANVAS',
      setAttribute(name, value) { this.attrs[name] = value; },
      addEventListener(name, callback) { this.listeners[name] = handle(callback); },
      focus() { focused = id; },
      closest(selector) { return selector === 'button' && this.tagName === 'BUTTON' ? this : null; },
      getBoundingClientRect: () => ({ width: 720, height: 600 }),
      setPointerCapture: noop,
    });
    return elements.get(id);
  }
  const context = new Proxy({}, { get: (_, key) => ['createLinearGradient', 'createRadialGradient'].includes(key) ? () => ({ addColorStop: noop }) : noop, set: () => true });
  element('board').getContext = () => context;
  Object.assign(element('skinPreview'), { getContext: () => context, width: 720, height: 160 });
  Object.assign(element('music'), {
    paused: true, volume: 0.75, plays: 0,
    play() { this.plays++; if (mediaError) return Promise.reject(mediaError); this.paused = false; return Promise.resolve(); },
    pause() { this.paused = true; },
  });
  Object.assign(element('chomp'), {
    paused: true, volume: 0.75, muted: false, currentTime: 0, plays: 0,
    play() { this.plays++; this.paused = false; return Promise.resolve(); },
    pause() { this.paused = true; },
  });
  const events = {};
  const documentEvents = {};
  let motionListener;
  const motionQuery = { matches: reducedMotion, addEventListener: (_, callback) => { motionListener = callback; } };
  const touchButtons = [0, 1].flatMap((playerIndex) => ['up', 'down', 'left', 'right'].map((direction) => {
    const button = element(`p${playerIndex}-${direction}Button`);
    button.dataset = { direction, player: String(playerIndex) };
    return button;
  }));
  const document = {
    getElementById: element, querySelector: element, querySelectorAll: () => touchButtons, hidden: false,
    addEventListener: (name, callback) => { documentEvents[name] = callback; },
  };
  let engine;
  let frame;
  const timers = new Map();
  let timerId = 0;
  const audioStats = { notes: 0, stopped: 0, voices: [], gains: [] };
  class FakeAudio {
    constructor() { this.state = 'suspended'; this.currentTime = 0; this.destination = {}; }
    async resume() { this.state = 'running'; }
    createOscillator() {
      const voice = { frequencies: [], connect: noop, disconnect: noop,
        start(time) { audioStats.notes++; this.startTime = time; },
        stop(time) { audioStats.stopped++; this.stopTime = time; } };
      voice.frequency = {
        setValueAtTime: (value) => voice.frequencies.push(value),
        exponentialRampToValueAtTime: (value) => voice.frequencies.push(value),
      };
      audioStats.voices.push(voice);
      return voice;
    }
    createGain() {
      const values = [];
      audioStats.gains.push(values);
      return { gain: { setValueAtTime: (value) => values.push(value), linearRampToValueAtTime: noop,
        exponentialRampToValueAtTime: noop, cancelScheduledValues: noop, setTargetAtTime: noop },
        connect: noop, disconnect: noop };
    }
  }
  const sandbox = {
    setInterval: (callback) => { const id = ++timerId; timers.set(id, callback); return id; },
    clearInterval: (id) => timers.delete(id),
    SnakeAI,
    SnakeSkins,
    SnakeRenderer: renderer,
    SnakeItemsRenderer,
    SnakeMotion,
    SnakeBoard,
    SnakeRewards,
    SnakeAuth: authModule,
    SnakeBreaks,
    SnakeGame: class extends SnakeGame { constructor(options) { super({ ...options, random: () => 0, ...(playerCount === null ? {} : { playerCount }) }); engine = this; } },
    document,
    window: { SNAKE_AUTH_CONFIG: authConfig, open: (...args) => { openedWindows.push(args); return { opener: null }; }, AudioContext: audioSupport ? FakeAudio : undefined, matchMedia: () => motionQuery, devicePixelRatio: 1,
      addEventListener: (name, callback) => { events[name] = handle(callback); } },
    localStorage: {
      getItem: (key) => { if (blocked) throw Error('Blocked'); return storage.get(key) ?? null; },
      setItem: (key, value) => { if (blocked) throw Error('Blocked'); storage.set(key, value); },
    },
    ResizeObserver: class { observe() {} },
    requestAnimationFrame: (callback) => { frame = callback; },
  };
  vm.runInNewContext(readFileSync(join(__dirname, '..', 'game.js'), 'utf8'), sandbox);
  if (!element('playerInput').value) element('playerInput').value = player;
  if (autoGuest) element('guestPlayButton').listeners.click();
  return {
    element, engine, events, document, documentEvents, storage, timers, audioStats, openedWindows,
    focus: () => focused,
    frame: (time) => { lastFrameTime = frameOffset + time; frame(lastFrameTime); },
    click: (id) => element(id).listeners.click(),
    key: (key, extra = {}) => events.keydown({ key, target: element('board'), preventDefault: noop, ...extra }),
    state: () => element('.game-shell').dataset.state,
    setReducedMotion: (matches) => { motionQuery.matches = matches; motionListener?.({ matches }); },
  };
}

function mockedAuth() {
  let notify; let user = null;
  const publish = () => notify({ user, busy: false, message: '' });
  return {
    configured: () => true, inviteLink: SnakeAuth.inviteLink,
    create({ onChange }) {
      notify = onChange;
      return {
        initialize() { publish(); return Promise.resolve(true); },
        signIn(provider) { user = { id: provider, provider, name: provider === 'facebook' ? 'Facebook Sam' : 'Google Jane' }; publish(); return Promise.resolve(true); },
        signOut() { user = null; publish(); return Promise.resolve(true); },
      };
    },
  };
}

test('home offers social or guest choice and asks who is playing only after guest selection', () => {
  const g = load({ autoGuest: false });
  assert.equal(g.element('authChoices').hidden, false);
  assert.equal(g.element('playerEntry').hidden, true);
  assert.equal(g.element('playButton').hidden, true);
  g.key(' ');
  assert.equal(g.state(), 'ready');
  g.click('googleLoginButton');
  assert.match(g.element('authStatus').textContent, /OAuth configuration/);
  assert.equal(g.element('playerEntry').hidden, true);
  g.click('guestPlayButton');
  assert.equal(g.element('playerEntry').hidden, false);
  assert.equal(g.element('playButton').hidden, false);
  g.click('playButton');
  assert.equal(g.state(), 'playing');
});

test('verified profile names and guest names share records without renaming the existing champion', () => {
  const storage = new Map([['snake-club-record-v3:obstacles:solo', JSON.stringify({ score: 10, name: 'Guest champion' })]]);
  const g = load({ storage, autoGuest: false, authModule: mockedAuth() });
  g.click('googleLoginButton');
  assert.equal(g.element('playerEntry').hidden, true);
  assert.equal(g.element('inviteFriendsButton').hidden, true);
  assert.equal(g.element('playerInput').value, 'Google Jane');
  g.element('playerInput').value = 'Spoofed input';
  g.click('playButton'); eat(g);
  assert.equal(g.element('playerName').textContent, 'Google Jane');
  assert.equal(g.element('bestName').textContent, 'Guest champion');
  g.engine.score = 10;
  g.engine.food = g.engine.nextHead(g.engine.players[0]);
  g.frame(1000);
  assert.equal(g.element('bestName').textContent, 'Google Jane');
  g.click('settingsSignOutButton');
  assert.equal(g.state(), 'ready');
  assert.equal(g.element('authChoices').hidden, false);
  assert.equal(g.element('bestName').textContent, 'Google Jane');
  g.click('guestPlayButton');
  g.element('playerInput').value = 'Guest newcomer';
  g.click('playButton'); eat(g);
  assert.equal(g.element('bestName').textContent, 'Google Jane');
});

test('only Facebook sessions expose friend sharing, which pauses play and opens a user-confirmed dialog', () => {
  const g = load({ autoGuest: false, authModule: mockedAuth(), authConfig: { facebookAppId: '12345678', inviteUrl: 'https://example.com/snake/' } });
  g.click('facebookLoginButton');
  assert.equal(g.element('inviteFriendsButton').hidden, false);
  g.click('playButton');
  g.click('inviteFriendsButton');
  assert.equal(g.state(), 'paused');
  assert.equal(g.openedWindows.length, 1);
  assert.match(g.openedWindows[0][0], /^https:\/\/www.facebook.com\/dialog\/share/);
  g.click('settingsSignOutButton');
  assert.equal(g.element('inviteFriendsButton').hidden, true);
});

test('break auto-pause is configurable, repeats only after resuming, and stays silent when off', () => {
  const g = load();
  assert.equal(g.element('breakToggle').checked, false);
  assert.equal(g.element('breakMinutes').value, '2');
  g.element('breakToggle').checked = true;
  g.element('breakMinutes').value = '1';
  g.element('breakToggle').listeners.change();
  assert.deepEqual(JSON.parse(g.storage.get('snake-club-breaks-v1')), { enabled: true, minutes: 1 });
  g.click('playButton'); g.frame(0); g.frame(60100);
  assert.equal(g.state(), 'paused');
  assert.equal(g.element('overlayTitle').textContent, 'Rest your eyes.');
  assert.match(g.element('overlayText').textContent, /1 uninterrupted minute/);
  g.click('playButton'); g.frame(60200); g.frame(90000);
  assert.equal(g.state(), 'playing');
  g.frame(122500);
  assert.equal(g.state(), 'paused');
  g.element('breakToggle').checked = false; g.element('breakToggle').listeners.change();
  g.click('playButton'); g.frame(123000); g.frame(523000);
  assert.equal(g.state(), 'playing');
  const restored = load({ storage: g.storage });
  assert.equal(restored.element('breakToggle').checked, false);
  assert.equal(restored.element('breakMinutes').value, '1');
});

test('golden food credits five points to its eater, updates records and keeps animal counts separate', () => {
  const g = load({ playerCount: null });
  g.element('opponentInput').value = 'Jamie'; g.click('playButton');
  const head = g.engine.players[1].snake[0];
  g.engine.goldenFood = { x: head.x - 1, y: head.y }; g.engine.goldenTicks = 50;
  const prey = g.engine.foodType;
  for (const time of [0, 200, 400, 600, 800]) g.frame(time);
  assert.equal(g.element('score').textContent, '05');
  assert.equal(g.element('playerTwoScore').textContent, '5 pts');
  assert.equal(g.element('best').textContent, '05');
  assert.equal(g.element('bestName').textContent, 'Snake Squad');
  assert.equal(g.element('goldenCount').textContent, '1');
  assert.equal(g.element('totalEaten').textContent, '1');
  assert.equal(g.element('ratCount').textContent, '0');
  assert.equal(g.engine.foodType, prey);
  assert.match(g.element('friendMessage').textContent, /Golden catch! \+5 for Jamie/);
  assert.match(g.element('announcer').textContent, /Golden food! \+5 bonus points/);
  assert.deepEqual(JSON.parse(g.storage.get('snake-club-record-v3:obstacles:team')), { score: 5, name: 'Snake Squad' });
  g.click('restartButton');
  assert.equal(g.element('goldenCount').textContent, '0');
  assert.equal(g.engine.goldenFood, null);
});

test('simultaneous normal and golden catches display both scores and announce both players', () => {
  const g = load({ playerCount: null });
  g.element('opponentInput').value = 'Jamie'; g.click('playButton');
  const [p1, p2] = g.engine.players;
  g.engine.food = { x: p1.snake[0].x + 1, y: p1.snake[0].y };
  g.engine.goldenFood = { x: p2.snake[0].x - 1, y: p2.snake[0].y }; g.engine.goldenTicks = 50;
  for (const time of [0, 200, 400, 600, 800]) g.frame(time);
  assert.equal(g.element('score').textContent, '06');
  assert.equal(g.element('playerOneScore').textContent, '1 pts');
  assert.equal(g.element('playerTwoScore').textContent, '5 pts');
  assert.equal(g.element('totalEaten').textContent, '2');
  assert.equal(g.element('ratCount').textContent, '1');
  assert.equal(g.element('goldenCount').textContent, '1');
  assert.equal(g.element('bestName').textContent, 'Snake Squad');
  assert.match(g.element('announcer').textContent, /Alex: Score 1/);
  assert.match(g.element('announcer').textContent, /Jamie: Golden food/);
});

test('golden appearance and expiry are announced; pause freezes its lifetime and HUD', () => {
  const g = load(); g.click('playButton'); g.engine.goldenDelay = 1;
  for (const time of [0, 200, 400, 600, 800]) g.frame(time);
  assert.equal(g.element('goldenStatus').dataset.active, 'true');
  assert.match(g.element('goldenStatus').textContent, /On the board! \+5 points/);
  assert.match(g.element('announcer').textContent, /Golden food appeared/);
  g.click('pauseButton');
  const lifetime = g.engine.goldenTicks;
  const hud = g.element('goldenStatus').textContent;
  g.frame(10000);
  assert.equal(g.engine.goldenTicks, lifetime);
  assert.equal(g.element('goldenStatus').textContent, hud);
  g.engine.goldenTicks = 1;
  g.click('playButton'); g.frame(11000); g.frame(11200);
  assert.equal(g.engine.goldenFood, null);
  assert.equal(g.element('goldenStatus').dataset.active, 'false');
  assert.match(g.element('announcer').textContent, /Golden food expired/);
});

test('production defaults to two players, shows two identities, controls and individual scores', () => {
  const g = load({ playerCount: null });
  assert.equal(g.engine.playerCount, 2);
  assert.equal(g.element('playersSelect').value, '2');
  assert.equal(g.element('.game-shell').dataset.players, '2');
  assert.equal(g.element('opponentEntry').hidden, false);
  assert.equal(g.element('opponentScoreGroup').hidden, true);
  assert.equal(g.element('opponentInput').required, true);
  assert.equal(g.element('playerTwoControls').hidden, false);
  assert.match(g.element('overlayTitle').textContent, /Two snakes/);
  assert.match(g.element('controlsHint').textContent, /P2 uses arrow keys/);
  g.element('opponentInput').value = 'Jamie';
  g.click('playButton');
  assert.equal(g.state(), 'playing');
  assert.equal(g.element('opponentName').textContent, 'Jamie');
  assert.equal(g.element('score').textContent, '00');
  assert.equal(g.element('opponentScore').textContent, '00');
  assert.equal(g.element('playersSelect').disabled, true);
  assert.equal(g.storage.get('snake-club-player-two-v1'), 'Jamie');
});

test('WASD, arrows, and both touch pads steer separate snakes; pause blocks turns', () => {
  const g = load({ playerCount: null });
  g.click('playButton');
  g.key('W'); g.key('ArrowDown');
  assert.deepEqual(g.engine.players[0].turns, ['up']);
  assert.deepEqual(g.engine.players[1].turns, ['down']);
  g.click('p0-leftButton'); g.click('p1-rightButton');
  assert.deepEqual(g.engine.players[0].turns, ['up', 'left']);
  assert.deepEqual(g.engine.players[1].turns, ['down', 'right']);
  g.click('pauseButton');
  assert.equal(g.element('playersSelect').disabled, true);
  g.engine.players.forEach((player) => { player.turns = []; });
  g.key('w'); g.key('ArrowDown'); g.click('p0-upButton'); g.click('p1-downButton');
  assert.ok(g.engine.players.every((player) => player.turns.length === 0));
  const before = JSON.stringify(g.engine.players);
  g.frame(3000); assert.equal(JSON.stringify(g.engine.players), before);
  g.click('playButton');
  assert.equal(g.state(), 'playing');
  g.click('restartButton');
  assert.ok(g.engine.players.every((player) => player.score === 0 && player.snake.length === 3));
});

test('Player 2 catches update only their score, champion, cheer and combined catch table', () => {
  const g = load({ playerCount: null });
  g.element('opponentInput').value = '<b>Jamie</b>';
  g.click('playButton');
  const head = g.engine.players[1].snake[0];
  g.engine.food = { x: head.x - 1, y: head.y };
  for (const time of [0, 200, 400, 600, 800]) g.frame(time);
  assert.equal(g.element('score').textContent, '01');
  assert.equal(g.engine.players[0].score, 0);
  assert.equal(g.engine.players[1].score, 1);
  assert.equal(g.element('bestName').textContent, 'Snake Squad');
  assert.equal(g.element('ratCount').textContent, '1');
  assert.equal(g.element('totalEaten').textContent, '1');
  assert.match(g.element('friendMessage').textContent, /Nice catch, <b>Jamie<\/b>/);
  assert.deepEqual(JSON.parse(g.storage.get('snake-club-record-v3:obstacles:team')), { score: 1, name: 'Snake Squad' });
  assert.equal(load({ storage: g.storage, playerCount: null }).element('opponentInput').value, '<b>Jamie</b>');
});

test('a crash announces the surviving winner and rematch resets both snakes', () => {
  const g = load({ playerCount: null });
  g.element('opponentInput').value = 'Jamie'; g.click('playButton');
  Object.assign(g.engine.players[0], { snake: [{ x: 1, y: 5 }], direction: 'left' });
  Object.assign(g.engine.players[1], { snake: [{ x: 15, y: 15 }], direction: 'right' });
  for (const time of [0, 200, 400, 600, 800]) g.frame(time);
  assert.equal(g.state(), 'over');
  assert.equal(g.element('overlayTitle').textContent, 'Snake Squad · round over');
  assert.match(g.element('overlayText').textContent, /Alex hit a wall/);
  assert.match(g.element('announcer').textContent, /round over/);
  assert.equal(g.element('playersSelect').disabled, false);
  assert.equal(g.element('music').paused, true);
  g.click('playButton');
  assert.equal(g.state(), 'playing');
  assert.equal(g.engine.winner, null);
  assert.ok(g.engine.players.every((player) => player.collision === null && player.score === 0 && player.snake.length === 3));
});

test('simultaneous head collisions announce a draw rather than favouring either player', () => {
  const g = load({ playerCount: null }); g.click('playButton');
  Object.assign(g.engine.players[0], { snake: [{ x: 10, y: 10 }], direction: 'right' });
  Object.assign(g.engine.players[1], { snake: [{ x: 12, y: 10 }], direction: 'left' });
  for (const time of [0, 200, 400, 600, 800]) g.frame(time);
  assert.equal(g.state(), 'over');
  assert.match(g.element('overlayTitle').textContent, /round over/);
  assert.match(g.element('announcer').textContent, /head-on/);
});

test('Player 2 name is required in team; Enter starts, and solo does not require it', () => {
  const g = load({ playerCount: null });
  g.element('opponentInput').value = '  '; g.click('playButton');
  assert.equal(g.state(), 'ready');
  assert.equal(g.focus(), 'opponentInput');
  assert.equal(g.element('opponentInput').attrs['aria-invalid'], 'true');
  g.element('opponentInput').value = ' Jamie  Fox ';
  g.element('opponentInput').listeners.keydown({ key: 'Enter', preventDefault() {} });
  assert.equal(g.state(), 'playing');
  assert.equal(g.element('opponentName').textContent, 'Jamie Fox');
  const solo = load({ playerCount: null });
  solo.element('playersSelect').value = '1'; solo.element('playersSelect').listeners.change();
  solo.element('opponentInput').value = '';
  assert.equal(solo.element('opponentEntry').hidden, true);
  assert.equal(solo.element('opponentInput').required, false);
  assert.equal(solo.element('playerTwoControls').hidden, true);
  solo.click('playButton');
  assert.equal(solo.state(), 'playing');
  solo.key('ArrowUp'); assert.deepEqual(solo.engine.turns, ['up']);
  assert.equal(load({ storage: solo.storage, playerCount: null }).engine.playerCount, 1);
});

test('team survives blocked storage and corrupt preferences fall back to two players', () => {
  for (const saved of ['0', '3', 'NaN', '__proto__']) {
    const g = load({ playerCount: null, storage: new Map([['snake-club-players-v1', saved]]) });
    assert.equal(g.engine.playerCount, 2);
  }
  const g = load({ playerCount: null, blocked: true });
  g.click('playButton'); assert.equal(g.state(), 'playing');
  assert.equal(g.engine.playerCount, 2);
});

test('AI Arena exposes bot counts, hides second-human input and remembers food density', () => {
  const g = load({ playerCount: null });
  g.element('playersSelect').value = 'ai';
  g.element('playersSelect').listeners.change();
  assert.equal(g.engine.playerCount, 1);
  assert.equal(g.engine.aiCount, 3);
  assert.equal(g.engine.players.length, 4);
  assert.equal(g.element('opponentEntry').hidden, true);
  assert.equal(g.element('playerTwoControls').hidden, true);
  assert.equal(g.element('opponentInput').required, false);
  assert.equal(g.element('aiSettings').hidden, false);
  assert.equal(g.element('opponentScoreLabel').textContent, 'AI LEFT');
  g.element('aiCountSelect').value = '2';
  g.element('aiCountSelect').listeners.change();
  g.element('foodSelect').value = '10';
  g.element('foodSelect').listeners.change();
  assert.equal(g.engine.aiCount, 2);
  assert.equal(g.engine.foods.length, 10);
  const next = load({ storage: g.storage, playerCount: null });
  assert.equal(next.engine.aiCount, 2);
  assert.equal(next.engine.foodCount, 10);
  next.element('opponentInput').value = '';
  next.click('playButton');
  assert.equal(next.state(), 'playing');
  assert.equal(next.element('aiCountSelect').disabled, true);
  assert.equal(next.element('foodSelect').disabled, true);
  next.element('aiCountSelect').value = '3';
  next.element('aiCountSelect').listeners.change();
  next.element('foodSelect').value = '1';
  next.element('foodSelect').listeners.change();
  assert.equal(next.engine.aiCount, 2);
  assert.equal(next.engine.foodCount, 10);
  const before = JSON.stringify(next.engine.players.slice(1));
  for (const time of [0, 200, 400, 600, 800]) next.frame(time);
  assert.notEqual(JSON.stringify(next.engine.players.slice(1)), before);
  next.click('pauseButton');
  const paused = JSON.stringify(next.engine.players);
  next.frame(2000);
  assert.equal(JSON.stringify(next.engine.players), paused);
  next.click('restartButton');
  assert.ok(next.engine.players.every((player) => player.alive && player.score === 0));
  assert.equal(next.engine.foods.length, 10);
});

test('power-up status and round counts update, freeze on pause and clear on restart', () => {
  const g = load();
  g.click('playButton');
  g.engine.food = { x: 0, y: 0 };
  g.engine.extraFoods = [];
  g.engine.mushrooms = [];
  g.engine.powerups = [{ ...g.engine.nextHead(g.engine.players[0]), type: 'shield', expiresAt: 10000 }];
  for (const time of [0, 200, 400, 600]) g.frame(time);
  assert.equal(g.element('powerupStatus').hidden, false);
  assert.match(g.element('powerupStatus').textContent, /P1 8s/);
  assert.equal(g.element('powerupCount').textContent, '1');
  g.engine.powerups = [{ ...g.engine.nextHead(g.engine.players[0]), type: 'slow', expiresAt: 10000 }];
  g.frame(800);
  assert.match(g.element('powerupStatus').textContent, /SLOW 6s/);
  assert.equal(g.element('powerupCount').textContent, '2');
  assert.equal(g.element('totalEaten').textContent, '2');
  g.click('pauseButton');
  const paused = JSON.stringify(g.engine);
  g.frame(5000);
  assert.equal(JSON.stringify(g.engine), paused);
  g.click('restartButton');
  assert.equal(g.element('powerupStatus').hidden, true);
  assert.equal(g.element('powerupCount').textContent, '0');
});

test('AI catches update standings without replacing human records', () => {
  const g = load({ playerCount: null });
  g.element('playersSelect').value = 'ai';
  g.element('playersSelect').listeners.change();
  g.click('playButton');
  Object.assign(g.engine.players[1], { snake: [{ x: 5, y: 5 }, { x: 4, y: 5 }, { x: 3, y: 5 }], direction: 'right' });
  g.engine.food = { x: 6, y: 5 };
  for (const time of [0, 200, 400, 600, 800]) g.frame(time);
  assert.ok(g.engine.players[1].score > 0);
  assert.equal(g.element('best').textContent, '00');
  assert.match(g.element('aiStandings').textContent, /AI 1: 1 points/);
  assert.equal(g.element('opponentScore').textContent, '03');
});

test('AI eliminations update the HUD and the last surviving human gets a rematch', () => {
  const g = load({ playerCount: null });
  g.element('playersSelect').value = 'ai';
  g.element('playersSelect').listeners.change();
  g.click('playButton');
  g.engine.obstacles = [];
  for (const [index, x, y] of [[1, 5, 5], [2, 10, 10], [3, 18, 15]]) {
    Object.assign(g.engine.players[index], { snake: [{ x, y }], direction: 'right' });
    for (const [dx, dy] of [[1, 0], [0, -1], [0, 1]]) g.engine.obstacles.push({ x: x + dx, y: y + dy, type: 'wall' });
  }
  for (const time of [0, 200, 400, 600, 800]) g.frame(time);
  assert.equal(g.state(), 'won');
  assert.equal(g.element('opponentScore').textContent, '00');
  assert.match(g.element('overlayTitle').textContent, /You win the AI Arena/);
  assert.match(g.element('aiStandings').textContent, /eliminated/);
  g.click('playButton');
  assert.equal(g.state(), 'playing');
  assert.equal(g.element('opponentScore').textContent, '03');
  assert.ok(g.engine.players.every((player) => player.alive));
});

test('switching out of AI Arena restores local team and original-food options', () => {
  const g = load({ playerCount: null });
  for (const selection of ['ai', '2']) {
    g.element('playersSelect').value = selection;
    g.element('playersSelect').listeners.change();
  }
  g.element('foodSelect').value = '1';
  g.element('foodSelect').listeners.change();
  assert.equal(g.engine.aiCount, 0);
  assert.equal(g.engine.players.length, 2);
  assert.equal(g.engine.foods.length, 1);
  assert.equal(g.element('opponentEntry').hidden, false);
  assert.equal(g.element('playerTwoControls').hidden, false);
  assert.equal(g.element('aiSettings').hidden, true);
  assert.equal(g.element('opponentScoreLabel').textContent, 'P2 SCORE');
});

test('invalid AI and food preferences fall back safely; blocked storage still supports AI', () => {
  const g = load({ playerCount: null, storage: new Map([
    ['snake-club-players-v1', 'ai'], ['snake-club-ai-count-v1', '999'], ['snake-club-food-count-v1', '-1'],
  ]) });
  assert.equal(g.engine.aiCount, 3);
  assert.equal(g.engine.foodCount, 5);
  for (const [id, value] of [['aiCountSelect', '999'], ['foodSelect', '-1']]) {
    g.element(id).value = value;
    g.element(id).listeners.change();
  }
  assert.equal(g.engine.aiCount, 3);
  assert.equal(g.engine.foodCount, 5);
  const blocked = load({ blocked: true, playerCount: null });
  blocked.element('playersSelect').value = 'ai';
  blocked.element('playersSelect').listeners.change();
  blocked.click('playButton');
  for (const time of [0, 200, 400, 600, 800]) blocked.frame(time);
  assert.equal(blocked.state(), 'playing');
});

test('mode picker previews, remembers and locks the selected mode during a round', () => {
  const g = load();
  assert.equal(g.element('modeSelect').value, 'obstacles');
  assert.ok(g.engine.obstacles.some(({ type }) => type === 'barrier'));
  assert.ok(g.engine.obstacles.some(({ type }) => type === 'rock'));
  assert.equal(g.element('.game-shell').dataset.mode, 'obstacles');
  assert.match(g.element('overlayText').textContent, /walls/);
  assert.equal(g.element('modeSelect').disabled, false);
  g.element('modeSelect').value = 'maze';
  g.element('modeSelect').listeners.change();
  assert.equal(g.engine.mode, 'maze');
  assert.ok(g.engine.obstacles.length > 0);
  assert.match(g.element('modeHint').textContent, /maze walls/);
  assert.match(g.element('board').attrs['aria-label'], /Maze mode/);
  assert.equal(g.storage.get('snake-club-mode-v1'), 'maze');
  assert.equal(load({ storage: g.storage }).element('modeSelect').value, 'maze');
  // Native select keys must not trigger game shortcuts.
  g.key(' ', { target: g.element('modeSelect') });
  g.key('r', { target: g.element('modeSelect') });
  assert.equal(g.state(), 'ready');
  g.click('playButton');
  assert.equal(g.engine.mode, 'maze');
  assert.equal(g.element('modeSelect').disabled, true);
  assert.match(g.element('announcer').textContent, /Maze mode/);
  g.click('pauseButton');
  assert.equal(g.element('modeSelect').disabled, true);
  g.element('modeSelect').value = 'classic';
  g.element('modeSelect').listeners.change();
  assert.equal(g.engine.mode, 'maze');
  g.click('playButton');
  g.click('restartButton');
  assert.equal(g.engine.mode, 'maze');
  g.engine.snake = [{ x: 1, y: 5 }]; g.engine.direction = 'left';
  for (const time of [0, 200, 400, 600, 800]) g.frame(time);
  assert.equal(g.state(), 'over');
  assert.match(g.element('overlayText').textContent, /hit a wall/);
  assert.match(g.element('announcer').textContent, /hit a wall/);
  assert.equal(g.element('modeSelect').disabled, false);
  g.element('modeSelect').value = 'classic';
  g.element('modeSelect').listeners.change();
  assert.deepEqual(g.engine.obstacles, []);
  g.click('playButton');
  assert.equal(g.engine.mode, 'classic');
});

test('an explicitly saved Classic choice remains available without obstacles', () => {
  const g = load({ storage: new Map([['snake-club-mode-v1', 'classic']]) });
  assert.equal(g.element('modeSelect').value, 'classic');
  assert.equal(g.element('.game-shell').dataset.mode, 'classic');
  assert.deepEqual(g.engine.obstacles, []);
  assert.match(g.element('overlayText').textContent, /Edges wrap/);
  g.element('modeSelect').value = 'obstacles';
  g.element('modeSelect').listeners.change();
  assert.ok(g.engine.obstacles.length > 0);
  assert.equal(g.element('.game-shell').dataset.mode, 'obstacles');
});

test('obstacle hits show the cause and replay restores a safe layout', () => {
  for (const type of ['barrier', 'rock']) {
    const g = load();
    g.element('modeSelect').value = 'obstacles';
    g.element('modeSelect').listeners.change();
    g.click('playButton');
    const target = g.engine.obstacles.find((cell) => cell.type === type);
    g.engine.snake = [{ x: target.x - 1, y: target.y }];
    for (const time of [0, 200, 400, 600, 800]) g.frame(time);
    assert.equal(g.state(), 'over');
    assert.ok(g.element('overlayText').textContent.includes(`hit a ${type === 'rock' ? 'stone block' : type}`));
    assert.equal(g.element('music').paused, true);
    g.click('playButton');
    assert.equal(g.state(), 'playing');
    assert.equal(g.engine.collision, null);
    assert.equal(g.engine.mode, 'obstacles');
    assert.equal(g.engine.snake.length, 3);
  }
});

test('invalid saved modes default to obstacles and blocked storage still permits selection', () => {
  for (const mode of ['unknown', '__proto__', 'constructor', '']) {
    const g = load({ storage: new Map([['snake-club-mode-v1', mode]]) });
    assert.equal(g.engine.mode, 'obstacles');
    assert.equal(g.element('modeSelect').value, 'obstacles');
  }
  const g = load({ blocked: true });
  g.element('modeSelect').value = 'obstacles';
  g.element('modeSelect').listeners.change();
  g.click('playButton');
  assert.equal(g.engine.mode, 'obstacles');
  assert.equal(g.state(), 'playing');
});

function eat(g) {
  g.engine.food = { x: g.engine.snake[0].x + 1, y: g.engine.snake[0].y };
  for (const time of [0, 200, 400, 600, 800]) g.frame(time);
}

function eatMushroom(g, playerIndex = 0) {
  g.engine.mushrooms = [g.engine.nextHead(g.engine.players[playerIndex])];
  g.engine.food = { x: 20, y: 18 };
  g.engine.extraFoods = [];
  g.engine.goldenDelay = 10000;
  for (const time of [0, 200, 400, 600, 650]) g.frame(time);
}

test('only Classic shows mushrooms and their HUD/stat rows, including reloads and restarts', () => {
  const g = load();
  for (const mode of ['obstacles', 'classic', 'maze', 'classic']) {
    g.element('modeSelect').value = mode;
    g.element('modeSelect').listeners.change();
    for (const current of [g, load({ storage: g.storage })]) {
      const classic = mode === 'classic';
      assert.equal(current.engine.mushrooms.length, classic ? 4 : 0);
      for (const id of ['mushroomStatus', 'mushroomRow', 'herbRow']) assert.equal(current.element(id).hidden, !classic);
    }
    const round = load({ storage: g.storage });
    round.click('playButton');
    round.click('restartButton');
    assert.equal(round.engine.mushrooms.length, mode === 'classic' ? 4 : 0);
  }
});

test('mushroom catch updates score, records, warning and cheering; herb cures without scoring', () => {
  const g = load({ storage: new Map([['snake-club-mode-v1', 'classic']]) });
  assert.equal(g.engine.mushrooms.length, 4);
  assert.equal(g.element('controlStatus').hidden, true);
  g.click('playButton');
  eatMushroom(g);
  assert.equal(g.element('score').textContent, '50');
  assert.equal(g.element('best').textContent, '50');
  assert.equal(g.element('mushroomCount').textContent, '1');
  assert.equal(g.element('controlStatus').hidden, false);
  assert.match(g.element('controlStatus').textContent, /P1 REVERSED.*5s/);
  assert.equal(g.element('playerOneControls').dataset.reversed, 'true');
  assert.match(g.element('p0-leftButton').attrs['aria-label'], /moves right.*reversed/);
  assert.match(g.element('announcer').textContent, /Controls reversed/);
  assert.match(g.element('friendMessage').textContent, /Mushroom! \+50/);
  assert.deepEqual(JSON.parse(g.storage.get('snake-club-record-v3:classic:solo')), { score: 50, name: 'Alex' });
  g.click('pauseButton');
  const frozen = JSON.stringify(g.engine);
  g.frame(4000);
  assert.equal(JSON.stringify(g.engine), frozen, 'pause freezes the effect and herb delay');
  g.engine.players[0].herbReadyAt = g.engine.elapsedMs;
  g.engine.herbs = [g.engine.nextHead(g.engine.players[0])];
  g.click('playButton');
  g.frame(5000);
  g.frame(5200);
  assert.equal(g.element('score').textContent, '50');
  assert.equal(g.element('herbCount').textContent, '1');
  assert.equal(g.element('controlStatus').hidden, true);
  assert.match(g.element('announcer').textContent, /Normal controls restored/);
  assert.equal(g.engine.players[0].controlsReversed, false);
  assert.equal(g.element('playerOneControls').dataset.reversed, 'false');
  assert.doesNotMatch(g.element('p0-leftButton').attrs['aria-label'], /reversed/);
});

test('mushrooms reverse WASD, arrows, touch buttons and swipes consistently', () => {
  const g = load({ storage: new Map([['snake-club-mode-v1', 'classic']]) });
  g.click('playButton');
  eatMushroom(g);
  for (const [key, expected] of [['ArrowUp', 'down'], ['w', 'down'], ['ArrowDown', 'up'], ['s', 'up'], ['ArrowLeft', 'right'], ['a', 'right'], ['ArrowRight', 'left'], ['d', 'left']]) {
    g.engine.direction = ['left', 'right'].includes(expected) ? 'up' : 'right';
    g.engine.turns = [];
    g.key(key);
    assert.deepEqual(g.engine.turns, [expected], key);
  }
  g.engine.direction = 'up';
  g.engine.turns = [];
  g.click('p0-leftButton');
  assert.deepEqual(g.engine.turns, ['right']);
  g.engine.direction = 'right';
  g.engine.turns = [];
  const handlers = g.element('board').listeners;
  handlers.pointerdown({ isPrimary: true, pointerId: 1, clientX: 100, clientY: 100 });
  handlers.pointermove({ pointerId: 1, clientX: 100, clientY: 60 });
  assert.deepEqual(g.engine.turns, ['down']);
  g.key(' ');
  assert.equal(g.state(), 'paused', 'pause is never inverted');
  g.key('r');
  assert.equal(g.state(), 'playing');
  assert.equal(g.engine.players[0].controlsReversed, false);
  assert.equal(g.engine.mushrooms.length, 4);
  assert.equal(g.engine.herbs.length, 0);
});

test('local team applies reversed controls only to the affected player', () => {
  const g = load({ playerCount: null, storage: new Map([['snake-club-mode-v1', 'classic']]) });
  g.click('playButton');
  eatMushroom(g);
  g.key('w');
  g.key('ArrowUp');
  assert.deepEqual(g.engine.players[0].turns, ['down']);
  assert.deepEqual(g.engine.players[1].turns, ['up']);
  g.engine.players[1].controlsReversed = true;
  g.engine.players[1].herbReadyAt = g.engine.elapsedMs + 5000;
  g.engine.players[1].turns = [];
  g.key('ArrowUp');
  assert.deepEqual(g.engine.players[1].turns, ['down']);
});

test('AI mushroom bonuses never replace the human best record', () => {
  const g = load({ playerCount: null, storage: new Map([['snake-club-mode-v1', 'classic']]) });
  g.element('playersSelect').value = 'ai';
  g.element('playersSelect').listeners.change();
  g.click('playButton');
  Object.assign(g.engine.players[1], { snake: [{ x: 5, y: 5 }], direction: 'right' });
  g.engine.mushrooms = [{ x: 6, y: 5 }];
  // Trap alternate routes so the bot must cross the mushroom rather than a wall.
  g.engine.obstacles = [{ x: 5, y: 4, type: 'wall' }, { x: 5, y: 6, type: 'wall' }];
  for (const time of [0, 200, 400, 600, 650]) g.frame(time);
  assert.equal(g.engine.players[1].score, 50);
  assert.equal(g.element('best').textContent, '00');
  assert.match(g.element('aiStandings').textContent, /AI 1: 50 points.*reversed/);
});

test('home offers the selected map/play type, opens setup, and safely cancels a countdown', () => {
  const g = load({ autoCountdown: false });
  assert.equal(g.state(), 'ready');
  assert.equal(g.element('homeIntro').hidden, false);
  assert.equal(g.element('homeSummary').textContent, 'Obstacles · Solo');
  g.click('homeSettings');
  assert.equal(g.element('gameSettings').open, true);
  assert.equal(g.focus(), 'playersSelect');
  selectRecordCategory(g, 'classic', 'ai');
  assert.equal(g.element('homeSummary').textContent, 'Classic · AI Arena');
  g.click('playButton');
  assert.equal(g.state(), 'countdown');
  assert.equal(g.element('homeIntro').hidden, true);
  g.click('homeButton');
  assert.equal(g.state(), 'ready');
  assert.equal(g.element('homeIntro').hidden, false);
  assert.equal(g.element('countdown').hidden, true);
  assert.equal(g.element('gameSettings').open, false);
  assert.equal(g.element('playLabel').textContent, 'LET’S PLAY');
  g.frame(10000);
  assert.equal(g.state(), 'ready');
  assert.equal(g.engine.elapsedMs, 0);
});

test('1 → 2 → 3 → GO freezes all snakes and timers until the round starts', () => {
  const g = load({ autoCountdown: false });
  selectRecordCategory(g, 'classic', 'ai');
  g.click('playButton');
  const snakes = JSON.stringify(g.engine.players.map((player) => player.snake));
  assert.equal(g.state(), 'countdown');
  assert.equal(g.element('countdownNumber').textContent, '1');
  assert.equal(g.element('countdown').hidden, false);
  assert.equal(g.element('overlay').hidden, true);
  g.frame(0);
  const sequence = [];
  for (let time = 200; time <= 3000; time += 200) {
    g.frame(time);
    if (time % 1000 === 0) sequence.push(g.element('countdownNumber').textContent);
    assert.equal(g.engine.elapsedMs, 0);
    assert.equal(JSON.stringify(g.engine.players.map((player) => player.snake)), snakes);
  }
  assert.deepEqual(sequence, ['2', '3', 'GO!']);
  assert.equal(g.state(), 'countdown');
  g.frame(3200); g.frame(3400); g.frame(3450);
  assert.equal(g.state(), 'playing');
  assert.equal(g.element('countdown').hidden, true);
  assert.equal(g.engine.elapsedMs, 0);
  g.frame(3650); g.frame(3850); g.frame(4050);
  assert.ok(g.engine.elapsedMs > 0);
});

test('countdown locks game settings, ignores repeat starts and allows a first direction', () => {
  const g = load({ autoCountdown: false });
  g.click('playButton');
  g.frame(0);
  for (const time of [200, 400, 600, 800, 1000]) g.frame(time);
  g.key('r');
  g.click('restartButton');
  assert.equal(g.element('countdownNumber').textContent, '2', 'duplicate starts do not reset the countdown');
  for (const id of ['playersSelect', 'modeSelect', 'foodSelect', 'aiCountSelect']) assert.equal(g.element(id).disabled, true);
  g.element('modeSelect').value = 'maze'; g.element('modeSelect').listeners.change();
  assert.equal(g.engine.mode, 'obstacles');
  g.key('ArrowUp');
  assert.deepEqual(g.engine.turns, ['up']);
  assert.equal(g.engine.elapsedMs, 0);
});

test('blur and Escape pause the countdown without skipping numbers on resume', () => {
  const g = load({ autoCountdown: false });
  g.click('playButton');
  g.frame(0);
  for (const time of [200, 400, 600, 800, 1000, 1200]) g.frame(time);
  assert.equal(g.element('countdownNumber').textContent, '2');
  g.events.blur();
  assert.equal(g.state(), 'paused');
  const before = JSON.stringify(g.engine);
  g.frame(5000);
  assert.equal(JSON.stringify(g.engine), before);
  g.click('playButton');
  assert.equal(g.state(), 'countdown');
  g.frame(5100); g.frame(5300);
  assert.equal(g.element('countdownNumber').textContent, '2');
  g.key('Escape');
  assert.equal(g.state(), 'paused');
  g.element('gameStats').open = true;
  g.click('homeButton');
  assert.equal(g.element('gameStats').open, false);
  assert.equal(g.state(), 'ready');
});

test('rematches always begin a fresh countdown rather than moving immediately', () => {
  const g = load({ autoCountdown: false });
  g.click('playButton');
  for (let time = 0; time <= 3600; time += 200) g.frame(time);
  g.engine.obstacles = [{ ...g.engine.nextHead(g.engine.players[0]), type: 'wall' }];
  g.frame(3800); g.frame(4000); g.frame(4200);
  assert.equal(g.state(), 'over');
  g.click('playButton');
  assert.equal(g.state(), 'countdown');
  assert.equal(g.element('countdownNumber').textContent, '1');
  assert.equal(g.engine.score, 0);
  assert.equal(g.engine.elapsedMs, 0);
});

test('touch turns respond on press without replaying a synthetic click; keyboard clicks still work', () => {
  const g = load();
  g.click('playButton');
  const up = g.element('p0-upButton');
  let prevented = false;
  up.listeners.pointerdown({ isPrimary: true, button: 0, preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.deepEqual(g.engine.turns, ['up']);
  g.engine.turns = []; g.engine.direction = 'left';
  up.listeners.click({ detail: 1 });
  assert.deepEqual(g.engine.turns, [], 'the corresponding pointer click is consumed');
  up.listeners.click({ detail: 0 });
  assert.deepEqual(g.engine.turns, ['up'], 'native keyboard activation is not suppressed');
});

test('both local touch pads accept simultaneous primary and secondary fingers', () => {
  const g = load({ playerCount: null }); g.click('playButton');
  g.element('p0-upButton').listeners.pointerdown({ isPrimary: true, pointerType: 'touch', button: 0, preventDefault() {} });
  g.element('p1-downButton').listeners.pointerdown({ isPrimary: false, pointerType: 'touch', button: 0, preventDefault() {} });
  assert.deepEqual(g.engine.players[0].turns, ['up']);
  assert.deepEqual(g.engine.players[1].turns, ['down']);
});

test('ambiguous diagonal swipes are ignored and the next legal queued turn can be corrected', () => {
  const g = load(); g.click('playButton');
  const handlers = g.element('board').listeners;
  handlers.pointerdown({ isPrimary: true, pointerId: 1, clientX: 100, clientY: 100 });
  handlers.pointermove({ pointerId: 1, clientX: 130, clientY: 128 });
  assert.deepEqual(g.engine.turns, []);
  handlers.pointermove({ pointerId: 1, clientX: 100, clientY: 60 });
  handlers.pointermove({ pointerId: 1, clientX: 60, clientY: 60 });
  assert.deepEqual(g.engine.turns, ['up', 'left']);
  g.key('ArrowRight');
  assert.deepEqual(g.engine.turns, ['up', 'right']);
  g.key('ArrowDown');
  assert.deepEqual(g.engine.turns, ['up', 'right'], 'a correction cannot reverse the imminent up turn');
});

test('shield saves have a visible notice that freezes on pause and clears on restart', () => {
  const g = load(); g.click('playButton');
  g.engine.players[0].shieldUntil = 10000;
  g.engine.obstacles = [{ ...g.engine.nextHead(g.engine.players[0]), type: 'wall' }];
  for (const time of [0, 200, 400, 600]) g.frame(time);
  assert.equal(g.element('eventNotice').hidden, false);
  assert.match(g.element('eventNotice').textContent, /shield saved you.*turn now/);
  g.click('pauseButton'); g.frame(10000);
  assert.equal(g.element('eventNotice').hidden, false);
  g.click('restartButton');
  assert.equal(g.element('eventNotice').hidden, true);
});

test('animal chains award a modest bonus, celebrate the goal and produce a useful result summary', () => {
  const g = load(); g.click('playButton');
  g.engine.food = { ...g.engine.nextHead(g.engine.players[0]), type: 'rat' };
  for (const time of [0, 200, 400, 600]) g.frame(time);
  g.engine.food = { ...g.engine.nextHead(g.engine.players[0]), type: 'rabbit' }; g.frame(800);
  g.engine.food = { ...g.engine.nextHead(g.engine.players[0]), type: 'frog' }; g.frame(1000);
  assert.equal(g.engine.score, 4);
  assert.equal(g.engine.level, 1);
  assert.match(g.element('comboStatus').textContent, /CHAIN 3/);
  assert.match(g.element('eventNotice').textContent, /combo bonus.*goal complete/);
  assert.match(g.element('announcer').textContent, /combo bonus/);
  g.engine.obstacles.push({ ...g.engine.nextHead(g.engine.players[0]), type: 'wall' });
  g.frame(1200); g.frame(1400);
  assert.equal(g.state(), 'over');
  assert.equal(g.element('roundResults').hidden, false);
  assert.equal(g.element('playerEntry').hidden, true, 'rematches do not require another name/avatar form');
  assert.equal(g.element('result0Score').textContent, '4');
  assert.equal(g.element('result0Animals').textContent, '3');
  assert.equal(g.element('result0Chain').textContent, '3 · +1 bonus');
  assert.match(g.element('result0Medals').textContent, /Balanced diet.*Catch rhythm.*New record/);
  assert.match(g.element('result0Goal').textContent, /Goal complete/);
  assert.equal(g.element('result1Card').hidden, true);
  assert.equal(g.focus(), 'playButton');
  g.click('resultHome');
  assert.equal(g.state(), 'ready');
  assert.equal(g.element('best').textContent, '04');
  assert.match(g.element('homeGoal').textContent, /60 active seconds/);
});

test('local result cards and optional goals belong to each human, not the combined catch total', () => {
  const g = load({ playerCount: null }); g.click('playButton');
  const feed = (type, index, time) => { g.engine.food = { ...g.engine.nextHead(g.engine.players[index]), type }; g.frame(time); };
  g.engine.food = { ...g.engine.nextHead(g.engine.players[0]), type: 'rat' };
  for (const time of [0, 200, 400, 600]) g.frame(time);
  feed('rabbit', 1, 800); feed('frog', 0, 1000);
  g.engine.obstacles.push({ ...g.engine.nextHead(g.engine.players[1]), type: 'wall' });
  g.frame(1200); g.frame(1400);
  assert.equal(g.element('roundResults').dataset.players, '2');
  assert.equal(g.element('result1Card').hidden, false);
  assert.equal(g.element('result0Score').textContent, '2');
  assert.equal(g.element('result1Score').textContent, '1');
  assert.doesNotMatch(g.element('result0Medals').textContent, /Balanced diet/);
  assert.doesNotMatch(g.element('result1Medals').textContent, /Balanced diet/);
  assert.match(g.element('result0Goal').textContent, /2\/3/);
  assert.match(g.element('result1Goal').textContent, /1\/3/);
  g.click('playButton');
  assert.equal(g.element('roundResults').hidden, true);
  assert.match(g.element('countdownGoal').textContent, /60 active seconds/);
});

test('UI starts, moves, pauses without advancing, resumes and restarts', () => {
  const g = load();
  assert.equal(g.state(), 'ready');
  assert.equal(g.element('pauseButton').disabled, true);
  g.click('playButton');
  assert.equal(g.state(), 'playing');
  assert.equal(g.focus(), 'board');
  assert.equal(g.element('overlay').hidden, true);
  g.key('ArrowUp');
  g.frame(0);
  for (const time of [200, 400, 600, 800]) g.frame(time);
  assert.equal(g.engine.direction, 'up');
  g.key(' ');
  assert.equal(g.state(), 'paused');
  const before = JSON.stringify(g.engine.snake);
  g.frame(1800);
  assert.equal(JSON.stringify(g.engine.snake), before);
  g.click('playButton');
  g.frame(5000);
  assert.equal(JSON.stringify(g.engine.snake), before); // No hidden-time catch-up.
  g.frame(5200);
  assert.notEqual(JSON.stringify(g.engine.snake), before);
  g.key('r');
  assert.equal(g.engine.score, 0);
  assert.equal(g.engine.direction, 'right');
  assert.equal(g.state(), 'playing');
});

test('score and best update on eating, survive restart and reload', () => {
  const g = load();
  g.click('playButton');
  eat(g);
  assert.equal(g.element('score').textContent, '01');
  assert.equal(g.element('best').textContent, '01');
  g.click('restartButton');
  assert.equal(g.element('score').textContent, '00');
  assert.equal(g.element('best').textContent, '01');
  assert.equal(load({ storage: g.storage }).element('best').textContent, '01');
});

function selectRecordCategory(g, mode, players) {
  g.element('modeSelect').value = mode;
  g.element('modeSelect').listeners.change();
  g.element('playersSelect').value = players;
  g.element('playersSelect').listeners.change();
}

function endRecordRound(g) {
  g.engine.obstacles = [{ ...g.engine.nextHead(g.engine.players[0]), type: 'wall' }];
  g.frame(1000);
  assert.equal(g.state(), 'over');
}

test('all nine map/play-type records load independently and select the correct champion', () => {
  const storage = new Map();
  let score = 10;
  for (const mode of ['classic', 'obstacles', 'maze']) {
    for (const type of ['solo', 'team', 'ai']) {
      storage.set(`snake-club-record-v3:${mode}:${type}`, JSON.stringify({ score: score++, name: `${mode}-${type}` }));
    }
  }
  const g = load({ storage });
  score = 10;
  for (const mode of ['classic', 'obstacles', 'maze']) {
    for (const [players, type, label] of [['1', 'solo', 'Solo'], ['2', 'team', 'Local team'], ['ai', 'ai', 'AI Arena']]) {
      selectRecordCategory(g, mode, players);
      assert.equal(g.element('best').textContent, String(score));
      assert.equal(g.element('bestDetailScore').textContent, String(score++));
      assert.equal(g.element('bestName').textContent, `${mode}-${type}`);
      assert.match(g.element('recordType').textContent, new RegExp(label));
      assert.match(g.element('best').attrs.title, new RegExp(`${mode}-${type}`));
    }
  }
  const before = g.element('best').textContent;
  g.element('aiCountSelect').value = '2'; g.element('aiCountSelect').listeners.change();
  g.element('foodSelect').value = '10'; g.element('foodSelect').listeners.change();
  g.element('skinSelect').value = 'ember'; g.element('skinSelect').listeners.change();
  g.element('backdropSelect').value = 'meadow'; g.element('backdropSelect').listeners.change();
  assert.equal(g.element('best').textContent, before, 'cosmetics, food density and AI count do not create categories');
});

test('new human records persist separately for every map and play type across reloads', () => {
  const storage = new Map();
  let index = 0;
  for (const mode of ['classic', 'obstacles', 'maze']) {
    for (const [players, type] of [['1', 'solo'], ['2', 'team'], ['ai', 'ai']]) {
      const g = load({ storage });
      selectRecordCategory(g, mode, players);
      assert.equal(g.element('best').textContent, '00');
      const score = ++index * 4;
      const name = `Champion ${index}`;
      g.element('playerInput').value = name;
      g.element('teamInput').value = name;
      g.click('playButton');
      g.engine.players[0].score = score - 1;
      g.engine.players.filter((player) => player.ai).forEach((player) => { player.score = 1000; });
      eat(g);
      assert.equal(g.element('best').textContent, String(score).padStart(2, '0'));
      assert.deepEqual(JSON.parse(storage.get(`snake-club-record-v3:${mode}:${type}`)), { score, name });
      g.click('restartButton');
      assert.equal(g.element('bestName').textContent, name);
    }
  }
  const reloaded = load({ storage });
  index = 0;
  for (const mode of ['classic', 'obstacles', 'maze']) {
    for (const players of ['1', '2', 'ai']) {
      selectRecordCategory(reloaded, mode, players);
      const score = ++index * 4;
      assert.equal(reloaded.element('best').textContent, String(score).padStart(2, '0'));
      assert.equal(reloaded.element('bestName').textContent, `Champion ${index}`);
    }
  }
});

test('blocked storage still keeps separate per-type session records', () => {
  const g = load({ blocked: true });
  selectRecordCategory(g, 'classic', '1');
  g.click('playButton');
  g.engine.score = 2;
  eat(g);
  assert.equal(g.element('best').textContent, '03');
  endRecordRound(g);
  selectRecordCategory(g, 'maze', '1');
  assert.equal(g.element('best').textContent, '00');
  g.click('playButton'); eat(g);
  assert.equal(g.element('best').textContent, '01');
  endRecordRound(g);
  selectRecordCategory(g, 'classic', '1');
  assert.equal(g.element('best').textContent, '03');
  assert.equal(g.storage.size, 0);
});

test('a storage write failure preserves cached categories and the new session record', () => {
  const storage = new Map([
    ['snake-club-record-v3:classic:solo', JSON.stringify({ score: 12, name: 'Mint' })],
    ['snake-club-record-v3:maze:solo', JSON.stringify({ score: 7, name: 'Olive' })],
  ]);
  const g = load({ storage });
  selectRecordCategory(g, 'maze', '1');
  selectRecordCategory(g, 'classic', '1');
  storage.set = () => { throw Error('Storage full'); };
  g.click('playButton'); g.engine.score = 12; eat(g);
  assert.equal(g.element('best').textContent, '13');
  assert.match(g.element('storageNote').textContent, /session/);
  endRecordRound(g);
  selectRecordCategory(g, 'maze', '1');
  assert.equal(g.element('best').textContent, '07');
  selectRecordCategory(g, 'classic', '1');
  assert.equal(g.element('best').textContent, '13');
  assert.equal(JSON.parse(storage.get('snake-club-record-v3:classic:solo')).score, 12);
});

test('death shows the replay overlay and replay resets the game', () => {
  const g = load();
  g.click('playButton');
  g.engine.snake = [{ x: 3, y: 3 }, { x: 4, y: 3 }, { x: 4, y: 4 }, { x: 3, y: 4 }];
  for (const time of [0, 200, 400, 600, 800]) g.frame(time);
  assert.equal(g.state(), 'over');
  assert.equal(g.element('overlay').hidden, false);
  assert.equal(g.element('pauseButton').disabled, true);
  g.click('playButton');
  assert.equal(g.engine.snake.length, 3);
  assert.equal(g.state(), 'playing');
});

test('blur and hidden tabs pause automatically', () => {
  const g = load();
  g.click('playButton');
  g.events.blur();
  assert.equal(g.state(), 'paused');
  g.click('playButton');
  g.document.hidden = true;
  g.documentEvents.visibilitychange();
  assert.equal(g.state(), 'paused');
});

test('blocked and corrupt storage never prevent playing', () => {
  const g = load({ blocked: true });
  g.click('playButton');
  eat(g);
  assert.equal(g.element('best').textContent, '01');
  assert.match(g.element('storageNote').textContent, /session/);
  for (const bad of ['NaN', '-3', 'Infinity', '2.7', '9999999999999999999999']) {
    assert.equal(load({ storage: new Map([['snake-club-best-v1', bad]]) }).element('best').textContent, '00');
  }
});

test('button Space is left to native click, repeat input and modifiers are ignored', () => {
  const g = load();
  g.key(' ', { target: g.element('playButton') });
  assert.equal(g.state(), 'ready');
  g.key(' ', { repeat: true });
  assert.equal(g.state(), 'ready');
  g.key('r', { ctrlKey: true });
  assert.equal(g.state(), 'ready');
  g.key(' ');
  assert.equal(g.state(), 'playing');
});

test('settings pause play, Escape closes the panel, and summary Space stays native', () => {
  const g = load();
  const settings = g.element('gameSettings');
  g.click('playButton');
  settings.open = true;
  settings.listeners.toggle();
  assert.equal(g.state(), 'paused');
  g.key('Escape');
  assert.equal(settings.open, false);
  assert.equal(g.focus(), 'settingsSummary');
  assert.equal(g.state(), 'paused');
  const summary = g.element('settingsSummary');
  summary.tagName = 'SUMMARY';
  g.key(' ', { target: summary });
  assert.equal(g.state(), 'paused');
  g.click('playButton');
  assert.equal(g.state(), 'playing');
});

test('swipes steer only during play and stop after pointer cancellation', () => {
  const g = load();
  const handlers = g.element('board').listeners;
  g.click('playButton');
  handlers.pointerdown({ isPrimary: true, pointerId: 1, clientX: 100, clientY: 100 });
  handlers.pointermove({ pointerId: 1, clientX: 100, clientY: 60 });
  assert.deepEqual(g.engine.turns, ['up']);
  handlers.pointercancel();
  handlers.pointermove({ pointerId: 1, clientX: 60, clientY: 60 });
  assert.deepEqual(g.engine.turns, ['up']);
});

test('asks for a nonblank name; Enter starts and names never become HTML', () => {
  const g = load({ player: '' });
  assert.equal(g.focus(), 'playerInput');
  g.click('playButton');
  assert.equal(g.state(), 'ready');
  assert.equal(g.element('playerInput').attrs['aria-invalid'], 'true');
  g.element('playerInput').value = '  <b>Sam</b>   Fox  ';
  g.element('playerInput').listeners.keydown({ key: 'Enter', preventDefault() {} });
  assert.equal(g.state(), 'playing');
  assert.equal(g.element('playerName').textContent, '<b>Sam</b> Fox');
  assert.equal(g.element('playerEntry').hidden, true);
  assert.equal(g.storage.get('snake-club-player-v1'), '<b>Sam</b> Fox');
});

test('three avatars unlock after naming, appear during play and survive pause, restart and reload', () => {
  const g = load({ player: '' });
  assert.equal(g.element('avatarPicker').disabled, true);
  assert.equal(g.element('playerAvatar').hidden, true);
  assert.equal(g.element('avatar-mint').checked, true);
  g.element('playerInput').value = '   ';
  g.element('playerInput').listeners.input();
  assert.equal(g.element('avatarPicker').disabled, true);
  g.element('playerInput').value = 'Sam';
  g.element('playerInput').listeners.input();
  assert.equal(g.element('avatarPicker').disabled, false);
  for (const id of ['mint', 'peach', 'olive']) {
    for (const other of ['mint', 'peach', 'olive']) g.element(`avatar-${other}`).checked = other === id;
    g.element(`avatar-${id}`).listeners.change();
    g.click('playButton');
    assert.equal(g.state(), 'playing');
    assert.equal(g.element('playerAvatar').hidden, false);
    assert.equal(g.element('playerAvatar').dataset.avatar, id);
    assert.match(g.element('playerAvatar').attrs.alt, /human face avatar/);
    assert.equal(g.element('playerAvatar').attrs.src, `assets/avatar-${id}.svg`);
    assert.equal(g.storage.get('snake-club-avatar-v1'), id);
    g.click('pauseButton');
    assert.equal(g.element('playerEntry').hidden, true);
    g.click('playButton');
    g.click('restartButton');
    assert.equal(g.element('playerAvatar').dataset.avatar, id);
    const next = load({ storage: g.storage });
    assert.equal(next.element(`avatar-${id}`).checked, true);
    assert.equal(next.element('playerAvatar').dataset.avatar, id);
    assert.equal(next.element('avatarPicker').disabled, false);
    g.engine.snake = [{ x: 3, y: 3 }, { x: 4, y: 3 }, { x: 4, y: 4 }, { x: 3, y: 4 }];
    for (const time of [0, 200, 400, 600, 800]) g.frame(time);
    assert.equal(g.state(), 'over');
    assert.equal(g.element('playerEntry').hidden, true);
    g.click('resultHome');
    assert.equal(g.element('playerEntry').hidden, false);
  }
});

test('avatar keyboard controls are not game controls; Enter starts with the selection', () => {
  const g = load();
  g.element('avatar-mint').checked = false;
  const radio = g.element('avatar-peach');
  radio.checked = true;
  radio.listeners.change();
  g.key('ArrowRight', { target: radio });
  g.key(' ', { target: radio });
  assert.equal(g.state(), 'ready');
  assert.deepEqual(g.engine.turns, []);
  radio.listeners.keydown({ key: 'Enter', preventDefault() {} });
  assert.equal(g.state(), 'playing');
  assert.equal(g.element('playerAvatar').dataset.avatar, 'peach');
  assert.match(g.element('announcer').textContent, /Peach avatar/);
});

test('invalid saved avatars default safely and blocked storage still allows a choice', () => {
  for (const value of ['unknown', '__proto__', 'constructor', '<script>', '']) {
    const g = load({ storage: new Map([['snake-club-avatar-v1', value]]) });
    assert.equal(g.element('avatar-mint').checked, true);
    g.click('playButton');
    assert.equal(g.element('playerAvatar').dataset.avatar, 'mint');
  }
  const g = load({ blocked: true });
  g.element('avatar-olive').checked = true;
  g.element('avatar-olive').listeners.change();
  g.click('playButton');
  assert.equal(g.state(), 'playing');
  assert.equal(g.element('playerAvatar').dataset.avatar, 'olive');
});

test('simple backdrops persist independently and never reset a round', () => {
  const g = load();
  const before = JSON.stringify(g.engine);
  for (const theme of ['night', 'meadow', 'sunset']) {
    g.element('backdropSelect').value = theme;
    g.element('backdropSelect').listeners.change();
    assert.equal(g.element('board').dataset.backdrop, theme);
    assert.equal(g.element('board').dataset.layout, '2d');
    assert.equal(JSON.stringify(g.engine), before);
    assert.equal(load({ storage: g.storage }).element('backdropSelect').value, theme);
  }
  const invalid = load({ storage: new Map([['snake-club-backdrop-v1', '__proto__'], ['snake-club-view-v1', 'follow']]) });
  assert.equal(invalid.element('board').dataset.backdrop, 'night');
  assert.equal(invalid.element('board').dataset.layout, '2d');
});

test('snake rendering interpolates between ticks and does not rewind after pause', () => {
  const positions = [];
  const renderer = { draw(ctx, args) {
    if (args.player.ai === false) positions.push({ ...args.player.snake[0] });
    SnakeRenderer.draw(ctx, args);
  }};
  const g = load({ renderer, reducedMotion: false });
  g.click('playButton');
  for (const time of [0, 200, 400, 500]) g.frame(time);
  const start = positions.at(-1).x;
  g.frame(560);
  const middle = positions.at(-1).x;
  assert.ok(middle > start && middle < g.engine.snake[0].x);
  g.click('pauseButton');
  g.frame(1000);
  const frozen = positions.at(-1).x;
  g.click('playButton');
  g.frame(5000);
  assert.equal(positions.at(-1).x, frozen);
});

test('How to play opens from home, shares panel exclusivity, and closes with Escape or its close button', () => {
  const g = load();
  g.element('gameSettings').open = true;
  g.element('gameHelp').open = true;
  g.element('gameHelp').listeners.toggle();
  assert.equal(g.state(), 'ready');
  assert.equal(g.element('gameSettings').open, false);
  assert.equal(g.focus(), 'helpPanel');
  g.key('Escape');
  assert.equal(g.element('gameHelp').open, false);
  assert.equal(g.focus(), 'helpSummary');
  g.element('gameHelp').open = true;
  g.click('helpCloseButton');
  assert.equal(g.element('gameHelp').open, false);
  assert.equal(g.focus(), 'helpSummary');
});

test('reading instructions freezes play and countdown, and resume or Home closes the guide', () => {
  const g = load(); g.click('playButton');
  g.element('gameHelp').open = true;
  g.element('gameHelp').listeners.toggle();
  assert.equal(g.state(), 'paused');
  const snapshot = JSON.stringify(g.engine);
  g.frame(10000);
  assert.equal(JSON.stringify(g.engine), snapshot);
  g.click('playButton');
  assert.equal(g.element('gameHelp').open, false);
  assert.equal(g.state(), 'playing');
  const countdown = load({ autoCountdown: false });
  countdown.click('playButton');
  countdown.frame(0); countdown.frame(200);
  countdown.element('gameHelp').open = true;
  countdown.element('gameHelp').listeners.toggle();
  assert.equal(countdown.state(), 'paused');
  countdown.frame(10000);
  assert.equal(countdown.engine.elapsedMs, 0);
  countdown.click('playButton');
  assert.equal(countdown.state(), 'countdown');
  assert.equal(countdown.element('gameHelp').open, false);
  countdown.element('gameHelp').open = true;
  countdown.click('homeButton');
  assert.equal(countdown.element('gameHelp').open, false);
  assert.equal(countdown.state(), 'ready');
});

test('How to play reports the actual selected category, level and slow-motion-adjusted pace', () => {
  const g = load();
  assert.match(g.element('helpCurrent').textContent, /Obstacles · Solo.*Level 1, 1.0×, 240 ms/);
  g.click('playButton');
  g.engine.eaten = { rat: 10, rabbit: 10, frog: 10 };
  g.engine.slowUntil = 6000;
  for (const time of [0, 200, 400, 600, 800]) g.frame(time);
  assert.match(g.element('helpCurrent').textContent, /Level 2, 0.8×, 300 ms.*slow motion active/);
});

test('guide speed examples and item durations match the engine rules', () => {
  const html = readFileSync(join(__dirname, '..', 'index.html'), 'utf8');
  const guide = html.slice(html.indexOf('id="gameHelp"'), html.indexOf('id="gameStats"'));
  assert.match(guide, /8 active seconds/);
  assert.match(guide, /6 active seconds/);
  assert.match(guide, /5 active seconds/);
  assert.match(guide, /left ↔ right and up ↔ down/);
  assert.match(guide, /Mushroom — Classic only/);
  assert.match(guide, /AI catches, special items, and score bonuses never increase the level/);
  const g = new SnakeGame();
  for (let level = 1; level <= 5; level++) {
    const total = (level - 1) * 10;
    g.eaten = { rat: total, rabbit: total, frog: total };
    const row = guide.match(new RegExp('<tr><th scope="row">' + level + '</th><td>[^<]+</td><td>([^<]+)</td><td>≈?(\\d+) ms</td></tr>'));
    assert.ok(row, 'documented speed row exists for level ' + level);
    assert.equal(row[1], g.speedMultiplier.toFixed(1) + '×');
    assert.equal(Number(row[2]), Math.round(g.interval));
  }
  g.eaten = { rat: 1000, rabbit: 1000, frog: 1000 };
  assert.equal(g.interval, 40);
});

test('Settings and Stats are separate and opening either pauses the game', () => {
  const g = load();
  g.click('playButton');
  g.element('gameStats').open = true;
  g.element('gameStats').listeners.toggle();
  assert.equal(g.state(), 'paused');
  g.key('Escape');
  assert.equal(g.element('gameStats').open, false);
  assert.equal(g.focus(), 'statsSummary');
  g.element('gameStats').open = true;
  g.element('gameSettings').open = true;
  g.element('gameSettings').listeners.toggle();
  assert.equal(g.element('gameStats').open, false);
  g.click('playButton');
  assert.equal(g.element('gameSettings').open, false);
  g.element('gameStats').open = true;
  g.element('gameStats').listeners.toggle();
  g.click('playButton');
  assert.equal(g.state(), 'playing');
  assert.equal(g.element('gameStats').open, false);
});

test('skin selection previews and saves immediately without changing the simulation', () => {
  const g = load({ playerCount: null });
  assert.equal(g.element('skinSelect').value, 'classic');
  const before = JSON.stringify(g.engine);
  for (const id of Object.keys(SnakeSkins.catalog)) {
    g.element('skinSelect').value = id;
    g.element('skinSelect').listeners.change();
    assert.equal(g.element('board').dataset.skin, id);
    assert.equal(g.element('skinPreview').dataset.skin, id);
    assert.match(g.element('skinPreview').attrs['aria-label'], new RegExp(SnakeSkins.get(id).name));
    assert.equal(g.storage.get('snake-club-skin-v1'), id);
    assert.equal(JSON.stringify(g.engine), before, 'cosmetics never reset or modify a round');
    assert.equal(load({ storage: g.storage, playerCount: null }).element('skinSelect').value, id);
  }
});

test('skins survive play, paused changes, restart and avatar selection independently', () => {
  const g = load();
  g.element('skinSelect').value = 'ember';
  g.element('skinSelect').listeners.change();
  g.element('avatar-peach').checked = true;
  g.element('avatar-peach').listeners.change();
  g.click('playButton');
  assert.equal(g.element('board').dataset.skin, 'ember');
  assert.equal(g.element('playerAvatar').dataset.avatar, 'peach');
  g.click('pauseButton');
  const paused = JSON.stringify(g.engine);
  g.element('skinSelect').value = 'frost';
  g.element('skinSelect').listeners.change();
  assert.equal(g.state(), 'paused');
  assert.equal(JSON.stringify(g.engine), paused);
  assert.equal(g.element('board').dataset.skin, 'frost');
  g.click('restartButton');
  assert.equal(g.state(), 'playing');
  assert.equal(g.element('board').dataset.skin, 'frost');
  assert.equal(g.element('playerAvatar').dataset.avatar, 'peach');
  g.key(' ', { target: g.element('skinSelect') });
  assert.equal(g.state(), 'playing', 'native select keys are not game commands');
});

test('invalid skins and storage failures never prevent choosing a session skin', () => {
  for (const value of ['unknown', '__proto__', 'constructor', '']) {
    const g = load({ storage: new Map([['snake-club-skin-v1', value]]) });
    assert.equal(g.element('skinSelect').value, 'classic');
  }
  for (const blocked of [false, true]) {
    const g = load({ blocked });
    if (!blocked) g.storage.set = () => { throw Error('Quota exceeded'); };
    g.element('skinSelect').value = 'neon';
    assert.doesNotThrow(() => g.element('skinSelect').listeners.change());
    assert.equal(g.element('board').dataset.skin, 'neon');
    assert.match(g.element('skinDescription').textContent, /session/);
    g.element('skinSelect').value = '__proto__';
    g.element('skinSelect').listeners.change();
    assert.equal(g.element('skinSelect').value, 'neon');
    g.click('playButton');
    assert.equal(g.state(), 'playing');
  }
});

test('all skins preserve identical input, movement, food, score and collision outcomes', () => {
  const outcomes = [];
  for (const id of Object.keys(SnakeSkins.catalog)) {
    const g = load();
    g.element('skinSelect').value = id;
    g.element('skinSelect').listeners.change();
    g.click('playButton');
    g.key('ArrowUp');
    for (const time of [0, 200, 400, 600, 800, 1000]) g.frame(time);
    outcomes.push(JSON.stringify(g.engine));
  }
  assert.equal(new Set(outcomes).size, 1);
});

test('avatar markup uses three labeled native radios with one default choice', () => {
  const html = readFileSync(join(__dirname, '..', 'index.html'), 'utf8');
  assert.equal((html.match(/type="radio" name="avatar"/g) || []).length, 3);
  assert.equal((html.match(/name="avatar"[^>]*checked/g) || []).length, 1);
  assert.match(html, /<legend>Choose your avatar<\/legend>/);
  const portraits = new Set();
  for (const id of ['mint', 'peach', 'olive']) {
    assert.ok(html.includes(`src="assets/avatar-${id}.svg" data-avatar="${id}" alt=""`));
    const svg = readFileSync(join(__dirname, '..', 'assets', `avatar-${id}.svg`), 'utf8');
    assert.match(svg, /viewBox="0 0 96 96"/);
    portraits.add(svg);
  }
  assert.equal(portraits.size, 3);
});

test('champion name persists, ties keep the first champion, a higher score replaces it', () => {
  const g = load();
  g.click('playButton'); eat(g);
  const next = load({ storage: g.storage });
  assert.equal(next.element('bestName').textContent, 'Alex');
  assert.equal(next.element('playerInput').value, 'Alex');
  next.element('playerInput').value = 'Jamie';
  next.click('playButton'); eat(next);
  assert.equal(next.element('bestName').textContent, 'Alex');
  next.engine.food = { x: next.engine.snake[0].x + 1, y: next.engine.snake[0].y };
  next.frame(1000);
  assert.equal(next.element('bestName').textContent, 'Jamie');
  assert.deepEqual(JSON.parse(next.storage.get('snake-club-record-v3:obstacles:solo')), { score: 2, name: 'Jamie' });
  assert.equal(load({ storage: next.storage }).element('bestName').textContent, 'Jamie');
});

test('legacy records remain unclassified rather than contaminating game-type records', () => {
  for (const [key, raw, score, name] of [
    ['snake-club-best-v1', '12', 12, 'Unknown player'],
    ['snake-club-record-v2', JSON.stringify({ score: 50, name: 'Jamie' }), 50, 'Jamie'],
  ]) {
    const g = load({ storage: new Map([[key, raw]]) });
    assert.equal(g.element('best').textContent, '00');
    assert.equal(g.element('bestName').textContent, 'No record yet');
    assert.equal(g.element('legacyRecord').hidden, false);
    assert.match(g.element('legacyRecord').textContent, new RegExp(`${score} by ${name}.*game type unknown`));
    g.click('playButton'); eat(g);
    assert.equal(g.element('best').textContent, '01');
    assert.equal(g.storage.get(key), raw, 'the old record remains intact');
  }
});

test('invalid or malformed records are ignored without disabling storage', () => {
  for (const raw of ['{bad', 'null', '{"score":-2}', '{"score":1.5}', '{"score":"5"}', '{"score":1e30}', '{"score":0}']) {
    const g = load({ storage: new Map([['snake-club-record-v3:obstacles:solo', raw], ['snake-club-record-v2', raw]]) });
    assert.equal(g.element('best').textContent, '00');
    assert.equal(g.element('legacyRecord').hidden, true);
    g.click('playButton'); eat(g);
    assert.deepEqual(JSON.parse(g.storage.get('snake-club-record-v3:obstacles:solo')), { score: 1, name: 'Alex' });
  }
});

test('native music plays without Web Audio, mutes, pauses, resumes and stops on game over', async () => {
  const g = load();
  assert.equal(g.element('music').paused, true);
  g.click('playButton'); await new Promise(setImmediate);
  assert.equal(g.element('music').paused, false);
  assert.equal(g.element('soundLabel').textContent, 'MUSIC PLAYING');
  g.click('soundButton');
  assert.equal(g.element('music').paused, true);
  assert.equal(g.element('soundLabel').textContent, 'MUSIC OFF');
  g.click('soundButton'); await Promise.resolve();
  assert.equal(g.element('music').paused, false);
  g.click('pauseButton');
  assert.equal(g.element('music').paused, true);
  g.click('playButton'); await Promise.resolve();
  assert.equal(g.element('music').paused, false);
  g.engine.snake = [{ x: 3, y: 3 }, { x: 4, y: 3 }, { x: 4, y: 4 }, { x: 3, y: 4 }];
  for (const time of [0, 200, 400, 600, 800]) g.frame(time);
  assert.equal(g.state(), 'over');
  assert.equal(g.element('music').paused, true);
});

test('test sound works before playing; volume, stop and hidden tabs work', async () => {
  const g = load(); g.click('testSoundButton'); await Promise.resolve();
  assert.equal(g.state(), 'ready');
  assert.equal(g.element('music').paused, false);
  g.element('volumeInput').value = '0.4'; g.element('volumeInput').listeners.input();
  assert.equal(g.element('music').volume, 0.4);
  g.click('testSoundButton');
  assert.equal(g.element('music').paused, true);
  g.click('testSoundButton');
  g.document.hidden = true; g.documentEvents.visibilitychange();
  assert.equal(g.element('music').paused, true);
});

test('blocked media reports a retry instead of falsely claiming sound is on', async () => {
  const g = load({ mediaError: { name: 'NotAllowedError' } });
  g.click('playButton'); await new Promise(setImmediate);
  assert.equal(g.state(), 'playing');
  assert.equal(g.element('soundLabel').textContent, 'RETRY SOUND');
  assert.match(g.element('audioStatus').textContent, /blocked/);
  assert.equal(g.element('soundButton').disabled, false);
});

test('catches chomp and game over plays a distinct descending sound only once', () => {
  const g = load({ audioSupport: true });
  g.click('playButton');
  eat(g);
  assert.equal(g.element('chomp').plays, 2); // Silent priming, then the bite.
  assert.equal(g.element('chomp').muted, false);
  assert.equal(g.element('chomp').currentTime, 0);
  assert.equal(g.audioStats.notes, 0);
  g.engine.snake = [{ x: 3, y: 3 }, { x: 4, y: 3 }, { x: 4, y: 4 }, { x: 3, y: 4 }];
  g.frame(1000);
  assert.equal(g.state(), 'over');
  assert.equal(g.element('music').paused, true);
  assert.equal(g.audioStats.notes, 3);
  assert.deepEqual(g.audioStats.voices.map((voice) => voice.type),
    ['sawtooth', 'sawtooth', 'sawtooth']);
  assert.ok(g.audioStats.voices[2].stopTime > 0.7);
  g.frame(1200);
  assert.equal(g.audioStats.notes, 3);
  assert.equal(g.audioStats.stopped, 3);
  // Muting also silences any scheduled tail of the game-over effect.
  g.click('soundButton');
  assert.equal(g.audioStats.gains[0].at(-1), 0);
});

test('native chomp plays without Web Audio, can be tested, and reports blocked playback', async () => {
  const g = load();
  g.click('playButton');
  await new Promise(setImmediate);
  assert.equal(g.element('chomp').paused, true);
  eat(g);
  await Promise.resolve();
  assert.equal(g.element('chomp').paused, false);
  assert.equal(g.element('chomp').muted, false);
  g.element('volumeInput').value = '0.4';
  g.element('volumeInput').listeners.input();
  assert.equal(g.element('chomp').volume, 0.4);
  g.click('soundButton');
  assert.equal(g.element('chomp').muted, true);
  g.click('testChompButton');
  assert.equal(g.state(), 'paused');
  assert.equal(g.element('music').paused, true);
  assert.equal(g.element('chomp').muted, false);
  assert.equal(g.element('chomp').plays, 3);
  g.element('chomp').play = () => Promise.reject({ name: 'NotAllowedError' });
  g.click('testChompButton');
  await new Promise(setImmediate);
  assert.match(g.element('audioStatus').textContent, /Chomp could not play/);
});

test('chomp file is a non-silent PCM wave and is wired into the page', () => {
  const wav = readFileSync(join(__dirname, '..', 'assets', 'chomp.wav'));
  assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
  assert.equal(wav.readUInt32LE(24), 44100);
  assert.ok(wav.length > 20000);
  let peak = 0;
  for (let i = 44; i < wav.length; i += 2) peak = Math.max(peak, Math.abs(wav.readInt16LE(i)));
  assert.ok(peak >= 29000);
  const html = readFileSync(join(__dirname, '..', 'index.html'), 'utf8');
  assert.match(html, /id="chomp" src="assets\/chomp\.wav"/);
  assert.match(html, /id="testChompButton"/);
});

test('effects follow volume and stay silent when muted or volume is zero', () => {
  for (const muted of [false, true]) {
    const g = load({ audioSupport: true });
    g.click('playButton');
    g.element('volumeInput').value = muted ? '0.4' : '0';
    g.element('volumeInput').listeners.input();
    assert.equal(g.audioStats.gains[0].at(-1), muted ? 0.4 : 0);
    if (muted) g.click('soundButton');
    eat(g);
    assert.equal(g.engine.score, 1);
    g.engine.snake = [{ x: 3, y: 3 }, { x: 4, y: 3 }, { x: 4, y: 4 }, { x: 3, y: 4 }];
    g.frame(1000);
    assert.equal(g.state(), 'over');
    assert.equal(g.audioStats.notes, 0);
    assert.equal(g.element('chomp').plays, 1); // No audible playback after priming.
  }
});

test('catch table, level, speed and next targets update together and reset on replay', () => {
  const g = load();
  assert.equal(g.element('ratCount').textContent, '0');
  assert.equal(g.element('level').textContent, '1');
  g.click('playButton');
  // The next frog completes the first set of 10 of each animal.
  g.engine.score = 29;
  g.engine.eaten = { rat: 10, rabbit: 10, frog: 9 };
  eat(g);
  for (const animal of ['rat', 'rabbit', 'frog']) {
    assert.equal(g.element(`${animal}Count`).textContent, '10');
    assert.equal(g.element(`${animal}Target`).textContent, '20');
  }
  assert.equal(g.element('totalEaten').textContent, '30');
  assert.equal(g.element('level').textContent, '2');
  assert.equal(g.element('levelSpeed').textContent, '1.2×');
  assert.equal(g.element('pace').textContent, '1.2×');
  assert.match(g.element('announcer').textContent, /Level 2/);
  g.click('restartButton');
  assert.equal(g.element('frogCount').textContent, '0');
  assert.equal(g.element('totalEaten').textContent, '0');
  assert.equal(g.element('level').textContent, '1');
  assert.equal(g.element('levelSpeed').textContent, '1.0×');
  assert.equal(g.element('frogTarget').textContent, '10');
});

test('snake friends clap on every catch, settle down, and reset on pause and restart', () => {
  const g = load();
  assert.equal(g.element('snakeFriends').dataset.cheering, 'false');
  g.click('playButton');
  assert.equal(g.element('snakeFriends').dataset.cheering, 'false');
  eat(g);
  assert.equal(g.element('snakeFriends').dataset.cheering, 'true');
  assert.match(g.element('friendMessage').textContent, /Nice catch, Alex/);
  for (const time of [1000, 1200, 1400, 1600, 1800, 2000]) g.frame(time);
  assert.equal(g.element('snakeFriends').dataset.cheering, 'false');
  g.engine.food = { x: (g.engine.snake[0].x + 1) % g.engine.columns, y: g.engine.snake[0].y };
  g.frame(2200);
  assert.equal(g.element('snakeFriends').dataset.cheering, 'true');
  g.click('pauseButton');
  assert.equal(g.element('snakeFriends').dataset.cheering, 'false');
  g.click('restartButton');
  assert.match(g.element('friendMessage').textContent, /rooting/);
});

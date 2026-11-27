const { test } = require('node:test');
const assert = require('node:assert/strict');
const { SnakeAuth } = require('../snake-auth.js');
const { SnakeBreaks } = require('../snake-breaks.js');
const { SnakeGame } = require('../snake-engine.js');
const config = { firebase: { apiKey: 'test-key', authDomain: 'test.firebaseapp.com', projectId: 'test', appId: 'test-app' } };

function fakeSdk() {
  let listener;
  const stats = { popups: [], signedOut: 0 };
  class GoogleAuthProvider { constructor() { this.providerId = 'google.com'; } setCustomParameters(value) { this.parameters = value; } }
  class FacebookAuthProvider { constructor() { this.providerId = 'facebook.com'; } }
  return { stats, GoogleAuthProvider, FacebookAuthProvider,
    getApps: () => [], initializeApp: (value) => value, getAuth: () => ({}),
    onAuthStateChanged(auth, callback) { listener = callback; callback(null); },
    async signInWithPopup(auth, provider) {
      stats.popups.push(provider);
      if (stats.failure) throw Object.assign(Error(), { code: stats.failure });
      const user = { uid: provider.providerId, displayName: provider.providerId === 'google.com' ? 'Google Jane' : 'Facebook Sam', providerData: [{ providerId: provider.providerId }], async getIdTokenResult() { return { signInProvider: provider.providerId }; } };
      listener(user);
      return { user };
    },
    async signOut() { stats.signedOut++; listener(null); },
  };
}

test('unconfigured social login never creates a fake user or loads a remote SDK', async () => {
  const changes = [];
  const auth = SnakeAuth.create({ onChange: (state) => changes.push(state), loader: () => { throw Error('Must not load'); } });
  assert.equal(await auth.initialize(), false);
  assert.equal(await auth.signIn('facebook'), false);
  assert.equal(await auth.signIn('google'), false);
  assert.ok(changes.every((state) => state.user === null));
  assert.match(changes.at(-1).message, /configuration/);
});

test('Google and Facebook use real provider adapters and profile names from the SDK observer', async () => {
  const sdk = fakeSdk(); const changes = [];
  const auth = SnakeAuth.create({ config, loader: async () => sdk, onChange: (state) => changes.push(state) });
  await auth.initialize();
  assert.equal(await auth.signIn('google'), true);
  assert.equal(changes.at(-1).user.name, 'Google Jane');
  assert.equal(changes.at(-1).user.provider, 'google');
  assert.deepEqual(sdk.stats.popups[0].parameters, { prompt: 'select_account' });
  assert.equal(await auth.signIn('facebook'), true);
  assert.equal(changes.at(-1).user.name, 'Facebook Sam');
  assert.equal(changes.at(-1).user.provider, 'facebook');
  assert.equal(await auth.signOut(), true);
  assert.equal(changes.at(-1).user, null);
  assert.equal(sdk.stats.signedOut, 1);
});

test('popup failures remain honest and retryable, never authenticate a user', async () => {
  const sdk = fakeSdk(); sdk.stats.failure = 'auth/popup-blocked';
  const changes = [];
  const auth = SnakeAuth.create({ config, loader: async () => sdk, onChange: (state) => changes.push(state) });
  assert.equal(await auth.signIn('google'), false);
  assert.equal(changes.at(-1).user, null);
  assert.equal(changes.at(-1).busy, false);
  assert.match(changes.at(-1).message, /blocked/);
  delete sdk.stats.failure;
  assert.equal(await auth.signIn('google'), true);
  assert.equal(changes.at(-1).user.name, 'Google Jane');
});

test('Facebook invitations require an app ID and HTTPS public URL and never include private query data', () => {
  for (const inviteUrl of ['http://example.com', 'file:///game', 'https://localhost:45006', 'https://127.0.0.1', 'javascript:alert(1)', 'https://name:password@example.com']) {
    assert.equal(SnakeAuth.inviteLink({ facebookAppId: '12345678', inviteUrl }), null);
  }
  assert.equal(SnakeAuth.inviteLink({ inviteUrl: 'https://example.com' }), null);
  const link = new URL(SnakeAuth.inviteLink({ facebookAppId: '12345678', inviteUrl: 'https://example.com/game/?token=secret#private' }));
  assert.equal(link.origin, 'https://www.facebook.com');
  assert.equal(link.pathname, '/dialog/share');
  assert.equal(link.searchParams.get('href'), 'https://example.com/game/');
  assert.equal(link.searchParams.get('redirect_uri'), 'https://example.com/game/');
});

test('break reminders default off with a two-minute setting and validate saved/custom minutes', () => {
  assert.deepEqual(SnakeBreaks.normalize(), { enabled: false, minutes: 2 });
  for (const minutes of [0, 61, -1, 1.5, '4', Infinity]) assert.equal(SnakeBreaks.normalize({ enabled: true, minutes }).minutes, 2);
  const clock = SnakeBreaks.create();
  assert.equal(clock.advance(600000), false);
  assert.equal(clock.continuousMs, 0);
  clock.configure({ enabled: true, minutes: 2 });
  assert.equal(clock.advance(119999), false);
  assert.equal(clock.advance(1), true);
  assert.equal(clock.continuousMs, 0);
  clock.configure({ enabled: true, minutes: 5 });
  assert.equal(clock.advance(120000), false);
  assert.equal(clock.advance(180000), true);
});

test('manual pauses/new rounds reset continuous time; disabling reminders produces no pause', () => {
  const clock = SnakeBreaks.create({ enabled: true, minutes: 1 });
  clock.advance(40000); clock.reset();
  assert.equal(clock.advance(30000), false);
  assert.equal(clock.advance(30000), true);
  clock.configure({ enabled: false, minutes: 1 });
  assert.equal(clock.advance(1000000), false);
  const settings = clock.settings; settings.enabled = true;
  assert.equal(clock.settings.enabled, false);
});

test('co-op combines individual catches and ends the team run instead of declaring a surviving winner', () => {
  const g = new SnakeGame({ playerCount: 2, teamMode: true, random: () => 0 });
  g.food = g.nextHead(g.players[0]);
  g.extraFoods = [{ ...g.nextHead(g.players[1]), type: 'rabbit' }];
  assert.equal(g.tick(), 'ate');
  assert.equal(g.totalScore, 2);
  assert.deepEqual(g.players.map((player) => player.score), [1, 1]);
  g.obstacles = [{ ...g.nextHead(g.players[1]), type: 'wall' }];
  assert.equal(g.tick(), 'lost');
  assert.equal(g.winner, null);
  assert.equal(g.totalScore, 2);
  g.reset({ mode: 'maze' });
  assert.equal(g.isTeam, true);
  assert.equal(g.totalScore, 0);
});

test('filling a co-op board is a shared win, not an individual score contest', () => {
  const g = new SnakeGame({ columns: 6, rows: 6, playerCount: 2, teamMode: true, random: () => 0 });
  g.players[0].snake = [{ x: 4, y: 0 }];
  for (let y = 0; y < 6; y++) for (let x = 0; x < 6; x++) if (!(y === 0 && (x === 4 || x === 5)) && !(x === 0 && y === 5)) g.players[0].snake.push({ x, y });
  Object.assign(g.players[1], { snake: [{ x: 0, y: 5 }], direction: 'right', shieldUntil: 8000, score: 40 });
  g.food = { x: 5, y: 0 };
  assert.equal(g.tick(), 'won');
  assert.equal(g.endReason, 'filled');
  assert.equal(g.winner, null);
  assert.equal(g.totalScore, 41);
});

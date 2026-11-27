/* Optional real Firebase OAuth. No mock sessions, passwords or tokens in game storage. */
(function (root) {
  'use strict';
  const setupMessage = 'Google/Facebook sign-in needs OAuth configuration in auth-config.js. You can play without login now.';
  const clean = (value) => typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, 24) : '';
  function configured(config) {
    return ['apiKey', 'authDomain', 'projectId', 'appId'].every((key) => typeof config?.firebase?.[key] === 'string' && config.firebase[key].trim());
  }
  function errorMessage(error) {
    return ({
      'auth/popup-blocked': 'The sign-in popup was blocked. Allow popups and try again, or play without login.',
      'auth/popup-closed-by-user': 'Sign-in was cancelled. Try again or play without login.',
      'auth/cancelled-popup-request': 'Another sign-in request is already open.',
      'auth/unauthorized-domain': 'This website is not an authorized OAuth domain. Check the Firebase setup.',
      'auth/operation-not-allowed': 'This sign-in provider has not been enabled in Firebase Authentication.',
      'auth/account-exists-with-different-credential': 'This email already uses a different sign-in provider. Sign in with that provider.',
      'auth/network-request-failed': 'Sign-in could not connect. Check your connection, or play without login.',
    })[error?.code] || 'Sign-in is unavailable. Check the OAuth setup and your connection, or play without login.';
  }
  async function loadSdk() {
    const [app, auth] = await Promise.all([
      import('https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js'),
      import('https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js'),
    ]);
    return { ...app, ...auth };
  }
  function create({ config = {}, onChange = () => {}, loader = loadSdk } = {}) {
    let sdk, auth, initialization, busy = false;
    let current = null;
    let version = 0;
    const publish = (message = '') => onChange({ user: current, busy, configured: configured(config), message });
    async function observe(user) {
      const request = ++version;
      if (!user) { current = null; publish(); return; }
      let provider = user.providerData?.[0]?.providerId;
      try { provider = (await user.getIdTokenResult()).signInProvider || provider; } catch { /* Provider data remains available offline. */ }
      if (request !== version) return;
      const type = provider === 'facebook.com' ? 'facebook' : provider === 'google.com' ? 'google' : null;
      if (!type) { current = null; publish('Unsupported sign-in provider. Please choose Google, Facebook, or guest play.'); return; }
      current = { id: user.uid, provider: type, name: clean(user.displayName) || clean(user.email?.split('@')[0]) || (type === 'facebook' ? 'Facebook player' : 'Google player') };
      publish();
    }
    function initialize() {
      if (!configured(config)) { publish(setupMessage); return Promise.resolve(false); }
      if (!initialization) initialization = (async () => {
        sdk = await loader();
        const app = sdk.getApps().length ? sdk.getApp() : sdk.initializeApp(config.firebase);
        auth = sdk.getAuth(app);
        sdk.onAuthStateChanged(auth, (user) => { void observe(user); }, () => publish(errorMessage()));
        return true;
      })().catch((error) => { initialization = null; publish(errorMessage(error)); return false; });
      return initialization;
    }
    return Object.freeze({
      initialize,
      async signIn(provider) {
        if (!['google', 'facebook'].includes(provider) || busy) return false;
        if (!configured(config)) { publish(setupMessage); return false; }
        busy = true; publish();
        let message = '';
        try {
          if (!await initialize()) { message = 'Sign-in could not initialize. Check OAuth setup or play without login.'; return false; }
          const oauth = provider === 'facebook' ? new sdk.FacebookAuthProvider() : new sdk.GoogleAuthProvider();
          if (provider === 'google') oauth.setCustomParameters({ prompt: 'select_account' });
          const result = await sdk.signInWithPopup(auth, oauth);
          await observe(result.user);
          return true;
        } catch (error) { message = errorMessage(error); return false; }
        finally { busy = false; publish(message); }
      },
      async signOut() {
        if (busy) return false;
        if (!auth) { current = null; publish(); return true; }
        busy = true; publish();
        let message = '';
        try { await sdk.signOut(auth); await observe(null); return true; }
        catch (error) { message = errorMessage(error); return false; }
        finally { busy = false; publish(message); }
      },
    });
  }
  function inviteLink(config, location = '') {
    if (!/^\d{5,32}$/.test(config?.facebookAppId || '')) return null;
    let url;
    try { url = new URL(config.inviteUrl || location); } catch { return null; }
    if (url.protocol !== 'https:' || url.username || url.password || /^(localhost|127\.|0\.0\.0\.0|\[::1\])/.test(url.hostname)) return null;
    url.hash = '';
    url.search = '';
    const parameters = new URLSearchParams({ app_id: config.facebookAppId, display: 'popup', href: url.href, redirect_uri: url.href });
    return `https://www.facebook.com/dialog/share?${parameters}`;
  }
  const SnakeAuth = Object.freeze({ create, configured, errorMessage, inviteLink });
  if (typeof module !== 'undefined' && module.exports) module.exports = { SnakeAuth };
  else root.SnakeAuth = SnakeAuth;
})(typeof globalThis !== 'undefined' ? globalThis : this);

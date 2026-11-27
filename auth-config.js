/* Public client configuration only. Never put a Facebook app secret here.
 * See README.md for Firebase Authentication and Facebook sharing setup.
 * Guest play works without this configuration or a network connection.
 */
window.SNAKE_AUTH_CONFIG = Object.freeze({
  firebase: null, // { apiKey, authDomain, projectId, appId } from your Firebase web app.
  facebookAppId: '',
  inviteUrl: '', // Public HTTPS game URL, not localhost or a file:// URL.
});

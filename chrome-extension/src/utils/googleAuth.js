// Google Sign-In for the extension via chrome.identity.launchWebAuthFlow.
//
// We deliberately don't use chrome.identity.getAuthToken() — that flow needs
// an OAuth client of type "Chrome Extension" and only ever returns an access
// token. Our backend verifies a Google *ID token* (google-auth-library's
// verifyIdToken) against the same Web OAuth client used by the main web app,
// so we run the implicit flow ourselves and ask Google for an id_token.
//
// One-time setup in Google Cloud Console: add
// `https://<extension-id>.chromiumapp.org/` (chrome.identity.getRedirectURL())
// as an authorized redirect URI on the existing GOOGLE_CLIENT_ID OAuth client.

import { googleLogin } from './api.js';
import { syncLocalHistory } from '../background/uploader.js';
import { getApiUrl, setToken, setUser } from './storage.js';

let inflight = null;

function failMessage(message) {
  if (message && message.includes('Only one web auth flow')) {
    return 'A Google sign-in window is already open. Close it, then try again.';
  }
  return message || 'Google sign-in was cancelled';
}

export function signInWithGoogle(clientId) {
  if (inflight) return inflight;
  inflight = launch(clientId).finally(() => {
    inflight = null;
  });
  return inflight;
}

async function launch(clientId) {
  if (!clientId) throw new Error('Google Sign-In is not configured for this extension.');
  const apiUrl = await getApiUrl();
  const redirectUri = new URL(apiUrl || 'http://localhost:4000/api');
  redirectUri.pathname = '/api/auth/google/extension-callback';
  redirectUri.search = '';
  redirectUri.hash = '';
  const nonce = crypto.randomUUID();
  return new Promise((resolve, reject) => {

    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('response_type', 'id_token');
    authUrl.searchParams.set('redirect_uri', redirectUri.toString());
    authUrl.searchParams.set('scope', 'openid email profile');
    authUrl.searchParams.set('nonce', nonce);
    authUrl.searchParams.set('prompt', 'select_account');
    authUrl.searchParams.set('state', chrome.identity.getRedirectURL());

    chrome.identity.launchWebAuthFlow(
      { url: authUrl.toString(), interactive: true },
      (redirectedTo) => {
        if (chrome.runtime.lastError || !redirectedTo) {
          reject(new Error(failMessage(chrome.runtime.lastError?.message)));
          return;
        }
        const landed = new URL(redirectedTo);
        const idToken = landed.searchParams.get('id_token') || new URLSearchParams(landed.hash.slice(1)).get('id_token');
        if (!idToken) {
          reject(new Error('Google did not return an ID token'));
          return;
        }
        resolve(idToken);
      }
    );
  });
}

export function startGoogleAuth() {
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type !== 'doorway:googleSignIn') return;
    signInWithGoogle(import.meta.env.VITE_GOOGLE_CLIENT_ID)
      .then(async (idToken) => {
        const data = await googleLogin(idToken);
        const token = data.token || data.accessToken;
        await Promise.all([setToken(token), setUser(data.user)]);
        await syncLocalHistory();
        await chrome.storage.session.remove('doorway_authError');
        try { sendResponse({ token, user: data.user }); } catch { /* popup already closed */ }
      })
      .catch(async (err) => {
        const error = err.message || 'Google sign-in failed';
        await chrome.storage.session.set({ doorway_authError: error });
        try { sendResponse({ error }); } catch { /* popup already closed */ }
      });
    return true;
  });
}

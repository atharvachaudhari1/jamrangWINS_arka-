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

export function signInWithGoogle(clientId) {
  return new Promise((resolve, reject) => {
    if (!clientId) {
      reject(new Error('Google Sign-In is not configured for this extension.'));
      return;
    }

    const redirectUri = chrome.identity.getRedirectURL();
    const nonce = crypto.randomUUID();

    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('response_type', 'id_token');
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('scope', 'openid email profile');
    authUrl.searchParams.set('nonce', nonce);
    authUrl.searchParams.set('prompt', 'select_account');

    chrome.identity.launchWebAuthFlow(
      { url: authUrl.toString(), interactive: true },
      (redirectedTo) => {
        if (chrome.runtime.lastError || !redirectedTo) {
          reject(new Error(chrome.runtime.lastError?.message || 'Google sign-in was cancelled'));
          return;
        }
        const hash = new URL(redirectedTo).hash.slice(1);
        const idToken = new URLSearchParams(hash).get('id_token');
        if (!idToken) {
          reject(new Error('Google did not return an ID token'));
          return;
        }
        resolve(idToken);
      }
    );
  });
}

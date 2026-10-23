const axios = require('axios');

const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1';

/**
 * Fetch unread emails from Gmail and return them shaped as task candidates.
 * Uses the stored access token; callers must handle token refresh on 401.
 */
async function fetchTaskCandidates(accessToken, maxResults = 20) {
  // List recent unread message IDs
  const listRes = await axios.get(`${GMAIL_API}/users/me/messages`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    params: { q: 'is:unread', maxResults },
  });

  const messages = listRes.data.messages || [];

  const tasks = [];
  for (const { id } of messages.slice(0, 10)) {
    try {
      const msgRes = await axios.get(`${GMAIL_API}/users/me/messages/${id}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        params: { format: 'metadata', metadataHeaders: ['Subject', 'From', 'Date'] },
      });
      const headers = msgRes.data.payload?.headers || [];
      const subject = headers.find(h => h.name === 'Subject')?.value || '(no subject)';
      const from    = headers.find(h => h.name === 'From')?.value || '';
      const date    = headers.find(h => h.name === 'Date')?.value;

      tasks.push({
        title: `Email: ${subject}`,
        description: `From: ${from}`,
        dueAt: date ? new Date(date) : null,
        source: 'gmail',
        sourceId: id,
      });
    } catch {
      // skip malformed messages
    }
  }
  return tasks;
}

/**
 * Refresh a Google access token using the stored refresh token.
 */
async function refreshAccessToken(refreshToken) {
  const res = await axios.post('https://oauth2.googleapis.com/token', null, {
    params: {
      client_id:     process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type:    'refresh_token',
    },
  });
  return res.data.access_token;
}

module.exports = { fetchTaskCandidates, refreshAccessToken };

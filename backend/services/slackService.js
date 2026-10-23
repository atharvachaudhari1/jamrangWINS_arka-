const axios = require('axios');

const SLACK_API = 'https://slack.com/api';

/**
 * Exchange an OAuth code for a Slack access token.
 */
async function exchangeCode(code, redirectUri) {
  const res = await axios.post(`${SLACK_API}/oauth.v2.access`, null, {
    params: {
      client_id:     process.env.SLACK_CLIENT_ID,
      client_secret: process.env.SLACK_CLIENT_SECRET,
      code,
      redirect_uri:  redirectUri,
    },
  });
  if (!res.data.ok) throw new Error(res.data.error || 'Slack OAuth failed');
  return {
    accessToken: res.data.authed_user?.access_token || res.data.access_token,
    teamId:      res.data.team?.id,
    teamName:    res.data.team?.name,
    
  };
}

/**
 * Fetch recent starred/bookmarked messages or messages reacted with ✅ as task candidates.
 */
async function fetchTaskCandidates(accessToken, maxResults = 10) {
  // Use stars.list to get starred items (good proxy for "needs action")
  const res = await axios.get(`${SLACK_API}/stars.list`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    params: { count: maxResults },
  });

  if (!res.data.ok) return [];

  const items = res.data.items || [];
  return items
    .filter(item => item.type === 'message')
    .map(item => ({
      title:    `Slack: ${(item.message?.text || '').slice(0, 100)}`,
      source:   'slack',
      sourceId: item.message?.ts,
      dueAt:    null,
    }));
}

module.exports = { exchangeCode, fetchTaskCandidates };

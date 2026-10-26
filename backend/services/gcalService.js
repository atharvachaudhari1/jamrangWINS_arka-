const axios = require('axios');

const GCAL_API = 'https://www.googleapis.com/calendar/v3';

/**
 * Fetch upcoming Google Calendar events and shape them as deadline candidates.
 */
async function fetchDeadlineCandidates(accessToken, maxResults = 20) {
  const now = new Date().toISOString();
  const res = await axios.get(`${GCAL_API}/calendars/primary/events`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    params: {
      timeMin:    now,
      maxResults,
      singleEvents: true,
      orderBy:    'startTime',
    },
  });

  const items = res.data.items || [];
  return items.map((event) => ({
    title:    event.summary || 'Untitled event',
    dueAt:    event.start?.dateTime || event.start?.date || null,
    source:   'gcal',
    sourceId: event.id,
  }));
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

/**
 * Upcoming events for the timetable. These stay separate from Doorway tasks.
 */
async function fetchUpcomingEvents(accessToken, maxResults = 40) {
  const now = new Date();
  const until = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const res = await axios.get(`${GCAL_API}/calendars/primary/events`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    params: {
      timeMin: now.toISOString(),
      timeMax: until.toISOString(),
      maxResults,
      singleEvents: true,
      orderBy: 'startTime',
    },
  });

  return (res.data.items || []).map((event) => ({
    title: event.summary || 'Calendar event',
    start: event.start?.dateTime || event.start?.date || null,
    end: event.end?.dateTime || event.end?.date || null,
    allDay: !event.start?.dateTime,
    location: event.location || '',
    sourceId: event.id,
  }));
}

module.exports = { fetchDeadlineCandidates, fetchUpcomingEvents, refreshAccessToken };

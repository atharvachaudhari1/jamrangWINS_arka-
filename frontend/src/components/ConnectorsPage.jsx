import React, { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../services/api';

const CONNECTORS = [
  {
    id: 'gmail',
    label: 'Gmail',
    description: 'Import unread emails as tasks automatically',
    color: '#ea4335',
    urlEndpoint: '/integrations/google/url',
    syncEndpoint: '/integrations/gmail/sync',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22">
        <path d="M20 4H4C2.9 4 2 4.9 2 6v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 2-8 5-8-5h16zm0 12H4V8l8 5 8-5v10z" />
      </svg>
    ),
  },
  {
    id: 'gcal',
    label: 'Google Calendar',
    description: 'Sync upcoming events as deadlines',
    color: '#1a73e8',
    urlEndpoint: '/integrations/google/url',
    syncEndpoint: '/integrations/gcal/sync',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22">
        <path d="M19 3h-1V1h-2v2H8V1H6v2H5C3.9 3 3 3.9 3 5v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11zM7 10h5v5H7z" />
      </svg>
    ),
  },
  {
    id: 'slack',
    label: 'Slack',
    description: 'Turn starred Slack messages into tasks',
    color: '#611f69',
    urlEndpoint: '/integrations/slack/url',
    syncEndpoint: '/integrations/slack/sync',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22">
        <path d="M5.042 15.165a2.528 2.528 0 01-2.52 2.523A2.528 2.528 0 010 15.165a2.527 2.527 0 012.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 012.521-2.52 2.527 2.527 0 012.521 2.52v6.313A2.528 2.528 0 018.834 24a2.528 2.528 0 01-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 01-2.521-2.52A2.528 2.528 0 018.834 0a2.528 2.528 0 012.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 012.521 2.521 2.528 2.528 0 01-2.521 2.521H2.522A2.528 2.528 0 010 8.834a2.528 2.528 0 012.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 012.522-2.521A2.528 2.528 0 0124 8.834a2.528 2.528 0 01-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 01-2.523 2.521 2.527 2.527 0 01-2.52-2.521V2.522A2.527 2.527 0 0115.165 0a2.528 2.528 0 012.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 012.523 2.522A2.528 2.528 0 0115.165 24a2.527 2.527 0 01-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 01-2.52-2.523 2.526 2.526 0 012.52-2.52h6.313A2.527 2.527 0 0124 15.165a2.528 2.528 0 01-2.522 2.523h-6.313z" />
      </svg>
    ),
  },
];

function fmtDate(iso) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function ConnectorsPage() {
  const [status, setStatus] = useState(null);
  const [syncing, setSyncing] = useState({});
  const [connecting, setConnecting] = useState({});
  const [toast, setToast] = useState(null);
  const [searchParams, setSearchParams] = useSearchParams();

  const loadStatus = useCallback(async () => {
    try {
      const data = await api.get('/integrations/status');
      setStatus(data);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  // Handle redirect back from OAuth
  useEffect(() => {
    const connected = searchParams.get('connected');
    const error = searchParams.get('error');

    if (connected) {
      showToast(`${connected === 'google' ? 'Gmail & Google Calendar' : 'Slack'} connected!`, 'success');
      setSearchParams({});
      loadStatus();
    } else if (error) {
      showToast('Connection failed. Please try again.', 'error');
      setSearchParams({});
    }
  }, [searchParams, setSearchParams, loadStatus]);

  function showToast(message, type = 'success') {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }

  async function handleConnect(connector) {
    setConnecting(p => ({ ...p, [connector.id]: true }));
    try {
      const { url } = await api.get(connector.urlEndpoint);
      window.location.href = url;
    } catch {
      showToast('Connection unavailable. Please try again later.', 'error');
      setConnecting(p => ({ ...p, [connector.id]: false }));
    }
  }

  async function handleSync(connector) {
    setSyncing(p => ({ ...p, [connector.id]: true }));
    try {
      const result = await api.post(connector.syncEndpoint);
      showToast(`Synced ${result.synced} items, created ${result.created} new tasks.`, 'success');
      loadStatus();
    } catch (err) {
      const msg = err.response?.data?.error || 'Sync failed.';
      showToast(msg, 'error');
    } finally {
      setSyncing(p => ({ ...p, [connector.id]: false }));
    }
  }

  async function handleDisconnect(connector) {
    try {
      await api.delete(`/integrations/${connector.id}`);
      showToast(`${connector.label} disconnected.`, 'success');
      loadStatus();
    } catch {
      showToast('Failed to disconnect.', 'error');
    }
  }

  return (
    <div className="connectors-page">
      {toast && (
        <div className={`connectors-toast connectors-toast--${toast.type}`}>
          {toast.message}
        </div>
      )}

      <div className="page-header">
        <h1 className="page-title">Connectors</h1>
        <p className="page-subtitle">
          Link your tools to automatically pull emails, events, and messages as tasks.
        </p>
      </div>

      <div className="connectors-list">
        {CONNECTORS.map((connector) => {
          const s = status?.[connector.id];
          const isConnected = !!s?.connected;

          return (
            <div key={connector.id} className="connector-card">
              <div className="connector-card-icon" style={{ color: connector.color, background: connector.color + '18' }}>
                {connector.icon}
              </div>

              <div className="connector-card-body">
                <div className="connector-card-title">{connector.label}</div>
                <div className="connector-card-desc">{connector.description}</div>
                {isConnected && s.lastSyncedAt && (
                  <div className="connector-card-meta">Last synced {fmtDate(s.lastSyncedAt)}</div>
                )}
                {isConnected && !s.lastSyncedAt && (
                  <div className="connector-card-meta">Connected {fmtDate(s.connectedAt)} · Never synced</div>
                )}
              </div>

              <div className="connector-card-actions">
                {isConnected ? (
                  <>
                    <button
                      className="btn-connector btn-connector-sync"
                      onClick={() => handleSync(connector)}
                      disabled={syncing[connector.id]}
                    >
                      {syncing[connector.id] ? 'Syncing…' : 'Sync now'}
                    </button>
                    <button
                      className="btn-connector btn-connector-disconnect"
                      onClick={() => handleDisconnect(connector)}
                    >
                      Disconnect
                    </button>
                  </>
                ) : (
                  <button
                    className="btn-connector btn-connector-connect"
                    onClick={() => handleConnect(connector)}
                    disabled={connecting[connector.id]}
                    style={{ '--accent': connector.color }}
                  >
                    {connecting[connector.id] ? 'Redirecting…' : 'Connect'}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

    </div>
  );
}

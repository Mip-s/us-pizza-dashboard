import React, { useState, useEffect, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';
import logo from './logo.jpeg';
import './App.css';

// Initialize Supabase
const SUPABASE_URL = process.env.REACT_APP_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.REACT_APP_SUPABASE_ANON_KEY;
const VAPID_PUBLIC_KEY = process.env.REACT_APP_VAPID_PUBLIC_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Converts a base64url VAPID key into the Uint8Array format the Push API expects.
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

// Channel metadata: maps raw DB channel values to display labels/order
const CHANNEL_META = {
  pos: { label: 'POS', order: 1 },
  kds: { label: 'KDS', order: 2 },
  kiosk: { label: 'SOK', order: 3 },
  online: { label: 'ODS', order: 4 },
};
const CHANNEL_ORDER = ['pos', 'kds', 'kiosk', 'online'];

// Role display labels
const ROLE_LABELS = {
  operations_team: 'Operations Team',
  area_manager: 'Area Manager',
  outlet_manager: 'Outlet Manager',
};

// Login screen shown when there is no active session
const Login = ({ onLogin, loading, errorMessage }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    onLogin(email, password);
  };

  return (
    <div className="login-shell">
      <form className="login-card" onSubmit={handleSubmit}>
        <img src={logo} alt="US Pizza" className="login-logo" />
        <div className="eyebrow"><span className="live-dot" /> Live operations</div>
        <h1 className="login-title">US Pizza <span>Operations</span></h1>
        <p className="login-subtitle">Sign in with your admin or manager account.</p>

        {errorMessage && <div className="login-error">{errorMessage}</div>}

        <label className="login-label" htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          className="login-input"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="username"
          required
        />

        <label className="login-label" htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          className="login-input"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
        />

        <button type="submit" className="login-button" disabled={loading}>
          {loading ? 'Signing in...' : 'Sign in'}
        </button>
      </form>
    </div>
  );
};

// Toast notification component
const Toast = ({ message, type, onClose }) => {
  useEffect(() => {
    const timer = setTimeout(onClose, 6000);
    return () => clearTimeout(timer);
  }, [onClose]);

  const tone = {
    critical: 'toast-critical',
    high: 'toast-warning',
    resolved: 'toast-success',
    info: 'toast-info',
  }[type] || 'toast-info';

  return (
    <div
      className={`toast ${tone} animate-slide-in`}
      onClick={onClose}
      role="alert"
      title="Click to dismiss"
    >
      <span className="toast-dot" aria-hidden="true" />
      <span className="toast-text">{message}</span>
      <button
        type="button"
        className="toast-close"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        aria-label="Close notification"
      >
        ×
      </button>
    </div>
  );
};

// Main Dashboard Component (rendered once a session + profile are loaded)
function Dashboard({ session, profile, onLogout }) {
  const [outlets, setOutlets] = useState([]);
  const [channelRows, setChannelRows] = useState([]);
  const [expandedChannels, setExpandedChannels] = useState(() => new Set());
  const [toasts, setToasts] = useState([]);
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [loading, setLoading] = useState(true);
  const [pushSupported, setPushSupported] = useState(false);
  const [pushSubscribed, setPushSubscribed] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushError, setPushError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  // iOS only supports Web Push for a site installed via "Add to Home
  // Screen" (running standalone), not a regular Safari tab. Detect this
  // so we can show the right instructions instead of a silently-broken button.
  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  const needsIosInstall = isIos && !isStandalone;

  // Check whether this browser already has an active push subscription.
  useEffect(() => {
    const supported = 'serviceWorker' in navigator && 'PushManager' in window && !!VAPID_PUBLIC_KEY;
    setPushSupported(supported);
    if (!supported) return;

    navigator.serviceWorker.register('/sw.js').then(async (registration) => {
      const existing = await registration.pushManager.getSubscription();
      setPushSubscribed(!!existing);
    }).catch((err) => console.error('Service worker registration failed:', err));
  }, []);

  const handleEnablePush = async () => {
    if (needsIosInstall) {
      setPushError('On iPhone, tap Share → "Add to Home Screen" first, then open the app from your Home Screen to enable alerts.');
      return;
    }
    setPushBusy(true);
    setPushError('');
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setPushError('Notification permission was not granted.');
        setPushBusy(false);
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });

      const json = subscription.toJSON();
      const { error } = await supabase.from('push_subscriptions').upsert(
        {
          user_id: session.user.id,
          endpoint: json.endpoint,
          p256dh: json.keys.p256dh,
          auth: json.keys.auth,
        },
        { onConflict: 'endpoint' }
      );
      if (error) throw error;

      setPushSubscribed(true);
    } catch (err) {
      console.error('Failed to enable push notifications:', err);
      setPushError('Could not enable notifications. Please try again.');
    } finally {
      setPushBusy(false);
    }
  };

  const handleDisablePush = async () => {
    setPushBusy(true);
    setPushError('');
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await supabase.from('push_subscriptions').delete().eq('endpoint', subscription.endpoint);
        await subscription.unsubscribe();
      }
      setPushSubscribed(false);
    } catch (err) {
      console.error('Failed to disable push notifications:', err);
      setPushError('Could not disable notifications. Please try again.');
    } finally {
      setPushBusy(false);
    }
  };

  const fetchOutlets = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('outlet_alert_status')
        .select('*')
        .order('overall_status', { ascending: false });

      if (error) throw error;
      setOutlets(data || []);
    } catch (error) {
      console.error('Error fetching outlets:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchChannelStatus = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('outlet_status')
        .select('*');

      if (error) throw error;
      setChannelRows(data || []);
    } catch (error) {
      console.error('Error fetching channel status:', error);
    }
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([fetchOutlets(), fetchChannelStatus()]);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchOutlets();

    // Subscribe to real-time changes in outlet_alert_messages
    const subscription = supabase
      .channel('outlet_alerts')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'outlet_alert_messages' },
        (payload) => {
          const { outlet_id, overall_status, alert_message } = payload.new;

          // Determine toast type
          const toastType = overall_status === 'CRITICAL_DOWN' 
            ? 'critical' 
            : overall_status === 'DEGRADED' 
            ? 'high' 
            : 'resolved';

          // Add toast
          const toastId = Date.now();
          setToasts((prev) => [...prev, { id: toastId, message: alert_message, type: toastType }]);

          // Update outlet status
          setOutlets((prev) =>
            prev.map((o) =>
              o.outlet_id === outlet_id
                ? { ...o, overall_status, alert_message, last_alert_time: new Date().toISOString() }
                : o
            )
          );
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [fetchOutlets]);

  useEffect(() => {
    // Fetch initial per-channel status (POS / KDS / SOK / ODS) for every outlet
    fetchChannelStatus();

    // Keep channel status live: upsert on change, drop on delete
    const rowKey = (row) => `${row.outlet_id}|${row.channel}|${row.station}`;
    const channelSubscription = supabase
      .channel('outlet_status_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'outlet_status' },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            const deletedKey = rowKey(payload.old);
            setChannelRows((prev) => prev.filter((r) => rowKey(r) !== deletedKey));
            return;
          }

          const updatedRow = payload.new;
          const updatedKey = rowKey(updatedRow);
          setChannelRows((prev) => {
            const exists = prev.some((r) => rowKey(r) === updatedKey);
            return exists
              ? prev.map((r) => (rowKey(r) === updatedKey ? updatedRow : r))
              : [...prev, updatedRow];
          });
        }
      )
      .subscribe();

    return () => {
      channelSubscription.unsubscribe();
    };
  }, [fetchChannelStatus]);

  // Group channel status rows by outlet, then by channel (pos/kds/kiosk/online)
  const channelsByOutlet = channelRows.reduce((acc, row) => {
    if (!acc[row.outlet_id]) acc[row.outlet_id] = {};
    if (!acc[row.outlet_id][row.channel]) acc[row.outlet_id][row.channel] = [];
    acc[row.outlet_id][row.channel].push(row);
    return acc;
  }, {});

  const getChannelSummaries = (outletId) => {
    const channels = channelsByOutlet[outletId] || {};
    return CHANNEL_ORDER.map((key) => {
      const stations = (channels[key] || []).slice().sort((a, b) => a.station.localeCompare(b.station));
      // Only 'confirmed' counts as down. 'suspected' is an internal grace
      // period before confirmation and is intentionally treated the same
      // as 'normal' here so it never surfaces in the UI or notifications.
      const confirmedCount = stations.filter((s) => s.status === 'confirmed').length;
      return {
        key,
        label: CHANNEL_META[key].label,
        stations,
        downCount: confirmedCount,
        total: stations.length,
      };
    });
  };

  const toggleChannel = (outletId, channelKey) => {
    const key = `${outletId}:${channelKey}`;
    setExpandedChannels((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // Determine an outlet's effective status purely from live channel data:
  // any confirmed-down channel means the outlet is not healthy (falls back
  // to the DB-computed severity bucket for CRITICAL_DOWN vs DEGRADED),
  // otherwise it's HEALTHY. 'suspected' channels never affect this.
  const getEffectiveStatus = (outlet) => {
    const channelSummaries = getChannelSummaries(outlet.outlet_id);
    const hasChannelData = channelSummaries.some((c) => c.total > 0);
    if (!hasChannelData) return outlet.overall_status || 'HEALTHY';

    const totalConfirmed = channelSummaries.reduce((sum, c) => sum + c.downCount, 0);
    if (totalConfirmed === 0) return 'HEALTHY';
    return outlet.overall_status || 'CRITICAL_DOWN';
  };

  // Filter outlets by status (handle null overall_status)
  const filteredOutlets = filterStatus === 'ALL'
    ? outlets
    : outlets.filter((o) => getEffectiveStatus(o) === filterStatus);

  const statusStats = {
    CRITICAL_DOWN: outlets.filter((o) => getEffectiveStatus(o) === 'CRITICAL_DOWN').length,
    DEGRADED: outlets.filter((o) => getEffectiveStatus(o) === 'DEGRADED').length,
    HEALTHY: outlets.filter((o) => getEffectiveStatus(o) === 'HEALTHY').length,
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'CRITICAL_DOWN':
        return 'outlet-card outlet-critical';
      case 'DEGRADED':
        return 'outlet-card outlet-degraded';
      case 'HEALTHY':
        return 'outlet-card outlet-healthy';
      default:
        return 'outlet-card outlet-unknown';
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'CRITICAL_DOWN':
        return '🚨';
      case 'DEGRADED':
        return '⚠️';
      case 'HEALTHY':
        return '✅';
      default:
        return 'ℹ️';
    }
  };

  return (
    <div className="dashboard-shell">
      <div className="dashboard-container">
        {/* Header */}
        <header className="dashboard-header">
          <div className="header-brand">
            <img src={logo} alt="US Pizza" className="header-logo" />
            <div>
              <div className="eyebrow"><span className="live-dot" /> Live operations</div>
              <h1>US Pizza <span>Operations</span></h1>
              <p>Real-time visibility across every outlet in your network.</p>
            </div>
          </div>
          <div className="header-badge">
            <span className="header-badge-icon">◒</span>
            <div><strong>Monitoring active</strong><small>Updates automatically</small></div>
          </div>
          <button
            type="button"
            className="refresh-button"
            onClick={handleRefresh}
            disabled={refreshing}
            title="Refresh outlet and channel status now"
          >
            <span className={`refresh-icon ${refreshing ? 'spinning' : ''}`}>⟳</span>
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>
          {(pushSupported || needsIosInstall) && (
            <button
              type="button"
              className={`push-toggle ${pushSubscribed ? 'push-on' : ''}`}
              onClick={pushSubscribed ? handleDisablePush : handleEnablePush}
              disabled={pushBusy}
              title={needsIosInstall ? 'Add to Home Screen first (iOS requirement)' : (pushError || undefined)}
            >
              <span className="push-dot" />
              {pushBusy
                ? 'Working...'
                : pushSubscribed
                ? 'Alerts on'
                : needsIosInstall
                ? 'Enable alerts (install first)'
                : 'Enable alerts'}
            </button>
          )}
          <div className="user-badge">
            <div className="user-avatar">{(profile?.full_name || session?.user?.email || '?').charAt(0).toUpperCase()}</div>
            <div>
              <strong>{profile?.full_name || session?.user?.email}</strong>
              <small>{ROLE_LABELS[profile?.role] || 'Signed in'}</small>
            </div>
            <button type="button" className="logout-button" onClick={onLogout}>Sign out</button>
          </div>
        </header>
        {pushError && <div className="push-error">{pushError}</div>}

        <div className="section-heading">
          <div><span className="section-kicker">Network overview</span><h2>Today's health snapshot</h2></div>
          <span className="outlet-count">{outlets.length} outlets tracked</span>
        </div>

        {/* Status Summary Cards */}
        <div className="stats-grid">
          <div className="stat-card stat-critical">
            <div className="stat-icon">!</div>
            <div><strong>{statusStats.CRITICAL_DOWN}</strong><span>Critical outages</span></div>
            <div className="stat-arrow">↗</div>
          </div>
          <div className="stat-card stat-degraded">
            <div className="stat-icon">~</div>
            <div><strong>{statusStats.DEGRADED}</strong><span>Degraded service</span></div>
            <div className="stat-arrow">↗</div>
          </div>
          <div className="stat-card stat-healthy">
            <div className="stat-icon">✓</div>
            <div><strong>{statusStats.HEALTHY}</strong><span>Healthy outlets</span></div>
            <div className="stat-arrow">↗</div>
          </div>
        </div>

        {/* Filter Buttons */}
        <div className="filter-row">
          <span className="filter-label">Filter by status</span>
          <div className="filter-buttons">
          {['ALL', 'CRITICAL_DOWN', 'DEGRADED', 'HEALTHY'].map((status) => (
            <button
              key={status}
              onClick={() => setFilterStatus(status)}
              className={`filter-button ${
                filterStatus === status
                  ? 'filter-active'
                  : ''
              }`}
            >
              {status === 'ALL' ? 'All outlets' : status.replace('_', ' ')}
            </button>
          ))}
          </div>
        </div>

        {/* Toast Notifications */}
        <div className="toast-stack">
          {toasts.map((toast) => (
            <Toast
              key={toast.id}
              message={toast.message}
              type={toast.type}
              onClose={() => setToasts((prev) => prev.filter((t) => t.id !== toast.id))}
            />
          ))}
        </div>

        {/* Outlets Grid */}
        {loading ? (
          <div className="empty-state">
            <div className="loading-spinner" />
            <div>Loading outlets...</div>
          </div>
        ) : filteredOutlets.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">⌁</div>
            <strong>No outlets found</strong>
            <div>Try selecting a different status filter.</div>
          </div>
        ) : (
          <div className="outlets-grid">
            {filteredOutlets.map((outlet) => {
              const channelSummaries = getChannelSummaries(outlet.outlet_id);
              const totalDown = channelSummaries.reduce((sum, c) => sum + c.downCount, 0);
              const hasChannelData = channelSummaries.some((c) => c.total > 0);
              const allOperational = hasChannelData && totalDown === 0;
              const effectiveStatus = getEffectiveStatus(outlet);

              return (
              <div
                key={outlet.outlet_id}
                className={getStatusColor(effectiveStatus)}
              >
                {/* Header */}
                <div className="outlet-header">
                  <div>
                    <div className="outlet-title">
                      <span className="outlet-icon">{getStatusIcon(effectiveStatus)}</span>
                      <h3>{outlet.outlet_name || 'Unknown Outlet'}</h3>
                    </div>
                    <div className="outlet-status">
                      <span className="status-pulse" /> {effectiveStatus.replace('_', ' ')}
                    </div>
                  </div>
                  {(outlet.active_downtime_count || 0) > 0 && (
                    <div className="downtime-badge">
                      {outlet.active_downtime_count} down
                    </div>
                  )}
                </div>

                {/* Channel Breakdown: POS / KDS / SOK / ODS */}
                <div className="channel-grid">
                  {channelSummaries.map((channel) => {
                    const hasIssue = channel.downCount > 0;
                    const isEmpty = channel.total === 0;
                    const expandKey = `${outlet.outlet_id}:${channel.key}`;
                    const isExpanded = expandedChannels.has(expandKey);
                    return (
                      <div key={channel.key} className="channel-block">
                        <button
                          type="button"
                          className={`channel-chip ${
                            isEmpty ? 'channel-unknown' : hasIssue ? 'channel-down' : 'channel-ok'
                          }`}
                          onClick={() => !isEmpty && toggleChannel(outlet.outlet_id, channel.key)}
                          disabled={isEmpty}
                        >
                          <span className="channel-dot" />
                          <span className="channel-label">{channel.label}</span>
                          <span className="channel-meta">
                            {isEmpty
                              ? 'n/a'
                              : hasIssue
                              ? `${channel.downCount}/${channel.total} down`
                              : `${channel.total}/${channel.total} ok`}
                          </span>
                          {!isEmpty && <span className="channel-caret">{isExpanded ? '▲' : '▼'}</span>}
                        </button>
                        {isExpanded && !isEmpty && (
                          <div className="station-list">
                            {channel.stations.map((s) => {
                              // 'suspected' is an internal grace period before
                              // confirmation - treat it visually the same as
                              // 'normal' so it never shows as an issue.
                              const isDown = s.status === 'confirmed';
                              return (
                                <div key={s.station} className="station-row">
                                  <span className={`station-dot ${isDown ? 'station-down' : 'station-ok'}`} />
                                  <span className="station-name">{s.station}</span>
                                  <span className="station-status">{isDown ? 'confirmed' : 'normal'}</span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Alert Message: green "all operational" banner takes priority once every channel is healthy */}
                {allOperational ? (
                  <div className="alert-message alert-success">
                    <p>✅ All systems at {outlet.outlet_name || 'this outlet'} are operational</p>
                  </div>
                ) : (
                  outlet.alert_message && (
                    <div className="alert-message">
                      <p>{outlet.alert_message}</p>
                    </div>
                  )
                )}

                {/* Last Alert Time */}
                {outlet.last_alert_time && (
                  <div className="last-update">
                    <span>Last update</span>{new Date(outlet.last_alert_time).toLocaleString()}
                  </div>
                )}
              </div>
              );
            })}
          </div>
        )}
      </div>

      <style>{`
        @keyframes slide-in {
          from {
            transform: translateX(400px);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
        .animate-slide-in {
          animation: slide-in 0.3s ease-out;
        }
      `}</style>
    </div>
  );
}

// Top-level App: manages the auth session and the signed-in user's profile/role,
// showing the Login screen until both are available.
export default function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState('');

  // Fetch the signed-in user's role (and outlet assignments, if any) from the DB.
  const loadProfile = async (userId) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('role, full_name')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      console.error('Error loading profile:', error);
      return null;
    }
    return data;
  };

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session);
      if (session?.user) {
        setProfile(await loadProfile(session.user.id));
      }
      setAuthLoading(false);
    });

    const { data: authListener } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      setSession(newSession);
      if (newSession?.user) {
        setProfile(await loadProfile(newSession.user.id));
      } else {
        setProfile(null);
      }
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  const handleLogin = async (email, password) => {
    setLoginLoading(true);
    setLoginError('');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setLoginError(error.message);
    }
    setLoginLoading(false);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  if (authLoading) {
    return (
      <div className="dashboard-shell">
        <div className="empty-state" style={{ marginTop: 80 }}>
          <div className="loading-spinner" />
          <div>Checking session...</div>
        </div>
      </div>
    );
  }

  if (!session) {
    return <Login onLogin={handleLogin} loading={loginLoading} errorMessage={loginError} />;
  }

  if (!profile) {
    return (
      <div className="dashboard-shell">
        <div className="empty-state" style={{ marginTop: 80 }}>
          <div className="loading-spinner" />
          <div>Loading your access profile...</div>
        </div>
      </div>
    );
  }

  return <Dashboard session={session} profile={profile} onLogout={handleLogout} />;
}

import React, { useState, useEffect, useCallback, useRef } from 'react';
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
// ODS = order display screen (TV); Food Delivery = Grab / foodpanda / ShopeeFood
const CHANNEL_META = {
  pos: { label: 'POS', order: 1 },
  kds: { label: 'KDS', order: 2 },
  kiosk: { label: 'SOK', order: 3 },
  ods: { label: 'ODS', order: 4 },
  delivery: { label: 'Food Delivery', order: 5 },
};
const CHANNEL_ORDER = ['pos', 'kds', 'kiosk', 'ods', 'delivery'];

// Pull-to-refresh: how far (px, after resistance) to drag before releasing refreshes
const PULL_THRESHOLD = 70;

// Friendly names for stations that aren't device IDs
const STATION_LABELS = { grab: 'GrabFood', foodpanda: 'foodpanda', shopee: 'ShopeeFood' };

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
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [pushSupported, setPushSupported] = useState(false);
  const [pushSubscribed, setPushSubscribed] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushError, setPushError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [statusError, setStatusError] = useState('');

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
      // A subscription made with a different (old) VAPID key can't receive alerts:
      // treat it as "not subscribed" so the button offers to re-enable.
      let matchesKey = !!existing;
      try {
        const current = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
        const used = existing?.options?.applicationServerKey
          ? new Uint8Array(existing.options.applicationServerKey)
          : null;
        if (used) matchesKey = used.length === current.length && used.every((b, i) => b === current[i]);
      } catch {
        /* older browsers don't expose options — assume it matches */
      }
      setPushSubscribed(!!existing && matchesKey);
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
      // If this browser still has a subscription made with an older VAPID key
      // (e.g. after rotating keys), the browser refuses to re-subscribe with the
      // new key — remove the old one first (from the browser and from Supabase).
      const existing = await registration.pushManager.getSubscription();
      if (existing) {
        await supabase.from('push_subscriptions').delete().eq('endpoint', existing.endpoint);
        await existing.unsubscribe();
      }
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

  // Live status comes from the dashboard's own API (/api/status, Cloudflare D1),
  // which only returns the outlets this user is allowed to see.
  const lastAlertIdRef = useRef(0);
  const failCountRef = useRef(0); // only show the banner after 2 failed refreshes in a row

  const fetchStatus = useCallback(async () => {
    try {
      const { data: { session: current } } = await supabase.auth.getSession();
      if (!current) return;
      const since = lastAlertIdRef.current;
      const res = await fetch(`/api/status${since ? `?since=${since}` : ''}`, {
        headers: { Authorization: `Bearer ${current.access_token}` },
        cache: 'no-store',
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      failCountRef.current = 0;
      setStatusError('');

      const order = { CRITICAL_DOWN: 0, DEGRADED: 1, HEALTHY: 2, UNMONITORED: 3 };
      const sorted = (data.outlets || [])
        .slice()
        .sort((a, b) => (order[a.overall_status] ?? 9) - (order[b.overall_status] ?? 9) || a.code.localeCompare(b.code));
      setOutlets(sorted);
      setChannelRows(sorted.flatMap((o) => o.stations.map((s) => ({ ...s, outlet_id: o.outlet_id }))));

      // Toasts for alerts raised since the previous poll (not on first load)
      if (since && data.alerts?.length) {
        setToasts((prev) => [
          ...prev,
          ...data.alerts.map((a) => ({
            id: `alert-${a.id}`,
            message: a.message,
            type: a.overall_status === 'CRITICAL_DOWN' ? 'critical' : a.overall_status === 'DEGRADED' ? 'high' : 'resolved',
          })),
        ]);
      }
      lastAlertIdRef.current = data.last_alert_id || since;
    } catch (error) {
      console.error('Error fetching status:', error);
      failCountRef.current += 1;
      if (failCountRef.current < 2) return; // ignore a single blip; keep showing the last good data
      setStatusError(
        error instanceof TypeError || /404|Unexpected token/.test(String(error.message))
          ? 'Live status service is not reachable. (Running locally? Start the Worker with "npx wrangler dev" too.)'
          : `Could not load live status: ${error.message}`
      );
    } finally {
      setLoading(false);
    }
  }, []);

  // New-version check: an open page (especially the installed phone app, which is
  // rarely closed) keeps running the old code after a deploy. Compare the script this
  // page loaded with the latest build's asset-manifest.json.
  const [updateReady, setUpdateReady] = useState(false);
  const checkForUpdate = useCallback(async () => {
    if (process.env.NODE_ENV !== 'production') return false;
    try {
      const current = document.querySelector('script[src*="/static/js/main."]')?.getAttribute('src');
      if (!current) return false;
      const res = await fetch('/asset-manifest.json', { cache: 'no-store' });
      if (!res.ok) return false;
      const latest = (await res.json())?.files?.['main.js'];
      const isNew = Boolean(latest && latest !== current);
      if (isNew) setUpdateReady(true);
      return isNew;
    } catch {
      return false;
    }
  }, []);

  useEffect(() => {
    checkForUpdate();
    const timer = setInterval(checkForUpdate, 2 * 60 * 1000);
    // Coming back to the app (e.g. reopening it from the phone's app switcher):
    // if a new version is out, load it straight away - nobody is mid-task.
    const onVisible = async () => {
      if (document.visibilityState === 'visible' && (await checkForUpdate())) window.location.reload();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [checkForUpdate]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      // Pull-to-refresh / Refresh button also picks up a new dashboard version
      if (await checkForUpdate()) {
        window.location.reload();
        return;
      }
      await fetchStatus();
    } finally {
      setRefreshing(false);
    }
  };

  // Pull-to-refresh for phones: at the very top of the page, drag down past the
  // threshold and let go. Works in the installed (home screen) app too, where the
  // browser's own pull-to-refresh isn't available.
  const [pullDistance, setPullDistance] = useState(0);
  const pullRef = useRef({ startY: null, distance: 0 });
  const refreshRef = useRef(handleRefresh);
  refreshRef.current = handleRefresh;

  useEffect(() => {
    const onStart = (e) => {
      // only when already scrolled to the top, and with a single finger
      pullRef.current.startY = window.scrollY <= 0 && e.touches.length === 1 ? e.touches[0].clientY : null;
      pullRef.current.distance = 0;
    };
    const onMove = (e) => {
      if (pullRef.current.startY === null) return;
      const dy = e.touches[0].clientY - pullRef.current.startY;
      if (dy <= 0 || window.scrollY > 0) {
        pullRef.current.distance = 0;
        setPullDistance(0);
        return;
      }
      const distance = Math.min(dy * 0.5, 110); // resistance, like native pull-to-refresh
      pullRef.current.distance = distance;
      setPullDistance(distance);
      if (e.cancelable) e.preventDefault(); // stop the page from bouncing while pulling
    };
    const onEnd = () => {
      if (pullRef.current.startY === null) return;
      const pulledEnough = pullRef.current.distance >= PULL_THRESHOLD;
      pullRef.current = { startY: null, distance: 0 };
      setPullDistance(0);
      if (pulledEnough) refreshRef.current();
    };
    window.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onEnd);
    window.addEventListener('touchcancel', onEnd);
    return () => {
      window.removeEventListener('touchstart', onStart);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
      window.removeEventListener('touchcancel', onEnd);
    };
  }, []);

  // Poll every 15 seconds (and immediately when the tab becomes visible again)
  useEffect(() => {
    fetchStatus();
    const timer = setInterval(fetchStatus, 15000);
    const onVisible = () => document.visibilityState === 'visible' && fetchStatus();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [fetchStatus]);

  // Group channel status rows by outlet, then by channel (pos/kds/kiosk/ods/delivery)
  const channelsByOutlet = channelRows.reduce((acc, row) => {
    if (!acc[row.outlet_id]) acc[row.outlet_id] = {};
    if (!acc[row.outlet_id][row.channel]) acc[row.outlet_id][row.channel] = [];
    acc[row.outlet_id][row.channel].push(row);
    return acc;
  }, {});

  const getChannelSummaries = (outletId) => {
    const channels = channelsByOutlet[outletId] || {};
    // Only show channels this outlet actually has (e.g. most outlets have no SOK / ODS)
    return CHANNEL_ORDER.filter((key) => (channels[key] || []).length > 0).map((key) => {
      const stations = (channels[key] || []).slice().sort((a, b) => a.station.localeCompare(b.station));
      // Only 'confirmed' counts as down. 'suspected' is an internal grace
      // period before confirmation and is intentionally treated the same
      // as 'normal' here so it never surfaces in the UI or notifications.
      const confirmedCount = stations.filter((s) => s.status === 'confirmed').length;
      // 'unknown' = no heartbeat has ever reported this station (not monitored yet)
      const monitored = stations.filter((s) => s.status !== 'unknown').length;
      // 'stale' = checked by the POS, but the POS hasn't reported for a while (no recent data)
      const staleCount = stations.filter((s) => s.status === 'stale').length;
      return {
        key,
        label: CHANNEL_META[key].label,
        stations,
        downCount: confirmedCount,
        total: stations.length,
        monitored,
        staleCount,
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

  // Status is computed server-side (/api/status) from live station states:
  // CRITICAL_DOWN | DEGRADED | HEALTHY | UNMONITORED (no heartbeat received yet).
  const getEffectiveStatus = (outlet) => outlet.overall_status || 'UNMONITORED';

  // Filter outlets by status (handle null overall_status)
  // Status filter + free-text search on outlet name / code / region
  const query = searchQuery.trim().toLowerCase();
  const filteredOutlets = outlets.filter((o) => {
    if (filterStatus !== 'ALL' && getEffectiveStatus(o) !== filterStatus) return false;
    if (!query) return true;
    return [o.outlet_name, o.code, o.region].some((v) => String(v || '').toLowerCase().includes(query));
  });

  const statusStats = {
    CRITICAL_DOWN: outlets.filter((o) => getEffectiveStatus(o) === 'CRITICAL_DOWN').length,
    DEGRADED: outlets.filter((o) => getEffectiveStatus(o) === 'DEGRADED').length,
    HEALTHY: outlets.filter((o) => getEffectiveStatus(o) === 'HEALTHY').length,
    UNMONITORED: outlets.filter((o) => getEffectiveStatus(o) === 'UNMONITORED').length,
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

  const pullVisible = pullDistance > 0 || refreshing;
  return (
    <div className="dashboard-shell">
      <div
        className={`pull-indicator ${pullVisible ? 'pull-visible' : ''} ${refreshing ? 'pull-refreshing' : ''}`}
        style={pullDistance > 0 ? { transform: `translate(-50%, ${pullDistance}px)`, transition: 'none' } : undefined}
        aria-hidden="true"
      >
        <span
          className="pull-arrow"
          style={{ transform: `rotate(${refreshing ? 0 : Math.min(pullDistance / PULL_THRESHOLD, 1) * 180}deg)` }}
        >
          {refreshing ? '' : '↓'}
        </span>
        <span className="pull-text">
          {refreshing ? 'Refreshing…' : pullDistance >= PULL_THRESHOLD ? 'Release to refresh' : 'Pull to refresh'}
        </span>
      </div>
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
        {statusError && <div className="push-error">{statusError}</div>}
        {updateReady && (
          <div className="update-banner">
            <span>A new version of the dashboard is available.</span>
            <button type="button" onClick={() => window.location.reload()}>Update now</button>
          </div>
        )}

        <div className="section-heading">
          <div><span className="section-kicker">Network overview</span><h2>Today's health snapshot</h2></div>
          <span className="outlet-count">
            {outlets.length - statusStats.UNMONITORED} of {outlets.length} outlets monitored
          </span>
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
        <div className="search-row">
          <input
            type="search"
            className="search-input"
            placeholder="Search outlets by name, code or area…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Search outlets"
          />
          {query && (
            <span className="search-count">
              {filteredOutlets.length} match{filteredOutlets.length === 1 ? '' : 'es'}
            </span>
          )}
        </div>
        <div className="filter-row">
          <span className="filter-label">Filter by status</span>
          <div className="filter-buttons">
          {['ALL', 'CRITICAL_DOWN', 'DEGRADED', 'HEALTHY', 'UNMONITORED'].map((status) => (
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
            <div>{query ? `Nothing matches "${searchQuery.trim()}". Try another name or clear the search.` : 'Try selecting a different status filter.'}</div>
          </div>
        ) : (
          <div className="outlets-grid">
            {filteredOutlets.map((outlet) => {
              const channelSummaries = getChannelSummaries(outlet.outlet_id);
              const totalDown = channelSummaries.reduce((sum, c) => sum + c.downCount, 0);
              const effectiveStatus = getEffectiveStatus(outlet);
              const allOperational = effectiveStatus === 'HEALTHY' && totalDown === 0;

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

                {/* Channel Breakdown: POS / KDS / SOK / ODS / Food Delivery */}
                <div className="channel-grid">
                  {channelSummaries.map((channel) => {
                    const hasIssue = channel.downCount > 0;
                    const isEmpty = channel.total === 0;
                    const notMonitored = !isEmpty && channel.monitored === 0;
                    const noRecentData = !isEmpty && !notMonitored && !hasIssue && channel.staleCount === channel.monitored;
                    const expandKey = `${outlet.outlet_id}:${channel.key}`;
                    const isExpanded = expandedChannels.has(expandKey);
                    return (
                      <div key={channel.key} className="channel-block">
                        <button
                          type="button"
                          className={`channel-chip ${
                            isEmpty || notMonitored || noRecentData ? 'channel-unknown' : hasIssue ? 'channel-down' : 'channel-ok'
                          }`}
                          onClick={() => !isEmpty && toggleChannel(outlet.outlet_id, channel.key)}
                          disabled={isEmpty}
                        >
                          <span className="channel-dot" />
                          <span className="channel-label">{channel.label}</span>
                          <span className="channel-meta">
                            {isEmpty
                              ? 'n/a'
                              : notMonitored
                              ? 'not monitored'
                              : hasIssue
                              ? `${channel.downCount}/${channel.total} down`
                              : noRecentData
                              ? 'no recent data'
                              : `${channel.total - channel.staleCount}/${channel.total} ok`}
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
                              const isUnknown = s.status === 'unknown' || s.status === 'stale';
                              return (
                                <div key={s.station} className="station-row">
                                  <span className={`station-dot ${isDown ? 'station-down' : isUnknown ? 'station-unknown' : 'station-ok'}`} />
                                  <span className="station-name">{STATION_LABELS[s.station] || s.station}</span>
                                  <span className="station-status">
                                    {isDown ? 'down' : s.status === 'stale' ? 'no recent data' : isUnknown ? 'not monitored' : 'normal'}
                                    {s.last_seen_at && (
                                      <small className="station-seen"> · seen {new Date(s.last_seen_at).toLocaleTimeString()}</small>
                                    )}
                                  </span>
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

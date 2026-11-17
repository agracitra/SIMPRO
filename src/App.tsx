import {useCallback, useEffect, useState} from 'react';
import {Layout, type NavKey} from './components/Layout.tsx';
import {useLiveLocations} from './hooks/useLiveLocations.ts';
import {useOnlineStatus} from './hooks/useOnlineStatus.ts';
import {useSyncQueue} from './hooks/useSyncQueue.ts';
import {AgendaPage} from './pages/AgendaPage.tsx';
import {DashboardPage} from './pages/DashboardPage.tsx';
import {HistoryPage} from './pages/HistoryPage.tsx';
import {InputAgendaPage} from './pages/InputAgendaPage.tsx';
import {LiveMapPage} from './pages/LiveMapPage.tsx';
import {LoginPage} from './pages/LoginPage.tsx';
import {NotificationsPage} from './pages/NotificationsPage.tsx';
import {ReportsPage} from './pages/ReportsPage.tsx';
import {SettingsAdminPage} from './pages/SettingsAdminPage.tsx';
import {StatusUpdatePage} from './pages/StatusUpdatePage.tsx';
import {UsersAdminPage} from './pages/UsersAdminPage.tsx';
import {authService} from './services/authService.ts';
import {dataService} from './services/dataService.ts';
import {
  DEFAULT_STATUS_OPTIONS,
  type AgendaHistoryItem,
  type AgendaItem,
  type AppSettings,
  type LeaderCode,
  type LeaderUpdateItem,
  type NotificationItem,
  type SystemModeInfo,
  type UserProfile,
} from './types/simpro.ts';

const FALLBACK_SETTINGS: AppSettings = {
  viewer_enabled: false,
  stale_threshold_minutes: 60,
  bupati_display_name: 'Bupati',
  wakil_bupati_display_name: 'Wakil Bupati',
  status_options: DEFAULT_STATUS_OPTIONS,
};

export default function App() {
  const {isOnline, simulatedOffline, setSimulatedOffline} = useOnlineStatus();

  const [booting, setBooting] = useState(true);
  const [systemMode, setSystemMode] = useState<SystemModeInfo | null>(null);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [activeNav, setActiveNav] = useState<NavKey>('dashboard');
  const [preselectedLeader, setPreselectedLeader] = useState<LeaderCode | undefined>(undefined);

  const [settings, setSettings] = useState<AppSettings>(FALLBACK_SETTINGS);
  const [agendas, setAgendas] = useState<AgendaItem[]>([]);
  const [agendaHistories, setAgendaHistories] = useState<AgendaHistoryItem[]>([]);
  const [updates, setUpdates] = useState<LeaderUpdateItem[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [fromCache, setFromCache] = useState(false);
  const [mapsQuotaExceeded, setMapsQuotaExceeded] = useState(false);

  const {
    liveLocations,
    wsConnected,
    lastSyncedAt,
    assignedLeader,
    isBroadcasting,
    broadcastError,
    setBroadcastMeta,
    startBroadcasting,
    stopBroadcasting,
    refreshLiveLocations,
  } = useLiveLocations(user, isOnline);

  useEffect(() => {
    const onQuotaExceeded = () => setMapsQuotaExceeded(true);
    window.addEventListener('gmp-quota-exceeded', onQuotaExceeded);
    return () => window.removeEventListener('gmp-quota-exceeded', onQuotaExceeded);
  }, []);

  const loadOperationalData = useCallback(async () => {
    if (!user) return;
    try {
      const [loadedSettings, agendaRes, updateRes, notifList] = await Promise.all([
        dataService.fetchSettings(isOnline),
        dataService.fetchAgendas(isOnline),
        dataService.fetchLeaderUpdates(isOnline),
        dataService.fetchNotifications(isOnline),
      ]);
      if (loadedSettings) setSettings(loadedSettings);
      setAgendas(agendaRes.items);
      setUpdates(updateRes.items);
      setNotifications(notifList);
      setFromCache(agendaRes.fromCache || updateRes.fromCache);

      if (isOnline) {
        const histories = await dataService.fetchAgendaHistories().catch(() => []);
        setAgendaHistories(histories);
      }
    } catch {
      // Tetap gunakan snapshot terakhir yang ada di state bila permintaan gagal
    }
  }, [user, isOnline]);

  const {queue, unsyncedCount, isSyncing, reloadQueue, runSync} = useSyncQueue(
    isOnline,
    user?.id ?? null,
    loadOperationalData
  );

  // Boot session & system mode
  useEffect(() => {
    let active = true;
    async function init() {
      const [modeInfo, sessionUser] = await Promise.all([
        authService.getSystemMode(),
        authService.getSession(isOnline),
      ]);
      if (!active) return;
      setSystemMode(modeInfo);
      setUser(sessionUser);
      setBooting(false);
    }
    init();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (user) {
      loadOperationalData();
    }
  }, [user, loadOperationalData]);

  const handleLoginSuccess = (loggedInUser: UserProfile) => {
    setUser(loggedInUser);
    setActiveNav('dashboard');
  };

  const handleLogout = async () => {
    await stopBroadcasting();
    await authService.logout();
    setUser(null);
    setAgendas([]);
    setUpdates([]);
    setNotifications([]);
    setActiveNav('dashboard');
  };

  if (booting) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-600">
        Memuat SIMPRO...
      </div>
    );
  }

  if (!user) {
    return <LoginPage systemMode={systemMode} onLoginSuccess={handleLoginSuccess} />;
  }

  const unreadNotificationsCount = notifications.filter((n) => n.status === 'unread').length;

  return (
    <>
      {mapsQuotaExceeded && (
        <div className="bg-amber-50 border-b border-amber-200 text-amber-900 px-4 py-2.5 text-xs md:text-sm text-center sticky top-0 z-50 shadow-sm">
          <span>
            Google Maps Platform quota reached. If you are the app owner, visit{' '}
            <a
              href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-semibold text-amber-950 hover:text-amber-800"
            >
              maps developer site
            </a>{' '}
            for instructions to update your account.
          </span>
        </div>
      )}

      <Layout
        user={user}
        activeNav={activeNav}
        onSelectNav={(nav) => {
          if ((nav === 'users' || nav === 'settings') && user.role !== 'admin') return;
          setActiveNav(nav);
        }}
        onLogout={handleLogout}
        isOnline={isOnline}
        simulatedOffline={simulatedOffline}
        onToggleSimulatedOffline={() => setSimulatedOffline((v) => !v)}
        unsyncedCount={unsyncedCount}
        unreadNotificationsCount={unreadNotificationsCount}
        isSyncing={isSyncing}
        onManualSync={runSync}
        systemMode={systemMode}
      >
        {activeNav === 'dashboard' && (
          <DashboardPage
            user={user}
            agendas={agendas}
            updates={updates}
            liveLocations={liveLocations}
            wsConnected={wsConnected}
            lastSyncedAt={lastSyncedAt}
            assignedLeader={assignedLeader}
            isBroadcasting={isBroadcasting}
            broadcastError={broadcastError}
            settings={settings}
            isOnline={isOnline}
            unsyncedCount={unsyncedCount}
            fromCache={fromCache}
            onNavigateToUpdate={(leaderCode) => {
              setPreselectedLeader(leaderCode);
              setActiveNav('updates');
            }}
            onRefresh={() => {
              loadOperationalData();
              refreshLiveLocations();
            }}
            onStartBroadcasting={() => startBroadcasting()}
            onStopBroadcasting={stopBroadcasting}
            onRefreshLocations={refreshLiveLocations}
          />
        )}

        {activeNav === 'map' && (
          <LiveMapPage
            user={user}
            settings={settings}
            liveLocations={liveLocations}
            updates={updates}
            wsConnected={wsConnected}
            isOnline={isOnline}
            lastSyncedAt={lastSyncedAt}
            assignedLeader={assignedLeader}
            isBroadcasting={isBroadcasting}
            broadcastError={broadcastError}
            onStartBroadcasting={() => startBroadcasting()}
            onStopBroadcasting={stopBroadcasting}
            onRefreshLocations={refreshLiveLocations}
          />
        )}

        {activeNav === 'agenda' && (
          <AgendaPage
            user={user}
            agendas={agendas}
            settings={settings}
            isOnline={isOnline}
            onAgendasChanged={loadOperationalData}
          />
        )}

        {activeNav === 'input_agenda' && (
          <InputAgendaPage
            user={user}
            agendas={agendas}
            settings={settings}
            isOnline={isOnline}
            onAgendasChanged={loadOperationalData}
          />
        )}

        {activeNav === 'updates' && (
          <StatusUpdatePage
            user={user}
            settings={settings}
            isOnline={isOnline}
            preselectedLeader={preselectedLeader}
            queue={queue}
            isSyncing={isSyncing}
            wsConnected={wsConnected}
            isBroadcasting={isBroadcasting}
            broadcastError={broadcastError}
            onStartBroadcasting={startBroadcasting}
            onStopBroadcasting={stopBroadcasting}
            onUpdateBroadcastMeta={setBroadcastMeta}
            onQueueUpdated={reloadQueue}
            onManualSync={runSync}
            onServerSynced={() => {
              loadOperationalData();
              refreshLiveLocations();
            }}
          />
        )}

        {activeNav === 'history' && (
          <HistoryPage updates={updates} agendaHistories={agendaHistories} settings={settings} />
        )}

      {activeNav === 'notifications' && (
        <NotificationsPage
          notifications={notifications}
          isOnline={isOnline}
          onChanged={loadOperationalData}
        />
      )}

      {activeNav === 'reports' && (
        <ReportsPage
          user={user}
          agendas={agendas}
          updates={updates}
          agendaHistories={agendaHistories}
          settings={settings}
          isOnline={isOnline}
        />
      )}

      {activeNav === 'users' && user.role === 'admin' && (
        <UsersAdminPage currentUser={user} isOnline={isOnline} />
      )}

        {activeNav === 'settings' && user.role === 'admin' && (
          <SettingsAdminPage
            settings={settings}
            systemMode={systemMode}
            isOnline={isOnline}
            onSettingsUpdated={(next) => {
              setSettings(next);
              loadOperationalData();
            }}
          />
        )}
      </Layout>
    </>
  );
}

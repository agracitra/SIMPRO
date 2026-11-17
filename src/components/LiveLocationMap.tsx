import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  APIProvider,
  APILoadingStatus,
  AdvancedMarker,
  InfoWindow,
  Map as GoogleMap,
  Pin,
  useAdvancedMarkerRef,
  useApiLoadingStatus,
  useMap,
  useMapsLibrary,
} from '@vis.gl/react-google-maps';
import {
  Car,
  Compass,
  Crosshair,
  ExternalLink,
  Layers,
  LocateFixed,
  MapPin,
  Navigation,
  Radio,
  RefreshCw,
  Square,
  WifiOff,
} from 'lucide-react';
import {formatDateTimeId} from '../lib/formatters.ts';
import type {
  AppSettings,
  LeaderCode,
  LeaderUpdateItem,
  LiveLocationRecord,
  UserProfile,
} from '../types/simpro.ts';

const MAPS_API_KEY = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined) || '';

// Titik tengah awal (Pendopo Kabupaten Sidoarjo) saat koordinat belum diterima
const DEFAULT_CENTER = {lat: -7.4478, lng: 112.7183};

interface LiveLocationMapProps {
  user: UserProfile;
  settings: AppSettings;
  liveLocations: LiveLocationRecord[];
  latestUpdates: Partial<Record<LeaderCode, LeaderUpdateItem | null>>;
  wsConnected: boolean;
  isOnline: boolean;
  lastSyncedAt: string | null;
  assignedLeader: LeaderCode | null;
  isBroadcasting: boolean;
  broadcastError: string | null;
  onStartBroadcasting: () => void;
  onStopBroadcasting: () => void;
  onRefreshLocations: () => void;
  compact?: boolean;
}

interface TrafficOverlayProps {
  enabled: boolean;
}

const TrafficOverlay: React.FC<TrafficOverlayProps> = ({enabled}) => {
  const map = useMap();
  const mapsLib = useMapsLibrary('maps');
  const layerRef = useRef<{setMap: (target: ReturnType<typeof useMap>) => void} | null>(null);

  useEffect(() => {
    if (!map || !mapsLib) return;
    const layer = layerRef.current ?? new mapsLib.TrafficLayer();
    layerRef.current = layer;
    layer.setMap(enabled ? map : null);
    return () => {
      layer.setMap(null);
    };
  }, [map, mapsLib, enabled]);

  return null;
};

interface CameraControllerProps {
  focusRequest: {
    nonce: number;
    mode: 'all' | 'bupati' | 'wakil_bupati' | 'me';
  };
  autoFollow: boolean;
  locations: LiveLocationRecord[];
  myPosition: {lat: number; lng: number} | null;
}

const CameraController: React.FC<CameraControllerProps> = ({
  focusRequest,
  autoFollow,
  locations,
  myPosition,
}) => {
  const map = useMap();
  const coreLib = useMapsLibrary('core');
  const initialFittedRef = useRef(false);

  const applyCamera = useCallback(
    (mode: 'all' | 'bupati' | 'wakil_bupati' | 'me') => {
      if (!map) return;

      if (mode === 'me' && myPosition) {
        map.panTo(myPosition);
        map.setZoom(16);
        return;
      }

      if (mode === 'bupati' || mode === 'wakil_bupati') {
        const target = locations.find((l) => l.leader === mode);
        if (target) {
          map.panTo({lat: target.latitude, lng: target.longitude});
          map.setZoom(16);
        }
        return;
      }

      // Mode 'all'
      if (locations.length === 1) {
        map.panTo({lat: locations[0].latitude, lng: locations[0].longitude});
        map.setZoom(15);
      } else if (locations.length >= 2 && coreLib) {
        const bounds = new coreLib.LatLngBounds();
        for (const loc of locations) {
          bounds.extend({lat: loc.latitude, lng: loc.longitude});
        }
        if (myPosition) {
          bounds.extend(myPosition);
        }
        map.fitBounds(bounds, 72);
      }
    },
    [map, coreLib, locations, myPosition]
  );

  // Fit bounds saat pertama kali data lokasi & coreLib siap
  useEffect(() => {
    if (!map || !coreLib || initialFittedRef.current || locations.length === 0) return;
    initialFittedRef.current = true;
    applyCamera('all');
  }, [map, coreLib, locations.length, applyCamera]);

  // Eksekusi permintaan fokus manual dari tombol kontrol
  useEffect(() => {
    if (focusRequest.nonce === 0) return;
    applyCamera(focusRequest.mode);
  }, [focusRequest, applyCamera]);

  // Sinkronisasi kamera otomatis saat koordinat live bergerak jika mode Ikuti Otomatis aktif
  useEffect(() => {
    if (!autoFollow || !map || locations.length === 0) return;
    const streaming = locations.filter((l) => l.is_live_streaming);
    if (streaming.length === 1) {
      map.panTo({lat: streaming[0].latitude, lng: streaming[0].longitude});
    } else if (streaming.length >= 2 && coreLib) {
      const bounds = new coreLib.LatLngBounds();
      for (const s of streaming) {
        bounds.extend({lat: s.latitude, lng: s.longitude});
      }
      map.fitBounds(bounds, 72);
    }
  }, [autoFollow, map, coreLib, locations]);

  return null;
};

interface LeaderMarkerProps {
  record: LiveLocationRecord;
  displayName: string;
  latestUpdate: LeaderUpdateItem | null | undefined;
  isSelected: boolean;
  onSelect: () => void;
  onClose: () => void;
}

const LeaderMarker: React.FC<LeaderMarkerProps> = ({
  record,
  displayName,
  latestUpdate,
  isSelected,
  onSelect,
  onClose,
}) => {
  const [markerRef, marker] = useAdvancedMarkerRef();
  const isBupati = record.leader === 'bupati';
  const pinColor = isBupati ? '#0F294A' : '#0F766E';
  const borderColor = isBupati ? '#07172C' : '#115E59';
  const glyphLabel = isBupati ? 'B' : 'WB';

  const statusText = latestUpdate?.status || record.status || 'Terpantau';
  const locationLabel =
    latestUpdate?.location_text || record.location_text || 'Koordinat GPS Perangkat';
  const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${record.latitude},${record.longitude}`;
  const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${record.latitude},${record.longitude}`;

  return (
    <>
      <AdvancedMarker
        ref={markerRef}
        position={{lat: record.latitude, lng: record.longitude}}
        title={`${displayName} — ${locationLabel}`}
        zIndex={isSelected ? 1000 : record.is_live_streaming ? 500 : 100}
        onClick={onSelect}
      >
        <div className="flex flex-col items-center">
          <div
            className={`mb-1 flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-bold text-white shadow-md whitespace-nowrap ${
              isBupati ? 'bg-[#0F294A]' : 'bg-teal-700'
            }`}
          >
            {record.is_live_streaming && (
              <span className="inline-block h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            )}
            <span>{displayName}</span>
          </div>
          <Pin
            background={pinColor}
            borderColor={borderColor}
            glyphColor="#FFFFFF"
            glyphText={glyphLabel}
            scale={1.1}
          />
        </div>
      </AdvancedMarker>

      {isSelected && marker && (
        <InfoWindow anchor={marker} onCloseClick={onClose} maxWidth={300}>
          <div className="p-1 text-slate-900">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                {isBupati && (
                  <div className="h-10 w-8 shrink-0 overflow-hidden rounded-md border border-sky-200 bg-gradient-to-b from-sky-50 to-white">
                    <img
                      src="/assets/aistudio/Wakil_Bupati_Sidoarjo_Subandi_18547112.png"
                      alt={`Foto ${displayName}`}
                      className="h-full w-full object-cover object-top"
                    />
                  </div>
                )}
                <span className="text-sm font-bold text-[#0F294A]">{displayName}</span>
              </div>
              <span
                className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                  record.is_live_streaming
                    ? 'bg-emerald-100 text-emerald-900'
                    : record.is_test_seed
                      ? 'bg-amber-100 text-amber-900'
                      : 'bg-slate-100 text-slate-800'
                }`}
              >
                {record.is_live_streaming
                  ? 'LIVE GPS'
                  : record.is_test_seed
                    ? 'Titik Uji'
                    : 'Koordinat Terakhir'}
              </span>
            </div>

            <div className="mt-1.5 text-xs font-semibold text-slate-800">{statusText}</div>
            <div className="mt-0.5 text-xs text-slate-600">{locationLabel}</div>

            <div className="mt-2 space-y-0.5 border-t border-slate-100 pt-1.5 text-[11px] text-slate-600 tabular-nums">
              <div className="font-mono text-slate-800">
                {record.latitude.toFixed(6)}, {record.longitude.toFixed(6)}
              </div>
              <div className="flex flex-wrap gap-x-3">
                {record.accuracy_m !== null && (
                  <span>Akurasi: ±{Math.round(record.accuracy_m)} m</span>
                )}
                {record.speed_mps !== null && record.speed_mps > 0 && (
                  <span>Kecepatan: {Math.round(record.speed_mps * 3.6)} km/j</span>
                )}
              </div>
              <div>
                Diperbarui: {formatDateTimeId(record.updated_at)}
                {record.updated_by_name ? ` · ${record.updated_by_name}` : ''}
              </div>
            </div>

            <div className="mt-2.5 flex items-center gap-2 border-t border-slate-100 pt-2">
              <a
                href={googleMapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded bg-[#0F294A] px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-[#163B6B]"
              >
                <ExternalLink className="h-3 w-3" />
                Google Maps
              </a>
              <a
                href={directionsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
              >
                <Navigation className="h-3 w-3" />
                Rute
              </a>
            </div>
          </div>
        </InfoWindow>
      )}
    </>
  );
};

interface MapViewportBodyProps {
  compact?: boolean;
  mapTypeId: 'roadmap' | 'hybrid';
  showTraffic: boolean;
  autoFollow: boolean;
  focusRequest: {nonce: number; mode: 'all' | 'bupati' | 'wakil_bupati' | 'me'};
  liveLocations: LiveLocationRecord[];
  latestUpdates: Partial<Record<LeaderCode, LeaderUpdateItem | null>>;
  settings: AppSettings;
  myPosition: {lat: number; lng: number; accuracy: number | null} | null;
  selectedLeader: LeaderCode | null;
  onSelectLeader: (leader: LeaderCode | null) => void;
}

const MapViewportBody: React.FC<MapViewportBodyProps> = ({
  compact,
  mapTypeId,
  showTraffic,
  autoFollow,
  focusRequest,
  liveLocations,
  latestUpdates,
  settings,
  myPosition,
  selectedLeader,
  onSelectLeader,
}) => {
  const apiStatus = useApiLoadingStatus();

  if (apiStatus === APILoadingStatus.FAILED || apiStatus === APILoadingStatus.AUTH_FAILURE) {
    return (
      <div className="flex h-full flex-col items-center justify-center bg-slate-100 px-6 text-center">
        <MapPin className="h-8 w-8 text-amber-600" aria-hidden="true" />
        <p className="mt-2 text-sm font-semibold text-slate-900">
          Peta Google Maps tidak dapat dimuat saat ini
        </p>
        <p className="mt-1 max-w-md text-xs text-slate-600">
          Periksa koneksi internet, kuota Google Maps Platform, atau konfigurasi API key. Anda tetap
          dapat membuka koordinat pimpinan langsung melalui tautan Google Maps pada daftar di bawah.
        </p>
      </div>
    );
  }

  return (
    <div className={`relative w-full ${compact ? 'h-[400px]' : 'h-[520px]'}`}>
      <GoogleMap
        mapId="DEMO_MAP_ID"
        defaultCenter={DEFAULT_CENTER}
        defaultZoom={14}
        mapTypeId={mapTypeId}
        gestureHandling="greedy"
        streetViewControl={false}
        fullscreenControl={true}
        mapTypeControl={false}
        internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
        style={{width: '100%', height: '100%'}}
      >
        <TrafficOverlay enabled={showTraffic} />
        <CameraController
          focusRequest={focusRequest}
          autoFollow={autoFollow}
          locations={liveLocations}
          myPosition={myPosition ? {lat: myPosition.lat, lng: myPosition.lng} : null}
        />

        {liveLocations.map((rec) => (
          <LeaderMarker
            key={rec.leader}
            record={rec}
            displayName={
              rec.leader === 'bupati'
                ? settings.bupati_display_name
                : settings.wakil_bupati_display_name
            }
            latestUpdate={latestUpdates[rec.leader]}
            isSelected={selectedLeader === rec.leader}
            onSelect={() => onSelectLeader(rec.leader)}
            onClose={() => onSelectLeader(null)}
          />
        ))}

        {myPosition && (
          <AdvancedMarker
            position={{lat: myPosition.lat, lng: myPosition.lng}}
            title="Lokasi Perangkat Anda Saat Ini"
            zIndex={50}
          >
            <div className="flex flex-col items-center">
              <div className="mb-1 rounded bg-sky-700 px-1.5 py-0.5 text-[10px] font-semibold text-white shadow">
                Lokasi Anda
              </div>
              <div className="h-4 w-4 rounded-full border-2 border-white bg-sky-600 shadow-md" />
            </div>
          </AdvancedMarker>
        )}
      </GoogleMap>
    </div>
  );
};

export const LiveLocationMap: React.FC<LiveLocationMapProps> = ({
  settings,
  liveLocations,
  latestUpdates,
  wsConnected,
  isOnline,
  lastSyncedAt,
  assignedLeader,
  isBroadcasting,
  broadcastError,
  onStartBroadcasting,
  onStopBroadcasting,
  onRefreshLocations,
  compact = false,
}) => {
  const [mapTypeId, setMapTypeId] = useState<'roadmap' | 'hybrid'>('roadmap');
  const [showTraffic, setShowTraffic] = useState(true);
  const [autoFollow, setAutoFollow] = useState(false);
  const [selectedLeader, setSelectedLeader] = useState<LeaderCode | null>(null);
  const [focusRequest, setFocusRequest] = useState<{
    nonce: number;
    mode: 'all' | 'bupati' | 'wakil_bupati' | 'me';
  }>({nonce: 0, mode: 'all'});

  // Lokasi perangkat pengguna (opt-in manual untuk referensi petugas lapangan)
  const [myPosition, setMyPosition] = useState<{
    lat: number;
    lng: number;
    accuracy: number | null;
  } | null>(null);
  const [myPosError, setMyPosError] = useState<string | null>(null);
  const [locatingMe, setLocatingMe] = useState(false);

  const bupatiLoc = useMemo(
    () => liveLocations.find((l) => l.leader === 'bupati') || null,
    [liveLocations]
  );
  const wabupLoc = useMemo(
    () => liveLocations.find((l) => l.leader === 'wakil_bupati') || null,
    [liveLocations]
  );

  const triggerFocus = (mode: 'all' | 'bupati' | 'wakil_bupati' | 'me') => {
    setFocusRequest((prev) => ({nonce: prev.nonce + 1, mode}));
    if (mode === 'bupati' || mode === 'wakil_bupati') {
      setSelectedLeader(mode);
    }
  };

  const handleToggleMyLocation = () => {
    setMyPosError(null);
    if (myPosition) {
      setMyPosition(null);
      return;
    }
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      setMyPosError('Peramban tidak mendukung Geolocation.');
      return;
    }
    setLocatingMe(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocatingMe(false);
        const next = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: Number.isFinite(pos.coords.accuracy) ? pos.coords.accuracy : null,
        };
        setMyPosition(next);
        setFocusRequest((prev) => ({nonce: prev.nonce + 1, mode: 'me'}));
      },
      () => {
        setLocatingMe(false);
        setMyPosError('Izin lokasi perangkat ditolak atau sinyal GPS tidak tersedia.');
      },
      {enableHighAccuracy: true, timeout: 12000, maximumAge: 10000}
    );
  };

  const renderLeaderSummaryCard = (leader: LeaderCode, record: LiveLocationRecord | null) => {
    const label =
      leader === 'bupati' ? settings.bupati_display_name : settings.wakil_bupati_display_name;
    const latest = latestUpdates[leader];
    const hasAccess = Boolean(record);

    const isBupati = leader === 'bupati';

    return (
      <div
        key={leader}
        className={`flex flex-col justify-between rounded-xl border p-4 shadow-xs ${
          isBupati
            ? 'border-sky-200 bg-gradient-to-br from-sky-50/80 to-white'
            : 'border-teal-200 bg-gradient-to-br from-teal-50/80 to-white'
        }`}
      >
        <div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              {isBupati && (
                <div className="h-12 w-10 shrink-0 overflow-hidden rounded-lg border border-sky-200 bg-gradient-to-b from-sky-50 to-white shadow-xs">
                  <img
                    src="/assets/aistudio/Wakil_Bupati_Sidoarjo_Subandi_18547112.png"
                    alt={`Foto ${label}`}
                    className="h-full w-full object-cover object-top"
                  />
                </div>
              )}
              <span
                className={`inline-block h-2.5 w-2.5 rounded-full ${
                  record?.is_live_streaming
                    ? 'bg-emerald-500 animate-pulse'
                    : isBupati
                      ? 'bg-sky-600'
                      : 'bg-teal-600'
                }`}
              />
              <h4 className={`text-sm font-bold ${isBupati ? 'text-[#0F294A]' : 'text-teal-900'}`}>
                {label}
              </h4>
            </div>

            {record ? (
              <span
                className={`rounded px-2 py-0.5 text-[11px] font-semibold ${
                  record.is_live_streaming
                    ? 'bg-emerald-100 text-emerald-900'
                    : record.is_test_seed
                      ? 'bg-amber-100 text-amber-900'
                      : 'bg-slate-200 text-slate-800'
                }`}
              >
                {record.is_live_streaming
                  ? 'Live Location Aktif'
                  : record.is_test_seed
                    ? 'Titik Uji Awal'
                    : 'Koordinat Terakhir'}
              </span>
            ) : (
              <span className="rounded bg-slate-200 px-2 py-0.5 text-[11px] font-medium text-slate-700">
                Terbatas / Belum Tersedia
              </span>
            )}
          </div>

          {hasAccess && record ? (
            <div className="mt-2.5 space-y-1 text-xs text-slate-700">
              <div className="font-semibold text-slate-900">
                {latest?.status || record.status || 'Terpantau'}
              </div>
              <div className="text-slate-600">{latest?.location_text || record.location_text}</div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 pt-1 font-mono text-[11px] text-slate-700 tabular-nums">
                <span>
                  {record.latitude.toFixed(5)}, {record.longitude.toFixed(5)}
                </span>
                {record.accuracy_m !== null && (
                  <span>Akurasi ±{Math.round(record.accuracy_m)} m</span>
                )}
              </div>
              <div className="text-[11px] text-slate-500 tabular-nums">
                Sinkron: {formatDateTimeId(record.updated_at)}
                {record.updated_by_name ? ` · ${record.updated_by_name}` : ''}
              </div>
            </div>
          ) : (
            <p className="mt-2 text-xs text-slate-500">
              Koordinat tidak tersedia atau belum disetujui untuk ditampilkan pada peran Anda.
            </p>
          )}
        </div>

        {hasAccess && record && (
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-200/70 pt-2.5">
            <button
              type="button"
              onClick={() => triggerFocus(leader)}
              className={`inline-flex items-center gap-1 rounded-lg border bg-white px-2.5 py-1.5 text-xs font-semibold hover:bg-slate-50 ${
                isBupati ? 'border-sky-300 text-[#0F294A]' : 'border-teal-300 text-teal-900'
              }`}
            >
              <Crosshair className="h-3.5 w-3.5" />
              Fokus di Peta
            </button>
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${record.latitude},${record.longitude}`}
              target="_blank"
              rel="noopener noreferrer"
              className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-white hover:brightness-110 ${
                isBupati
                  ? 'bg-gradient-to-r from-[#0F294A] to-[#0284C7]'
                  : 'bg-gradient-to-r from-[#0F766E] to-[#14B8A6]'
              }`}
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Buka Google Maps
            </a>
          </div>
        )}
      </div>
    );
  };

  return (
    <section
      aria-label="Peta Sinkronisasi Google Maps Live Location"
      className="overflow-hidden rounded-xl border border-sky-200 bg-white shadow-xs"
    >
      {/* Header Peta & Status Sinkronisasi */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-gradient-to-r from-[#0F294A] via-[#15457A] to-[#0E7490] px-5 py-4 text-white">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-bold tracking-tight text-white">
              Peta Pergerakan & Live Location (Google Maps)
            </h3>
            <span
              className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-semibold ${
                !isOnline
                  ? 'border-rose-300 bg-rose-100 text-rose-950'
                  : wsConnected
                    ? 'border-emerald-300 bg-emerald-100 text-emerald-950'
                    : 'border-amber-300 bg-amber-100 text-amber-950'
              }`}
            >
              {isOnline ? (
                <Radio
                  className={`h-3 w-3 ${wsConnected ? 'text-emerald-700 animate-pulse' : 'text-amber-700'}`}
                />
              ) : (
                <WifiOff className="h-3 w-3 text-rose-700" />
              )}
              <span>
                {!isOnline
                  ? 'Mode Offline (Cache Terakhir)'
                  : wsConnected
                    ? 'Tersinkron Live (WebSocket)'
                    : 'Menghubungkan Live Sync...'}
              </span>
            </span>
          </div>
          <p className="mt-0.5 text-xs text-sky-100">
            Menampilkan posisi terakhir dan siaran GPS langsung dari Ajudan yang mengaktifkan
            berbagi lokasi.{lastSyncedAt ? ` Terakhir disinkron: ${formatDateTimeId(lastSyncedAt)}.` : ''}
          </p>
        </div>

        {/* Kontrol Ajudan untuk Live Location */}
        <div className="flex flex-wrap items-center gap-2">
          {assignedLeader && (
            <>
              {isBroadcasting ? (
                <button
                  type="button"
                  onClick={onStopBroadcasting}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3.5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-rose-700 whitespace-nowrap"
                >
                  <Square className="h-3.5 w-3.5 fill-current" />
                  Hentikan Live Location{' '}
                  {assignedLeader === 'bupati'
                    ? settings.bupati_display_name
                    : settings.wakil_bupati_display_name}
                </button>
              ) : (
                <button
                  type="button"
                  disabled={!isOnline}
                  onClick={onStartBroadcasting}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3.5 py-2 text-xs font-semibold text-slate-950 shadow-xs hover:bg-emerald-400 disabled:opacity-50 whitespace-nowrap"
                >
                  <Radio className="h-3.5 w-3.5" />
                  Aktifkan Live Location{' '}
                  {assignedLeader === 'bupati'
                    ? settings.bupati_display_name
                    : settings.wakil_bupati_display_name}
                </button>
              )}
            </>
          )}

          <button
            type="button"
            disabled={!isOnline}
            onClick={onRefreshLocations}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/25 bg-white/15 px-3 py-2 text-xs font-semibold text-white hover:bg-white/25 disabled:opacity-50"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Sinkronkan
          </button>
        </div>
      </div>

      {/* Pesan Error GPS / Live Broadcast */}
      {(broadcastError || myPosError) && (
        <div className="border-b border-amber-200 bg-amber-50 px-5 py-2.5 text-xs text-amber-950">
          {broadcastError || myPosError}
        </div>
      )}

      {/* Toolbar Peta */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-sky-100 bg-gradient-to-r from-sky-50/70 via-white to-teal-50/70 px-5 py-2.5 text-xs">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => triggerFocus('all')}
            className="inline-flex items-center gap-1 rounded-md border border-indigo-200 bg-indigo-50/70 px-2.5 py-1 font-semibold text-indigo-900 hover:bg-indigo-100"
          >
            <Compass className="h-3.5 w-3.5 text-indigo-700" />
            Lihat Semua
          </button>
          {bupatiLoc && (
            <button
              type="button"
              onClick={() => triggerFocus('bupati')}
              className="inline-flex items-center gap-1 rounded-md border border-sky-200 bg-sky-50/80 px-2.5 py-1 font-semibold text-[#0F294A] hover:bg-sky-100"
            >
              <MapPin className="h-3.5 w-3.5 text-sky-700" />
              {settings.bupati_display_name}
            </button>
          )}
          {wabupLoc && (
            <button
              type="button"
              onClick={() => triggerFocus('wakil_bupati')}
              className="inline-flex items-center gap-1 rounded-md border border-teal-200 bg-teal-50/80 px-2.5 py-1 font-semibold text-teal-900 hover:bg-teal-100"
            >
              <MapPin className="h-3.5 w-3.5 text-teal-700" />
              {settings.wakil_bupati_display_name}
            </button>
          )}
          <button
            type="button"
            disabled={locatingMe}
            onClick={handleToggleMyLocation}
            className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1 font-semibold ${
              myPosition
                ? 'border-sky-400 bg-sky-100 text-sky-950'
                : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
            }`}
          >
            <LocateFixed className="h-3.5 w-3.5" />
            {locatingMe ? 'Mencari...' : myPosition ? 'Sembunyikan Lokasi Saya' : 'Lokasi Saya'}
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setAutoFollow((v) => !v)}
            className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1 font-semibold ${
              autoFollow
                ? 'border-emerald-300 bg-emerald-100 text-emerald-950'
                : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
            }`}
          >
            <Navigation className="h-3.5 w-3.5" />
            Ikuti Otomatis: {autoFollow ? 'Aktif' : 'Nonaktif'}
          </button>

          <button
            type="button"
            onClick={() => setShowTraffic((v) => !v)}
            className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1 font-semibold ${
              showTraffic
                ? 'border-amber-300 bg-amber-100 text-amber-950'
                : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
            }`}
          >
            <Car className="h-3.5 w-3.5" />
            Lalu Lintas
          </button>

          <button
            type="button"
            onClick={() => setMapTypeId((prev) => (prev === 'roadmap' ? 'hybrid' : 'roadmap'))}
            className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1 font-semibold ${
              mapTypeId === 'hybrid'
                ? 'border-violet-300 bg-violet-100 text-violet-950'
                : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
            }`}
          >
            <Layers className="h-3.5 w-3.5" />
            {mapTypeId === 'roadmap' ? 'Tampilan Satelit' : 'Tampilan Peta'}
          </button>
        </div>
      </div>

      {/* Kanvas Google Maps */}
      {!isOnline ? (
        <div
          className={`flex flex-col items-center justify-center bg-slate-100 px-6 text-center ${
            compact ? 'h-[260px]' : 'h-[340px]'
          }`}
        >
          <WifiOff className="h-8 w-8 text-slate-500" aria-hidden="true" />
          <p className="mt-2 text-sm font-semibold text-slate-900">
            Peta Google Maps Memerlukan Koneksi Internet
          </p>
          <p className="mt-1 max-w-md text-xs text-slate-600">
            Perangkat sedang dalam mode offline. Data koordinat tersimpan terakhir tetap dapat
            dilihat pada kartu ringkasan di bawah.
          </p>
        </div>
      ) : !MAPS_API_KEY ? (
        <div
          className={`flex flex-col items-center justify-center bg-slate-100 px-6 text-center ${
            compact ? 'h-[260px]' : 'h-[340px]'
          }`}
        >
          <MapPin className="h-8 w-8 text-amber-600" aria-hidden="true" />
          <p className="mt-2 text-sm font-semibold text-slate-900">
            Kunci API Google Maps Belum Terdeteksi di Runtime Browser
          </p>
          <p className="mt-1 max-w-lg text-xs text-slate-600">
            Pastikan <code className="font-mono">VITE_GOOGLE_MAPS_API_KEY</code> aktif pada
            environment aplikasi. Sinkronisasi WebSocket live location tetap berjalan dan dapat
            dibuka langsung lewat tautan Google Maps di bawah.
          </p>
        </div>
      ) : (
        <APIProvider apiKey={MAPS_API_KEY} libraries={['marker']} language="id" region="ID">
          <MapViewportBody
            compact={compact}
            mapTypeId={mapTypeId}
            showTraffic={showTraffic}
            autoFollow={autoFollow}
            focusRequest={focusRequest}
            liveLocations={liveLocations}
            latestUpdates={latestUpdates}
            settings={settings}
            myPosition={myPosition}
            selectedLeader={selectedLeader}
            onSelectLeader={setSelectedLeader}
          />
        </APIProvider>
      )}

      {/* Ringkasan Koordinat Kedua Pimpinan */}
      <div className="grid grid-cols-1 gap-4 border-t border-slate-200 p-5 md:grid-cols-2">
        {renderLeaderSummaryCard('bupati', bupatiLoc)}
        {renderLeaderSummaryCard('wakil_bupati', wabupLoc)}
      </div>

      <div className="border-t border-slate-100 bg-slate-50 px-5 py-2 text-[11px] text-slate-500">
        Peta interaktif dan lapisan lalu lintas menggunakan Google Maps Platform serta tunduk pada{' '}
        <a
          href="https://maps.google.com/help/terms_maps/?utm_campaign=gmp_mcp_codeassist_v1_aistudio"
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-slate-700"
        >
          Ketentuan Layanan Google Maps
        </a>
        . Siaran live location hanya aktif atas persetujuan eksplisit Ajudan dan dapat dihentikan
        kapan saja.
      </div>
    </section>
  );
};

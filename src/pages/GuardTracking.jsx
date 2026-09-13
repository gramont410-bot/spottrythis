import React, { useEffect, useMemo, useState } from 'react';
import Layout from '../components/Layout';
import { useSpot } from '../context/SpotContext';
import { db, hasFirebaseConfig } from '../lib/firebase';
import {
  collection,
  onSnapshot,
  query,
  where
} from 'firebase/firestore';
import {
  MapContainer,
  Marker,
  Polyline,
  Popup,
  TileLayer,
  useMap
} from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  Activity,
  AlertTriangle,
  Battery,
  Clock,
  MapPin,
  Radio,
  ShieldCheck,
  Zap
} from 'lucide-react';


const createLiveGuardMarker = (name, isTracking) => {
  const initial =
    String(name || 'G')
      .trim()
      .charAt(0)
      .toUpperCase() || 'G';

  const dotColor =
    isTracking
      ? '#34d399'
      : '#64748b';

  return L.divIcon({
    className: 'live-guard-marker',
    html: `
      <div style="
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 42px;
        height: 42px;
        border-radius: 9999px;
        background: #2563eb;
        border: 3px solid #ffffff;
        color: #ffffff;
        font-weight: 800;
        font-size: 12px;
        box-shadow: 0 8px 24px rgba(37, 99, 235, 0.45);
      ">
        ${initial}
        <span style="
          position: absolute;
          top: -2px;
          right: -2px;
          width: 12px;
          height: 12px;
          border-radius: 9999px;
          background: ${dotColor};
          border: 2px solid #0f172a;
        "></span>
      </div>
    `,
    iconSize: [42, 42],
    iconAnchor: [21, 21],
    popupAnchor: [0, -24]
  });
};


function LiveMapRecenter({ lat, lng }) {
  const map = useMap();

  useEffect(() => {
    if (
      Number.isFinite(lat) &&
      Number.isFinite(lng)
    ) {
      map.setView(
        [lat, lng],
        map.getZoom(),
        {
          animate: true
        }
      );
    }
  }, [lat, lng, map]);

  return null;
}


function toDate(value) {
  if (!value) return null;

  if (
    value instanceof Date &&
    !Number.isNaN(value.getTime())
  ) {
    return value;
  }

  if (typeof value?.toDate === 'function') {
    const converted = value.toDate();
    return Number.isNaN(converted.getTime())
      ? null
      : converted;
  }

  if (typeof value?.seconds === 'number') {
    const converted =
      new Date(value.seconds * 1000);

    return Number.isNaN(
      converted.getTime()
    )
      ? null
      : converted;
  }

  const converted =
    new Date(value);

  return Number.isNaN(
    converted.getTime()
  )
    ? null
    : converted;
}


function normalizePatrolStatus(value) {
  const raw =
    String(value || '')
      .trim()
      .toUpperCase()
      .replace(/[\s-]+/g, '_');

  if (
    [
      'IN_PROGRESS',
      'ACTIVE',
      'ON_PATROL'
    ].includes(raw)
  ) {
    return 'In Progress';
  }

  if (
    [
      'COMPLETED',
      'COMPLETE'
    ].includes(raw)
  ) {
    return 'Completed';
  }

  if (raw === 'LATE') {
    return 'Late';
  }

  if (raw === 'MISSED') {
    return 'Missed';
  }

  if (
    [
      'SCHEDULED',
      'PENDING'
    ].includes(raw)
  ) {
    return 'Scheduled';
  }

  return value || 'Idle';
}


function getPatrolSortTime(patrol) {
  return (
    toDate(patrol?.startedAt)?.getTime() ||
    toDate(patrol?.completedAt)?.getTime() ||
    toDate(patrol?.scheduledAt)?.getTime() ||
    0
  );
}


function getHistoryPointTime(point) {
  return (
    toDate(point?.timestamp)?.getTime() ||
    toDate(point?.deviceTimestamp)?.getTime() ||
    0
  );
}


function formatScanTime(value) {
  const date = toDate(value);

  if (!date) {
    return '';
  }

  return date.toLocaleTimeString(
    [],
    {
      hour: '2-digit',
      minute: '2-digit'
    }
  );
}


function buildCheckpointTimeline(patrol) {
  if (!patrol) {
    return [];
  }

  if (
    Array.isArray(patrol.checkpoints) &&
    patrol.checkpoints.length > 0
  ) {
    return patrol.checkpoints;
  }

  const ids =
    Array.isArray(
      patrol.requiredCheckpointIds
    )
      ? patrol.requiredCheckpointIds
      : [];

  const names =
    Array.isArray(
      patrol.requiredCheckpointNames
    )
      ? patrol.requiredCheckpointNames
      : [];

  const completedIds =
    new Set(
      Array.isArray(
        patrol.completedCheckpointIds
      )
        ? patrol.completedCheckpointIds
        : []
    );

  const scans =
    Array.isArray(
      patrol.checkpointScans
    )
      ? patrol.checkpointScans
      : [];

  const scanByCheckpointId =
    new Map(
      scans
        .filter(
          (scan) =>
            scan?.checkpointId
        )
        .map(
          (scan) => [
            String(
              scan.checkpointId
            ),
            scan
          ]
        )
    );

  return ids.map(
    (checkpointId, index) => {
      const scan =
        scanByCheckpointId.get(
          String(checkpointId)
        );

      return {
        id: checkpointId,
        name:
          names[index] ||
          scan?.checkpointName ||
          `Checkpoint ${index + 1}`,

        status:
          completedIds.has(
            checkpointId
          ) ||
          Boolean(scan)
            ? 'Completed'
            : 'Pending',

        scannedAt:
          scan?.scannedAt
            ? formatScanTime(
                scan.scannedAt
              )
            : '',

        method:
          scan
            ? 'QR'
            : ''
      };
    }
  );
}


function getLocationFreshness(
  updatedAt,
  nowMs
) {
  const updatedDate =
    toDate(updatedAt);

  if (!updatedDate) {
    return {
      label: 'No live GPS update',
      ageSeconds: null,
      isFresh: false
    };
  }

  const ageSeconds =
    Math.max(
      0,
      Math.floor(
        (
          nowMs -
          updatedDate.getTime()
        ) /
        1000
      )
    );

  let label = '';

  if (ageSeconds < 5) {
    label = 'Just now';
  } else if (ageSeconds < 60) {
    label =
      `${ageSeconds} sec ago`;
  } else if (ageSeconds < 3600) {
    label =
      `${Math.floor(
        ageSeconds / 60
      )} min ago`;
  } else {
    label =
      updatedDate.toLocaleString();
  }

  return {
    label,
    ageSeconds,
    isFresh:
      ageSeconds <= 45
  };
}


export default function GuardTracking() {

  const {
    guards,
    patrols,
    guardLocations = [],
    addToast,
    openGuardDrawer
  } = useSpot();

  const [
    selectedGuardId,
    setSelectedGuardId
  ] = useState('');

  const [
    routeHistory,
    setRouteHistory
  ] = useState([]);

  const [
    nowMs,
    setNowMs
  ] = useState(
    Date.now()
  );


  // Keep the selected guard valid as Firestore users arrive/change.
  useEffect(() => {

    if (
      guards.length === 0
    ) {
      setSelectedGuardId('');
      return;
    }

    const stillExists =
      guards.some(
        (guard) =>
          guard.id ===
          selectedGuardId
      );

    if (!stillExists) {
      setSelectedGuardId(
        guards[0].id
      );
    }

  }, [
    guards,
    selectedGuardId
  ]);


  // Update "X sec ago" labels without waiting for another Firestore write.
  useEffect(() => {

    const timer =
      window.setInterval(
        () => {
          setNowMs(
            Date.now()
          );
        },
        5000
      );

    return () =>
      window.clearInterval(
        timer
      );

  }, []);


  const activeGuard =
    useMemo(
      () =>
        guards.find(
          (guard) =>
            guard.id ===
            selectedGuardId
        ) ||
        guards[0] ||
        null,
      [
        guards,
        selectedGuardId
      ]
    );


  const liveLocation =
    useMemo(
      () => {

        if (!activeGuard) {
          return null;
        }

        return (
          guardLocations.find(
            (location) =>
              String(
                location.guardId ||
                location.id
              ) ===
              String(
                activeGuard.id
              )
          ) ||
          guardLocations.find(
            (location) =>
              location.humanGuardId &&
              (
                String(
                  location.humanGuardId
                ) ===
                String(
                  activeGuard.guardId ||
                  ''
                )
              )
          ) ||
          null
        );

      },
      [
        activeGuard,
        guardLocations
      ]
    );


  const guardPatrols =
    useMemo(
      () => {

        if (!activeGuard) {
          return [];
        }

        return patrols
          .filter(
            (patrol) =>
              String(
                patrol.guardId ||
                ''
              ) ===
              String(
                activeGuard.id
              )
          )
          .sort(
            (a, b) =>
              getPatrolSortTime(b) -
              getPatrolSortTime(a)
          );

      },
      [
        activeGuard,
        patrols
      ]
    );


  const activePatrol =
    useMemo(
      () => {

        if (!activeGuard) {
          return null;
        }

        // Strongest link: Android GPS service writes the active patrol ID.
        if (
          liveLocation?.patrolId
        ) {
          const gpsPatrol =
            guardPatrols.find(
              (patrol) =>
                String(
                  patrol.id
                ) ===
                String(
                  liveLocation.patrolId
                )
            );

          if (gpsPatrol) {
            return gpsPatrol;
          }
        }

        // Otherwise prefer an actual IN_PROGRESS patrol.
        const inProgress =
          guardPatrols.find(
            (patrol) =>
              normalizePatrolStatus(
                patrol.status
              ) ===
              'In Progress'
          );

        if (inProgress) {
          return inProgress;
        }

        // Last fallback is the latest guard patrol.
        return (
          guardPatrols[0] ||
          null
        );

      },
      [
        activeGuard,
        guardPatrols,
        liveLocation
      ]
    );


  const patrolIdForRoute =
    liveLocation?.patrolId ||
    activePatrol?.id ||
    '';


  // Subscribe ONLY to the route points for the selected patrol.
  // This avoids downloading the whole locationHistory collection.
  useEffect(() => {

    setRouteHistory([]);

    if (
      !hasFirebaseConfig ||
      !db ||
      !patrolIdForRoute
    ) {
      return undefined;
    }

    const routeQuery =
      query(
        collection(
          db,
          'locationHistory'
        ),
        where(
          'patrolId',
          '==',
          patrolIdForRoute
        )
      );

    const unsubscribe =
      onSnapshot(
        routeQuery,
        (snapshot) => {

          const points =
            snapshot.docs
              .map(
                (routeDoc) => {
                  const data =
                    routeDoc.data();

                  const latitude =
                    Number(
                      data.latitude ??
                      data.lat
                    );

                  const longitude =
                    Number(
                      data.longitude ??
                      data.lng
                    );

                  return {
                    id:
                      routeDoc.id,
                    ...data,
                    latitude:
                      Number.isFinite(
                        latitude
                      )
                        ? latitude
                        : null,
                    longitude:
                      Number.isFinite(
                        longitude
                      )
                        ? longitude
                        : null
                  };
                }
              )
              .filter(
                (point) =>
                  Number.isFinite(
                    point.latitude
                  ) &&
                  Number.isFinite(
                    point.longitude
                  )
              )
              .sort(
                (a, b) =>
                  getHistoryPointTime(a) -
                  getHistoryPointTime(b)
              );

          setRouteHistory(
            points
          );
        },
        (error) => {
          console.error(
            'Live patrol route subscription failed:',
            error
          );

          setRouteHistory([]);
        }
      );

    return unsubscribe;

  }, [
    patrolIdForRoute
  ]);


  const checkpointTimeline =
    useMemo(
      () =>
        buildCheckpointTimeline(
          activePatrol
        ),
      [
        activePatrol
      ]
    );


  const completedCount =
    Number(
      activePatrol?.completedCheckpoints ??
      activePatrol?.completedCount ??
      checkpointTimeline.filter(
        (checkpoint) =>
          checkpoint.status ===
          'Completed'
      ).length ??
      0
    );


  const totalCount =
    Number(
      activePatrol?.totalCheckpoints ??
      activePatrol?.totalCount ??
      checkpointTimeline.length ??
      0
    );


  const hasLiveCoordinates =
    Boolean(
      liveLocation &&
      Number.isFinite(
        liveLocation.latitude
      ) &&
      Number.isFinite(
        liveLocation.longitude
      )
    );


  // Use real live coordinates whenever they exist.
  // Site/old guard values are only a map fallback before the first GPS fix.
  const fallbackLat =
    Number(
      activeGuard?.gpsLat ??
      activeGuard?.lat ??
      14.5995
    );

  const fallbackLng =
    Number(
      activeGuard?.gpsLng ??
      activeGuard?.lng ??
      120.9842
    );

  const mapLat =
    hasLiveCoordinates
      ? liveLocation.latitude
      : fallbackLat;

  const mapLng =
    hasLiveCoordinates
      ? liveLocation.longitude
      : fallbackLng;

  const mapCenter = [
    Number.isFinite(mapLat)
      ? mapLat
      : 14.5995,
    Number.isFinite(mapLng)
      ? mapLng
      : 120.9842
  ];


  const routePositions =
    routeHistory.map(
      (point) => [
        point.latitude,
        point.longitude
      ]
    );


  // Make sure the most recent live position is visually connected to the
  // breadcrumb line even if the next history write has not happened yet.
  if (hasLiveCoordinates) {

    const lastPoint =
      routePositions[
        routePositions.length - 1
      ];

    if (
      !lastPoint ||
      lastPoint[0] !==
        liveLocation.latitude ||
      lastPoint[1] !==
        liveLocation.longitude
    ) {
      routePositions.push([
        liveLocation.latitude,
        liveLocation.longitude
      ]);
    }
  }


  const freshness =
    getLocationFreshness(
      liveLocation?.updatedAt,
      nowMs
    );


  const trackingActive =
    Boolean(
      liveLocation?.tracking
    );


  const patrolStatus =
    normalizePatrolStatus(
      activePatrol?.status
    );


  const displayStatus =
    trackingActive ||
    patrolStatus ===
      'In Progress'
      ? 'ON PATROL'
      : (
          activeGuard?.status ||
          'IDLE'
        );


  const accuracyMeters =
    liveLocation?.accuracy !==
      null &&
    liveLocation?.accuracy !==
      undefined &&
    Number.isFinite(
      Number(
        liveLocation.accuracy
      )
    )
      ? Number(
          liveLocation.accuracy
        )
      : null;


  const gpsSignalLabel =
    accuracyMeters === null
      ? 'Waiting for GPS'
      : accuracyMeters <= 10
      ? `${accuracyMeters.toFixed(1)}m (Excellent)`
      : accuracyMeters <= 25
      ? `${accuracyMeters.toFixed(1)}m (Good)`
      : accuracyMeters <= 50
      ? `${accuracyMeters.toFixed(1)}m (Fair)`
      : `${accuracyMeters.toFixed(1)}m (Weak)`;


  if (!activeGuard) {
    return (
      <Layout
        title="Live Telemetry Monitoring Console"
        subtitle="Real-Time Patrol GPS, Breadcrumb Trail & Diagnostics"
      >
        <div className="card-spot p-8 text-center text-sm text-slate-400">
          No guards are available for live monitoring.
        </div>
      </Layout>
    );
  }


  return (
    <Layout
      title="Live Telemetry Monitoring Console"
      subtitle="Real-Time Patrol GPS, Breadcrumb Trail & Diagnostics"
    >
      <div className="space-y-4">

        {/* Guard Selector Ribbon */}
        <div className="flex items-center gap-3 overflow-x-auto custom-scrollbar pb-2">

          {guards.map(
            (guard) => {

              const location =
                guardLocations.find(
                  (item) =>
                    String(
                      item.guardId ||
                      item.id
                    ) ===
                    String(
                      guard.id
                    )
                );

              const live =
                Boolean(
                  location?.tracking
                );

              return (
                <button
                  key={guard.id}
                  onClick={() =>
                    setSelectedGuardId(
                      guard.id
                    )
                  }
                  className={`flex items-center gap-3 rounded-2xl border px-4 py-2.5 transition shrink-0 ${
                    guard.id ===
                    activeGuard.id
                      ? 'border-blue-500 bg-blue-600/20 text-white shadow-lg shadow-blue-600/20'
                      : 'border-slate-800 bg-slate-900/60 text-slate-400 hover:border-slate-700 hover:text-white'
                  }`}
                >
                  {guard.photo ? (
                    <img
                      src={guard.photo}
                      alt={guard.name}
                      className="h-7 w-7 rounded-full object-cover"
                    />
                  ) : (
                    <div className="h-7 w-7 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-[10px] font-bold text-white">
                      {String(
                        guard.name ||
                        'G'
                      )
                        .charAt(0)
                        .toUpperCase()}
                    </div>
                  )}

                  <div className="text-left">
                    <div className="text-xs font-bold">
                      {guard.name}
                    </div>

                    <div className="text-[10px] opacity-75">
                      {guard.siteName}
                    </div>
                  </div>

                  <span
                    title={
                      live
                        ? 'Live GPS tracking'
                        : 'Not currently tracking'
                    }
                    className={`ml-1 h-2 w-2 rounded-full ${
                      live
                        ? 'bg-emerald-400 animate-pulse'
                        : guard.status ===
                          'Emergency'
                        ? 'bg-rose-400 animate-ping'
                        : 'bg-slate-500'
                    }`}
                  />
                </button>
              );
            }
          )}
        </div>


        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch min-h-[620px]">

          {/* Left Timeline Panel */}
          <div className="lg:col-span-3 card-spot flex flex-col justify-between">

            <div>

              <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">

                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                  <Clock className="h-4 w-4 text-blue-400" />
                  Route Timeline
                </h3>

                <span className="text-xs font-mono font-semibold text-emerald-400">
                  {completedCount}/{totalCount} Done
                </span>

              </div>


              {activePatrol ? (

                <div className="mb-4 rounded-xl border border-slate-800 bg-slate-950/40 p-3">

                  <div className="flex items-center justify-between gap-2">

                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-slate-500">
                        Current Patrol
                      </div>

                      <div className="mt-1 text-xs font-bold text-white">
                        {activePatrol.patrolTime ||
                         activePatrol.scheduledTime ||
                         'Scheduled Patrol'}
                      </div>
                    </div>

                    <span
                      className={`rounded-full px-2 py-1 text-[9px] font-bold ${
                        patrolStatus ===
                        'In Progress'
                          ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                          : patrolStatus ===
                            'Completed'
                          ? 'bg-blue-500/15 text-blue-400 border border-blue-500/30'
                          : patrolStatus ===
                            'Late'
                          ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                          : patrolStatus ===
                            'Missed'
                          ? 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                          : 'bg-slate-800 text-slate-300 border border-slate-700'
                      }`}
                    >
                      {patrolStatus}
                    </span>
                  </div>

                </div>

              ) : null}


              <div className="space-y-4">

                {checkpointTimeline.length >
                0 ? (

                  checkpointTimeline.map(
                    (checkpoint, index) => (

                      <div
                        key={
                          checkpoint.id ||
                          index
                        }
                        className="relative flex items-start gap-3 pl-1"
                      >

                        {index !==
                          checkpointTimeline.length -
                            1 && (
                          <span className="absolute left-3 top-6 bottom-0 w-0.5 bg-slate-800" />
                        )}

                        <div
                          className={`h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-bold z-10 shrink-0 ${
                            checkpoint.status ===
                            'Completed'
                              ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/30'
                              : checkpoint.status ===
                                'Missed'
                              ? 'bg-rose-500 text-white'
                              : 'bg-slate-800 text-slate-400 border border-slate-700'
                          }`}
                        >
                          {index + 1}
                        </div>

                        <div className="min-w-0 flex-1">

                          <div className="text-xs font-bold text-white truncate">
                            {checkpoint.name}
                          </div>

                          <div className="flex items-center justify-between gap-2 text-[10px] text-slate-400 mt-0.5">

                            <span>
                              {checkpoint.scannedAt ||
                               'Pending'}
                            </span>

                            {checkpoint.method ? (
                              <span className="font-semibold text-blue-400">
                                {checkpoint.method}
                              </span>
                            ) : null}

                          </div>

                        </div>

                      </div>
                    )
                  )

                ) : (

                  <div className="rounded-xl border border-dashed border-slate-800 bg-slate-950/30 px-4 py-6 text-center text-xs text-slate-500">
                    No checkpoint timeline is available for this guard's selected patrol.
                  </div>

                )}

              </div>

            </div>


            <div className="mt-6 pt-4 border-t border-slate-800">

              <button
                onClick={() =>
                  addToast(
                    'Live Sync Active',
                    trackingActive
                      ? `GPS updates for ${activeGuard.name} are arriving automatically from Firestore.`
                      : `Waiting for ${activeGuard.name} to start a GPS-tracked patrol.`,
                    trackingActive
                      ? 'success'
                      : 'info'
                  )
                }
                className="btn-secondary w-full py-2 text-xs"
              >
                <Zap className="h-3.5 w-3.5 mr-1 text-amber-400" />
                Check Live Sync
              </button>

            </div>

          </div>


          {/* Center Live Leaflet Map */}
          <div className="lg:col-span-6 card-spot p-0 overflow-hidden relative flex flex-col min-h-[500px]">

            <div className="flex items-center justify-between border-b border-slate-800 bg-[#1E293B] px-4 py-3 z-10">

              <div className="flex items-center gap-2">

                <Radio
                  className={`h-4 w-4 ${
                    trackingActive &&
                    freshness.isFresh
                      ? 'text-emerald-400 animate-pulse'
                      : 'text-slate-500'
                  }`}
                />

                <span className="text-xs font-bold text-white">
                  Live Tracking: {activeGuard.name}
                </span>

              </div>

              <span className="text-[10px] font-mono text-slate-400">
                {accuracyMeters !== null
                  ? `GPS Lock: ${accuracyMeters.toFixed(1)}m Accuracy`
                  : 'GPS Lock: Waiting for first location'}
              </span>

            </div>


            <div className="flex-1 w-full h-full relative">

              <MapContainer
                center={mapCenter}
                zoom={17}
                scrollWheelZoom={true}
                className="w-full h-full z-0"
              >

                <TileLayer
                  attribution="&copy; CARTO"
                  url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                />

                <LiveMapRecenter
                  lat={mapCenter[0]}
                  lng={mapCenter[1]}
                />

                <Marker
                  position={mapCenter}
                  icon={createLiveGuardMarker(
                    activeGuard.name,
                    trackingActive
                  )}
                >

                  <Popup className="custom-popup">

                    <div className="p-1 text-xs">

                      <div className="font-bold">
                        {activeGuard.name}
                      </div>

                      <div>
                        {liveLocation?.siteName ||
                         activeGuard.siteName}
                      </div>

                      <div className="mt-1 font-semibold">
                        {displayStatus}
                      </div>

                      <div className="mt-1">
                        Last GPS: {freshness.label}
                      </div>

                    </div>

                  </Popup>

                </Marker>


                {routePositions.length >=
                2 ? (

                  <Polyline
                    positions={
                      routePositions
                    }
                    color="#2563EB"
                    weight={4}
                    opacity={0.9}
                  />

                ) : null}

              </MapContainer>


              {!hasLiveCoordinates && (

                <div className="pointer-events-none absolute left-1/2 top-4 z-[500] -translate-x-1/2 rounded-xl border border-amber-500/30 bg-slate-950/90 px-4 py-2 text-[10px] font-semibold text-amber-300 shadow-xl">
                  No live GPS fix yet — showing the guard's saved/fallback map position.
                </div>

              )}

            </div>

          </div>


          {/* Right Guard Info Panel */}
          <div className="lg:col-span-3 card-spot flex flex-col justify-between">

            <div>

              <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">

                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                  Guard Telematics
                </h3>

                <span className="max-w-[170px] truncate rounded bg-slate-800 px-2 py-0.5 text-[10px] font-mono text-blue-400 border border-slate-700">
                  {activeGuard.id}
                </span>

              </div>


              <div className="text-center pb-4 border-b border-slate-800">

                {activeGuard.photo ? (

                  <img
                    src={
                      activeGuard.photo
                    }
                    alt={
                      activeGuard.name
                    }
                    className="h-20 w-20 rounded-2xl object-cover mx-auto border-2 border-blue-500/40 shadow-xl"
                  />

                ) : (

                  <div className="h-20 w-20 rounded-2xl mx-auto border-2 border-blue-500/40 bg-slate-900 flex items-center justify-center text-2xl font-bold text-white shadow-xl">
                    {String(
                      activeGuard.name ||
                      'G'
                    )
                      .charAt(0)
                      .toUpperCase()}
                  </div>

                )}

                <h4 className="mt-3 text-base font-bold text-white">
                  {activeGuard.name}
                </h4>

                <p className="text-xs text-slate-400">
                  {liveLocation?.siteName ||
                   activeGuard.siteName}
                </p>


                <div className="mt-2 flex justify-center gap-2">

                  <span
                    className={`text-[10px] rounded-full px-2 py-1 font-bold border ${
                      displayStatus ===
                      'ON PATROL'
                        ? 'border-emerald-500/30 bg-emerald-500/15 text-emerald-400'
                        : 'border-slate-700 bg-slate-800 text-slate-300'
                    }`}
                  >
                    {displayStatus}
                  </span>

                  <span className="badge-info text-[10px]">
                    {activeGuard.faceVerified
                      ? 'VERIFIED'
                      : 'UNVERIFIED'}
                  </span>

                </div>

              </div>


              <div className="mt-4 space-y-3 text-xs">

                <div className="flex items-center justify-between gap-3">

                  <span className="text-slate-400 flex items-center gap-1.5">
                    <Battery className="h-4 w-4 text-emerald-400" />
                    Battery:
                  </span>

                  <span className="font-bold text-white">
                    {activeGuard.battery ?? '--'}%
                  </span>

                </div>


                <div className="flex items-center justify-between gap-3">

                  <span className="text-slate-400 flex items-center gap-1.5">
                    <MapPin className="h-4 w-4 text-blue-400" />
                    GPS Signal:
                  </span>

                  <span className="font-bold text-white text-right">
                    {gpsSignalLabel}
                  </span>

                </div>


                <div className="flex items-center justify-between gap-3">

                  <span className="text-slate-400 flex items-center gap-1.5">
                    <Radio className="h-4 w-4 text-emerald-400" />
                    GPS Update:
                  </span>

                  <span
                    className={`font-bold text-right ${
                      freshness.isFresh
                        ? 'text-emerald-400'
                        : 'text-amber-400'
                    }`}
                  >
                    {freshness.label}
                  </span>

                </div>


                <div className="flex items-center justify-between gap-3">

                  <span className="text-slate-400 flex items-center gap-1.5">
                    <Activity className="h-4 w-4 text-blue-400" />
                    Tracking:
                  </span>

                  <span
                    className={`font-bold ${
                      trackingActive
                        ? 'text-emerald-400'
                        : 'text-slate-400'
                    }`}
                  >
                    {trackingActive
                      ? 'ACTIVE'
                      : 'INACTIVE'}
                  </span>

                </div>


                <div className="flex items-center justify-between gap-3">

                  <span className="text-slate-400 flex items-center gap-1.5">
                    <ShieldCheck className="h-4 w-4 text-emerald-400" />
                    Liveness:
                  </span>

                  <span className="font-bold text-emerald-400 text-right">
                    {activeGuard.faceVerified
                      ? `PASSED (${activeGuard.faceVerifiedAt || 'Verified'})`
                      : 'PENDING'}
                  </span>

                </div>


                <div className="flex items-center justify-between gap-3">

                  <span className="text-slate-400">
                    Patrol:
                  </span>

                  <span className="font-semibold text-slate-200 text-right">
                    {activePatrol?.patrolTime ||
                     activePatrol?.scheduledTime ||
                     'No active patrol'}
                  </span>

                </div>


                <div className="flex items-center justify-between gap-3">

                  <span className="text-slate-400">
                    Checkpoints:
                  </span>

                  <span className="font-semibold text-slate-200">
                    {completedCount}/{totalCount}
                  </span>

                </div>


                <div className="flex items-center justify-between gap-3">

                  <span className="text-slate-400">
                    Route Points:
                  </span>

                  <span className="font-semibold text-slate-200">
                    {routeHistory.length}
                  </span>

                </div>


                <div className="flex items-center justify-between gap-3">

                  <span className="text-slate-400">
                    Shift:
                  </span>

                  <span className="font-semibold text-slate-200 text-right">
                    {activeGuard.shift}
                  </span>

                </div>

              </div>

            </div>


            <div className="mt-6 pt-4 border-t border-slate-800 space-y-2">

              <button
                onClick={() =>
                  openGuardDrawer(
                    activeGuard
                  )
                }
                className="btn-primary w-full py-2 text-xs"
              >
                Inspect Guard Drawer →
              </button>


              <button
                onClick={() =>
                  addToast(
                    'Emergency Alert',
                    `Dispatch requested for guard ${activeGuard.name}`,
                    'danger'
                  )
                }
                className="btn-danger w-full py-2 text-xs"
              >
                <AlertTriangle className="h-3.5 w-3.5 mr-1" />
                Request Emergency Dispatch
              </button>

            </div>

          </div>

        </div>

      </div>
    </Layout>
  );
}

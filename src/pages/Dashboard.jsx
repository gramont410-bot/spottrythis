import React, { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import { useSpot } from '../context/SpotContext';
import { MapContainer, TileLayer, Marker, Popup, Circle, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  Users,
  ShieldAlert,
  CalendarCheck,
  CheckCircle2,
  Clock,
  AlertTriangle,
  WifiOff,
  Activity,
  Filter,
  BarChart3,
  TrendingUp,
  MapPin,
  QrCode,
  ShieldCheck,
  Play,
  Maximize2
} from 'lucide-react';

// Custom Leaflet marker icons with pulse rings
const createGuardMarker = (status, initial) => {
  let colorClass = 'bg-blue-600 border-blue-400';
  if (status === 'Emergency') colorClass = 'bg-rose-600 border-rose-400 emergency-flash';
  if (status === 'Idle') colorClass = 'bg-slate-600 border-slate-400';

  return L.divIcon({
    className: 'custom-guard-marker',
    html: `<div className="relative flex items-center justify-center h-9 w-9 rounded-full ${colorClass} text-white font-bold text-xs border-2 shadow-lg shadow-black/50 cursor-pointer radar-ping">
            ${initial}
            <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-emerald-400 border border-slate-900"></span>
          </div>`,
    iconSize: [36, 36],
    iconAnchor: [18, 18]
  });
};

function LiveMapViewport({ guards, resetKey }) {
  const map = useMap();
  const positionKey = guards.map((guard) => `${guard.id}:${guard.gpsLat}:${guard.gpsLng}`).join('|');

  useEffect(() => {
    const points = guards
      .filter((guard) => Number.isFinite(Number(guard.gpsLat)) && Number.isFinite(Number(guard.gpsLng)))
      .map((guard) => [Number(guard.gpsLat), Number(guard.gpsLng)]);

    if (points.length === 1) map.setView(points[0], 15, { animate: true, duration: 0.7 });
    if (points.length > 1) map.fitBounds(points, { padding: [36, 36], maxZoom: 15, animate: true, duration: 0.7 });
  }, [positionKey, resetKey, map]);

  return null;
}

export default function Dashboard() {
  const { stats, guards, guardLocations, liveEvents, openGuardDrawer, addToast } = useSpot();
  const [timeFilter, setTimeFilter] = useState('Daily');
  const [activeTab, setActiveTab] = useState('All');
  const [mapResetKey, setMapResetKey] = useState(0);

  const visibleGuards = guards.filter((guard) => {
    if (activeTab === 'All') return true;
    return guard.status === activeTab;
  });

  // Keep guards without a GPS fix in the dashboard, but never pass
  // null/invalid coordinates to Leaflet.
  const mappableGuards = visibleGuards.filter((guard) => {
    const location = guardLocations.find((item) => (
      [item.guardId, item.humanGuardId, item.id].some((id) => (
        id != null && [guard.id, guard.guardId].some((guardId) => String(id) === String(guardId))
      ))
    ));
    const lat = Number(location?.latitude);
    const lng = Number(location?.longitude);

    return (
      location?.tracking === true &&
      location?.isStale === false &&
      location?.gpsAvailable === true &&
      location?.gpsIsStale === false &&
      Number.isFinite(lat) &&
      Number.isFinite(lng) &&
      lat >= -90 &&
      lat <= 90 &&
      lng >= -180 &&
      lng <= 180
    );
  });

  const topCards = [
    { title: 'Active Guards', count: stats.activeGuards, icon: Users, color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/20' },
    { title: 'Currently On Patrol', count: stats.currentlyOnPatrol, icon: ShieldAlert, color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
    { title: "Today's Patrols", count: stats.todaysPatrols, icon: CalendarCheck, color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/20' },
    { title: 'Completed Patrols', count: stats.completedPatrols, icon: CheckCircle2, color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
    { title: 'Delayed Patrols', count: stats.delayedPatrols, icon: Clock, color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20' },
    { title: 'Missed Patrols', count: stats.missedPatrols, icon: AlertTriangle, color: 'text-rose-400', bg: 'bg-rose-500/10 border-rose-500/20' },
    { title: 'Offline Guards', count: stats.offlineGuards, icon: WifiOff, color: 'text-slate-400', bg: 'bg-slate-500/10 border-slate-500/20' },
    { title: 'Incidents Today', count: stats.incidentsToday, icon: Activity, color: 'text-rose-400', bg: 'bg-rose-500/10 border-rose-500/20' }
  ];

  const mapCenter = [14.5547, 121.0244];

  return (
    <Layout
      title="Security Operations Command Dashboard"
      subtitle="Real-time Guard Patrol Operations, GPS Telemetry & Live Telematics"
    >
      <div className="command-grid space-y-6">
        {/* Top 8 Statistics Cards */}
        <div className="grid auto-rows-fr grid-cols-2 gap-3.5 sm:grid-cols-4 lg:grid-cols-8">
          {topCards.map((card, idx) => {
            const Icon = card.icon;
            const isFeatured = idx === 0;
            const isSecondary = idx === 1 || idx === 2;
            return (
              <div
                key={idx}
                className={`card-spot flex min-h-[112px] cursor-pointer flex-col justify-between p-4 transition-all duration-200 hover:-translate-y-1 hover:shadow-2xl ${
                  isFeatured ? 'min-h-[232px] p-5 lg:col-span-2 lg:row-span-2' : isSecondary ? 'lg:col-span-2' : ''
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className={`${isFeatured ? 'text-xs' : 'text-[11px]'} truncate font-semibold text-slate-400`}>{card.title}</span>
                  <div className={`p-1.5 rounded-lg border ${card.bg}`}>
                    <Icon className={`${isFeatured ? 'h-5 w-5' : 'h-4 w-4'} ${card.color}`} />
                  </div>
                </div>
                <div className={`${isFeatured ? 'text-4xl' : 'text-2xl'} mt-3 font-bold tracking-tight text-white`}>{card.count}</div>
              </div>
            );
          })}
        </div>

        {/* Center Live Map (~60% width) & Right Activity Feed (~40% width) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          {/* Live Map Box */}
          <div className="lg:col-span-7 xl:col-span-8 card-spot live-map-shell p-0 overflow-hidden flex flex-col min-h-[520px] relative border border-slate-800">
            {/* Map Top Bar Controls */}
            <div className="flex items-center justify-between border-b border-slate-800 bg-[#1E293B] px-5 py-3.5 z-10">
              <div className="flex items-center gap-2.5">
                <span className="relative flex h-3 w-3">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-500" />
                </span>
                <span className="text-sm font-bold text-white tracking-wide">
                  Live Global Operations Map
                </span>
                <span className="rounded-full bg-blue-500/20 px-2 py-0.5 text-[10px] font-bold text-blue-400 border border-blue-500/30">{mappableGuards.length} Live GPS Pins</span>
              </div>

              <div className="flex items-center gap-1.5">
                {['All', 'On Patrol', 'Emergency'].map((filter) => (
                  <button key={filter} onClick={() => setActiveTab(filter)} className={`hidden rounded-lg px-2 py-1 text-[10px] font-semibold transition sm:inline-flex ${activeTab === filter ? 'bg-blue-500/20 text-blue-200' : 'text-slate-500 hover:bg-slate-800 hover:text-slate-200'}`}>{filter}</button>
                ))}
                <button
                  onClick={() => { setMapResetKey((value) => value + 1); addToast('Map View', 'Live guard coverage recentered', 'info'); }}
                  className="btn-secondary py-1 px-3 text-xs"
                >
                  <Maximize2 className="h-3.5 w-3.5 mr-1" /> Reset View
                </button>
              </div>
            </div>

            {/* Leaflet Interactive Map Container */}
            <div className="flex-1 w-full h-full relative min-h-[460px]">
              <MapContainer
                center={mapCenter}
                zoom={14}
                scrollWheelZoom={true}
                className="w-full h-full z-0"
              >
                <TileLayer
                  attribution='&copy; <a href="https://carto.com/">CARTO</a>'
                  url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                />

                <LiveMapViewport guards={mappableGuards} resetKey={mapResetKey} />

                {/* Guard Markers on Map — only guards with a real GPS fix */}
                {mappableGuards.map((guard) => {
                  const location = guardLocations.find((item) => (
                    [item.guardId, item.humanGuardId, item.id].some((id) => (
                      id != null && [guard.id, guard.guardId].some((guardId) => String(id) === String(guardId))
                    ))
                  ));
                  const lat = Number(location?.latitude);
                  const lng = Number(location?.longitude);

                  return (
                  <React.Fragment key={`${guard.id}:${lat}:${lng}`}>
                    <Circle
                      center={[lat, lng]}
                      radius={Math.max(18, Number(location?.accuracy) || 25)}
                      pathOptions={{
                        color: guard.status === 'Emergency' ? '#fb7185' : '#38bdf8',
                        fillColor: guard.status === 'Emergency' ? '#fb7185' : '#38bdf8',
                        fillOpacity: 0.08,
                        weight: 1
                      }}
                    />
                    <Marker
                      position={[lat, lng]}
                      icon={createGuardMarker(guard.status, String(guard.name || 'G').charAt(0))}
                    >
                    <Popup className="custom-popup">
                      <div className="p-1 min-w-[200px]">
                        <div className="flex items-center gap-2 border-b border-slate-700 pb-2 mb-2">
                          <img src={guard.photo} alt={guard.name} className="h-8 w-8 rounded-full object-cover" />
                          <div>
                            <div className="font-bold text-white text-sm">{guard.name}</div>
                            <div className="text-[11px] text-slate-400">{guard.siteName}</div>
                          </div>
                        </div>
                        <div className="text-xs space-y-1 mb-3">
                          <div className="flex justify-between">
                            <span className="text-slate-400">Status:</span>
                            <span className="font-semibold text-emerald-400">{guard.status}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-400">GPS accuracy:</span>
                            <span className="font-semibold text-white">{location?.accuracy == null ? 'Unknown' : `${Number(location.accuracy).toFixed(1)}m`}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-400">Walking steps:</span>
                            <span className="font-semibold text-white">{location?.stepCounterAvailable ? Number(location.walkingSteps || 0).toLocaleString() : 'Unavailable'}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-400">Battery:</span>
                            <span className="font-semibold text-white">{guard.battery}%</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-400">Face Verified:</span>
                            <span className="font-semibold text-blue-400">{guard.faceVerified ? 'Yes' : 'No'}</span>
                          </div>
                        </div>
                        <button
                          onClick={() => openGuardDrawer(guard)}
                          className="w-full btn-primary py-1 text-xs"
                        >
                          View Full Guard Drawer →
                        </button>
                      </div>
                    </Popup>
                    </Marker>
                  </React.Fragment>
                  );
                })}
              </MapContainer>

              {mappableGuards.length === 0 && (
                <div className="pointer-events-none absolute left-1/2 top-5 z-[500] -translate-x-1/2 rounded-xl border border-amber-500/30 bg-slate-950/90 px-4 py-2 text-center text-[11px] font-semibold text-amber-300 shadow-xl">
                  No guard has sent a live GPS fix yet. The map will update automatically when a patrol starts.
                </div>
              )}
            </div>
          </div>

          {/* Right Activity Feed */}
          <div className="lg:col-span-5 xl:col-span-4 card-spot flex h-[380px] min-h-0 flex-col sm:h-[440px] lg:h-[520px]">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-2">
                <Activity className="h-5 w-5 text-blue-400" />
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">Live Operations Stream</h3>
              </div>
              <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-400 border border-emerald-500/20">
                REALTIME
              </span>
            </div>

            {/* Event List Stream */}
            <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto mt-4 space-y-3 pr-1 overscroll-contain">
              {liveEvents.length === 0 ? (
                <div className="py-12 text-center text-xs text-slate-500">
                  No live events recorded in database yet. Ready for fresh field events.
                </div>
              ) : (
                liveEvents.map((ev) => (
                  <div
                    key={ev.id}
                    className="flex items-start gap-3 p-3 rounded-xl border border-slate-800/80 bg-slate-900/50 hover:bg-slate-800/60 transition group"
                  >
                    <div className="p-2 rounded-lg bg-blue-600/10 border border-blue-500/20 text-blue-400 shrink-0 mt-0.5">
                      <ShieldCheck className="h-4 w-4" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-[10px] font-bold text-blue-400">{ev.time}</span>
                        <span className="text-[10px] text-slate-500">Verified Event</span>
                      </div>
                      <p className="mt-1 text-xs text-slate-200 font-medium leading-relaxed">{ev.text}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Bottom Analytics Visuals */}
        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
          {/* Patrol Completion Overview Bar */}
          <div className="card-spot min-h-[300px] lg:col-span-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
              <h4 className="text-sm font-bold text-white flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-blue-400" /> Patrol Completion Status
              </h4>
              <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-lg border border-slate-800 text-xs">
                {['Daily', 'Weekly', 'Monthly'].map((tf) => (
                  <button
                    key={tf}
                    onClick={() => setTimeFilter(tf)}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition ${
                      timeFilter === tf ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {tf}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-300 font-medium">Completed Patrols</span>
                  <span className="font-bold text-emerald-400">90.1% (128)</span>
                </div>
                <div className="h-2.5 w-full bg-slate-900 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-500 rounded-full" style={{ width: '90.1%' }} />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-300 font-medium">Delayed Patrols</span>
                  <span className="font-bold text-amber-400">7.0% (10)</span>
                </div>
                <div className="h-2.5 w-full bg-slate-900 rounded-full overflow-hidden">
                  <div className="h-full bg-amber-500 rounded-full" style={{ width: '7.0%' }} />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-300 font-medium">Missed / Critical</span>
                  <span className="font-bold text-rose-400">2.9% (4)</span>
                </div>
                <div className="h-2.5 w-full bg-slate-900 rounded-full overflow-hidden">
                  <div className="h-full bg-rose-500 rounded-full" style={{ width: '2.9%' }} />
                </div>
              </div>
            </div>
          </div>

          {/* Average Patrol Duration */}
          <div className="card-spot min-h-[280px] lg:col-span-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
              <h4 className="text-sm font-bold text-white flex items-center gap-2">
                <Clock className="h-4 w-4 text-emerald-400" /> Patrol Duration Metrics
              </h4>
              <span className="text-xs text-slate-400 font-mono">Avg 38.4m</span>
            </div>

            <div className="grid grid-cols-2 gap-3 text-center">
              <div className="p-3 rounded-xl border border-slate-800 bg-slate-900/50">
                <div className="text-xs text-slate-400">Quick Patrols (&lt;30m)</div>
                <div className="text-xl font-bold text-white mt-1">42%</div>
              </div>
              <div className="p-3 rounded-xl border border-slate-800 bg-slate-900/50">
                <div className="text-xs text-slate-400">Standard (30-60m)</div>
                <div className="text-xl font-bold text-emerald-400 mt-1">51%</div>
              </div>
            </div>

            <div className="mt-3 p-3 rounded-xl border border-slate-800 bg-slate-900/50 text-center">
              <div className="text-xs text-slate-400">Extended Sweep (&gt;60m)</div>
              <div className="text-xl font-bold text-amber-400 mt-1">7%</div>
            </div>
          </div>

          {/* Incident Trend Heatmap */}
          <div className="card-spot min-h-[240px] lg:col-span-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
              <h4 className="text-sm font-bold text-white flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-rose-400" /> Incident Trend Analysis
              </h4>
              <span className="text-xs text-emerald-400 font-semibold">-14% vs Last Week</span>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">Perimeter Breaches</span>
                <span className="font-bold text-rose-400">1 Logged</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">Equipment Failures</span>
                <span className="font-bold text-amber-400">1 Logged</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">Access Mismatches</span>
                <span className="font-bold text-blue-400">1 Logged</span>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
              <span>Overall Security Rating:</span>
              <span className="font-bold text-emerald-400 text-sm">98.5% Excellent</span>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import Layout from '../components/Layout';
import GuardAvatar from '../components/GuardAvatar';
import { useSpot } from '../context/SpotContext';
import {
  Building2,
  Users,
  MapPin,
  AlertTriangle,
  X,
  Plus,
  Pencil,
  Trash2,
  Check,
  Navigation,
  Loader2,
  Globe,
  ShieldCheck,
  RefreshCw,
  QrCode,
  Clock3,
  ChevronRight,
  History,
  UserCheck,
  Save,
  Eye,
  MapPinned
} from 'lucide-react';
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  useMap
} from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  addItem,
  removeItem,
  setItem,
  subscribeCollection,
  updateItem
} from '../lib/dataSource';

// ─────────────────────────────────────────────────────────────
// Leaflet icons
// ─────────────────────────────────────────────────────────────

delete L.Icon.Default.prototype._getIconUrl;

L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl:
    'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl:
    'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// Custom dark-themed blue marker for SPOT
const spotIcon = new L.DivIcon({
  className: '',
  html: `
    <div style="
      width: 32px;
      height: 32px;
      background: linear-gradient(135deg, #2563EB, #1d4ed8);
      border: 2px solid rgba(255,255,255,0.3);
      border-radius: 50% 50% 50% 0;
      transform: rotate(-45deg);
      box-shadow: 0 4px 15px rgba(37,99,235,0.6);
      display: flex;
      align-items: center;
      justify-content: center;
    ">
      <div style="
        width: 10px;
        height: 10px;
        background: white;
        border-radius: 50%;
        transform: rotate(45deg);
        box-shadow: 0 0 8px rgba(255,255,255,0.8);
      "></div>
    </div>

    <div style="
      position: absolute;
      bottom: -6px;
      left: 50%;
      transform: translateX(-50%);
      width: 8px;
      height: 8px;
      background: rgba(37,99,235,0.4);
      border-radius: 50%;
      filter: blur(2px);
    "></div>
  `,
  iconSize: [32, 40],
  iconAnchor: [16, 40],
  popupAnchor: [0, -42],
});

// All-sites overview marker
const multiSiteIcon = new L.DivIcon({
  className: '',
  html: `
    <div style="
      width: 20px;
      height: 20px;
      background: linear-gradient(135deg, #2563EB, #1d4ed8);
      border: 2px solid rgba(255,255,255,0.4);
      border-radius: 50%;
      box-shadow: 0 2px 10px rgba(37,99,235,0.7);
    "></div>
  `,
  iconSize: [20, 20],
  iconAnchor: [10, 10],
  popupAnchor: [0, -12],
});

// ─────────────────────────────────────────────────────────────
// Map Helpers
// ─────────────────────────────────────────────────────────────

function MapRecenter({ lat, lng, zoom = 16 }) {
  const map = useMap();

  useEffect(() => {
    if (lat && lng) {
      map.setView([lat, lng], zoom, {
        animate: true
      });
    }
  }, [lat, lng, zoom, map]);

  return null;
}

// ─────────────────────────────────────────────────────────────
// Geocoding
// ─────────────────────────────────────────────────────────────

async function geocodeAddress(address) {
  if (!address || address.length < 5) return null;

  try {
    const encoded = encodeURIComponent(address);

    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encoded}&limit=1&countrycodes=ph`,
      {
        headers: {
          'Accept-Language': 'en',
          'User-Agent': 'SPOT-Command-Center/1.0'
        }
      }
    );

    const data = await res.json();

    if (data && data.length > 0) {
      return {
        lat: parseFloat(data[0].lat),
        lng: parseFloat(data[0].lon),
        displayName: data[0].display_name
      };
    }

    const res2 = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encoded}&limit=1`,
      {
        headers: {
          'Accept-Language': 'en',
          'User-Agent': 'SPOT-Command-Center/1.0'
        }
      }
    );

    const data2 = await res2.json();

    if (data2 && data2.length > 0) {
      return {
        lat: parseFloat(data2[0].lat),
        lng: parseFloat(data2[0].lon),
        displayName: data2[0].display_name
      };
    }
  } catch (e) {
    console.warn('Geocoding error:', e);
  }

  return null;
}

// ─────────────────────────────────────────────────────────────
// Single Site Map
// ─────────────────────────────────────────────────────────────

function SiteMapView({ site }) {
  const lat = site.lat || 14.5547;
  const lng = site.lng || 121.0244;
  const hasCoords = site.lat && site.lng;

  return (
    <div
      className="rounded-xl overflow-hidden border border-slate-700 shadow-lg"
      style={{ height: 260 }}
    >
      <MapContainer
        center={[lat, lng]}
        zoom={hasCoords ? 16 : 12}
        style={{
          height: '100%',
          width: '100%'
        }}
        scrollWheelZoom={false}
        attributionControl={false}
        zoomControl={true}
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://carto.com/">CartoDB</a>'
          maxZoom={19}
        />

        {hasCoords && (
          <Marker
            position={[lat, lng]}
            icon={spotIcon}
          >
            <Popup>
              <div
                style={{
                  fontFamily: 'Inter, sans-serif',
                  minWidth: 160
                }}
              >
                <div
                  style={{
                    fontWeight: 700,
                    color: '#F8FAFC',
                    fontSize: 13,
                    marginBottom: 4
                  }}
                >
                  {site.name}
                </div>

                <div
                  style={{
                    color: '#60A5FA',
                    fontSize: 11,
                    marginBottom: 2
                  }}
                >
                  {site.type}
                </div>

                <div
                  style={{
                    color: '#94A3B8',
                    fontSize: 11
                  }}
                >
                  {site.address}
                </div>

                <div
                  style={{
                    display: 'flex',
                    gap: 8,
                    marginTop: 8
                  }}
                >
                  <span
                    style={{
                      color: '#34D399',
                      fontSize: 10,
                      fontWeight: 600
                    }}
                  >
                    ● {site.activeGuardsCount} Guards
                  </span>

                  <span
                    style={{
                      color: '#60A5FA',
                      fontSize: 10,
                      fontWeight: 600
                    }}
                  >
                    ● {site.checkpointsCount} CPs
                  </span>
                </div>
              </div>
            </Popup>
          </Marker>
        )}

        <MapRecenter
          lat={lat}
          lng={lng}
          zoom={hasCoords ? 16 : 12}
        />
      </MapContainer>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// All Sites Map
// ─────────────────────────────────────────────────────────────

function AllSitesMap({
  sites,
  onSiteClick
}) {
  const sitesWithCoords = sites.filter(
    (site) => site.lat && site.lng
  );

  const center =
    sitesWithCoords.length > 0
      ? [
          sitesWithCoords[0].lat,
          sitesWithCoords[0].lng
        ]
      : [14.5547, 121.0244];

  return (
    <div
      className="card-spot p-0 overflow-hidden"
      style={{ height: 340 }}
    >
      <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between bg-slate-900/40">
        <div className="flex items-center gap-2">
          <Globe className="h-4 w-4 text-blue-400" />

          <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
            Live Site Map Overview
          </span>
        </div>

        <span className="text-[10px] text-slate-500">
          {sitesWithCoords.length} of {sites.length} sites pinned
        </span>
      </div>

      <MapContainer
        center={center}
        zoom={
          sitesWithCoords.length === 1
            ? 15
            : 11
        }
        style={{
          height: 'calc(100% - 45px)',
          width: '100%'
        }}
        scrollWheelZoom={true}
        attributionControl={false}
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          maxZoom={19}
        />

        {sitesWithCoords.map((site) => (
          <Marker
            key={site.id}
            position={[
              site.lat,
              site.lng
            ]}
            icon={multiSiteIcon}
            eventHandlers={{
              click: () =>
                onSiteClick(site)
            }}
          >
            <Popup>
              <div
                style={{
                  fontFamily: 'Inter, sans-serif',
                  minWidth: 150,
                  cursor: 'pointer'
                }}
                onClick={() =>
                  onSiteClick(site)
                }
              >
                <div
                  style={{
                    fontWeight: 700,
                    color: '#F8FAFC',
                    fontSize: 12
                  }}
                >
                  {site.name}
                </div>

                <div
                  style={{
                    color: '#60A5FA',
                    fontSize: 10,
                    marginBottom: 4
                  }}
                >
                  {site.type} • {site.client}
                </div>

                <div
                  style={{
                    color: '#94A3B8',
                    fontSize: 10
                  }}
                >
                  {site.address}
                </div>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Map Click Handler
// ─────────────────────────────────────────────────────────────

function MapClickHandler({
  onMapClick
}) {
  const map = useMap();

  useEffect(() => {
    const handler = (e) =>
      onMapClick(
        e.latlng.lat,
        e.latlng.lng
      );

    map.on(
      'click',
      handler
    );

    return () =>
      map.off(
        'click',
        handler
      );
  }, [
    map,
    onMapClick
  ]);

  return null;
}

// ─────────────────────────────────────────────────────────────
// Address Preview Map
// ─────────────────────────────────────────────────────────────

function AddressPreviewMap({
  address,
  coords,
  onCoordsFound
}) {
  const [loading, setLoading] =
    useState(false);

  const [error, setError] =
    useState('');

  const [
    manualMode,
    setManualMode
  ] = useState(false);

  const debounceRef =
    useRef(null);

  const markerRef =
    useRef(null);

  useEffect(() => {
    if (
      !address ||
      address.length < 8 ||
      manualMode
    ) {
      return;
    }

    clearTimeout(
      debounceRef.current
    );

    debounceRef.current =
      setTimeout(async () => {
        setLoading(true);
        setError('');

        const result =
          await geocodeAddress(
            address
          );

        setLoading(false);

        if (result) {
          onCoordsFound(
            result
          );
        } else {
          setError(
            'Address not found. Click the map to place the pin manually.'
          );
        }
      }, 1200);

    return () =>
      clearTimeout(
        debounceRef.current
      );
  }, [
    address,
    manualMode,
    onCoordsFound
  ]);

  const handleDragEnd =
    useCallback(() => {
      const marker =
        markerRef.current;

      if (marker) {
        const {
          lat,
          lng
        } =
          marker.getLatLng();

        setManualMode(true);

        onCoordsFound({
          lat,
          lng,
          displayName:
            address
        });
      }
    }, [
      address,
      onCoordsFound
    ]);

  const handleMapClick =
    useCallback(
      (lat, lng) => {
        setManualMode(true);

        onCoordsFound({
          lat,
          lng,
          displayName:
            address
        });
      },
      [
        address,
        onCoordsFound
      ]
    );

  const handleReset = () => {
    setManualMode(false);
    setError('');

    if (
      address &&
      address.length >= 8
    ) {
      setLoading(true);

      geocodeAddress(
        address
      ).then(
        (result) => {
          setLoading(false);

          if (result) {
            onCoordsFound(
              result
            );
          } else {
            setError(
              'Address not found. Place pin manually.'
            );
          }
        }
      );
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
          Live Map Pin
        </label>

        <div className="flex items-center gap-2">
          {loading && (
            <span className="flex items-center gap-1 text-[10px] text-blue-400">
              <Loader2 className="h-3 w-3 animate-spin" />
              Geocoding…
            </span>
          )}

          {error &&
            !loading && (
              <span className="text-[10px] text-amber-400">
                {error}
              </span>
            )}

          {coords &&
            !loading && (
              <span className="flex items-center gap-1 text-[10px] text-emerald-400">
                <Check className="h-3 w-3" />
                {manualMode
                  ? 'Manually adjusted'
                  : 'Auto-pinned'}
              </span>
            )}

          {coords &&
            manualMode && (
              <button
                type="button"
                onClick={
                  handleReset
                }
                title="Re-geocode from address"
                className="flex items-center gap-1 text-[10px] text-blue-400 hover:text-blue-300 transition px-2 py-0.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700"
              >
                <RefreshCw className="h-2.5 w-2.5" />
                Reset from address
              </button>
            )}
        </div>
      </div>

      <p className="text-[10px] text-slate-500">
        {coords
          ? '🖱 Drag the pin or click anywhere on the map to fine-tune the location.'
          : '🔍 Type an address to auto-pin, or click the map to place the pin manually.'}
      </p>

      <div
        className="rounded-xl overflow-hidden border border-blue-500/30 shadow-lg shadow-blue-950/30"
        style={{
          height: 240
        }}
      >
        <MapContainer
          center={
            coords
              ? [
                  coords.lat,
                  coords.lng
                ]
              : [
                  14.5547,
                  121.0244
                ]
          }
          zoom={
            coords
              ? 16
              : 11
          }
          style={{
            height:
              '100%',
            width:
              '100%'
          }}
          scrollWheelZoom={
            true
          }
          attributionControl={
            false
          }
        >
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            maxZoom={19}
          />

          <MapClickHandler
            onMapClick={
              handleMapClick
            }
          />

          {coords && (
            <>
              <Marker
                position={[
                  coords.lat,
                  coords.lng
                ]}
                icon={
                  spotIcon
                }
                draggable={
                  true
                }
                ref={
                  markerRef
                }
                eventHandlers={{
                  dragend:
                    handleDragEnd
                }}
              >
                <Popup>
                  <div
                    style={{
                      fontFamily:
                        'Inter, sans-serif',
                      fontSize:
                        11
                    }}
                  >
                    <div
                      style={{
                        color:
                          '#60A5FA',
                        fontWeight:
                          700,
                        marginBottom:
                          4
                      }}
                    >
                      Drag to fine-tune
                    </div>

                    <div
                      style={{
                        color:
                          '#94A3B8'
                      }}
                    >
                      {address ||
                        'Custom location'}
                    </div>

                    <div
                      style={{
                        color:
                          '#64748B',
                        fontFamily:
                          'monospace',
                        marginTop:
                          4,
                        fontSize:
                          10
                      }}
                    >
                      {coords.lat.toFixed(
                        6
                      )}
                      ,{' '}
                      {coords.lng.toFixed(
                        6
                      )}
                    </div>
                  </div>
                </Popup>
              </Marker>

              <MapRecenter
                lat={
                  coords.lat
                }
                lng={
                  coords.lng
                }
                zoom={
                  manualMode
                    ? undefined
                    : 16
                }
              />
            </>
          )}

          {!coords && (
            <div
              style={{
                position:
                  'absolute',
                top: '50%',
                left: '50%',
                transform:
                  'translate(-50%, -50%)',
                pointerEvents:
                  'none',
                zIndex: 800,
                textAlign:
                  'center'
              }}
            >
              <div
                style={{
                  background:
                    'rgba(37,99,235,0.12)',
                  border:
                    '1px dashed rgba(37,99,235,0.5)',
                  borderRadius:
                    10,
                  padding:
                    '7px 14px',
                  color:
                    '#60A5FA',
                  fontSize:
                    11,
                  fontFamily:
                    'Inter, sans-serif',
                  fontWeight:
                    600
                }}
              >
                Click map to place pin
              </div>
            </div>
          )}
        </MapContainer>
      </div>

      {coords ? (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-[10px] font-mono">
            <Navigation className="h-3 w-3 text-blue-400 shrink-0" />

            <span className="text-emerald-400">
              {coords.lat.toFixed(
                6
              )}
            </span>

            <span className="text-slate-600">
              ,
            </span>

            <span className="text-emerald-400">
              {coords.lng.toFixed(
                6
              )}
            </span>
          </div>

          {manualMode && (
            <span className="text-[10px] text-amber-400 flex items-center gap-1">
              <Pencil className="h-2.5 w-2.5" />
              Manual pin active
            </span>
          )}
        </div>
      ) : (
        <div className="text-[10px] text-slate-600 font-mono flex items-center gap-2">
          <Navigation className="h-3 w-3 text-slate-700" />
          No coordinates set
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Modal
// ─────────────────────────────────────────────────────────────

function Modal({
  title,
  subtitle,
  onClose,
  children,
  footer,
  wide = false
}) {
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
      <div
        className={`w-full ${
          wide
            ? 'max-w-2xl'
            : 'max-w-xl'
        } overflow-hidden rounded-2xl border border-slate-700 bg-[#1E293B] shadow-2xl`}
      >
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
          <div>
            <h3 className="text-base font-bold text-white">
              {title}
            </h3>

            {subtitle && (
              <p className="text-xs text-slate-400 mt-0.5">
                {subtitle}
              </p>
            )}
          </div>

          <button
            onClick={
              onClose
            }
            className="rounded-xl border border-slate-700 bg-slate-800 p-2 text-slate-400 hover:text-white transition"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-6 space-y-4 max-h-[85vh] overflow-y-auto custom-scrollbar">
          {children}
        </div>

        {footer && (
          <div className="px-6 py-4 border-t border-slate-800 flex justify-end gap-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Field
// ─────────────────────────────────────────────────────────────

function Field({
  label,
  children
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
        {label}
      </label>

      {children}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Remove Site Confirmation
// ─────────────────────────────────────────────────────────────

function DeleteConfirm({
  label,
  onCancel,
  onConfirm
}) {
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
      <div className="w-full max-w-sm rounded-2xl border border-rose-800/60 bg-[#1E293B] shadow-2xl p-6 space-y-4">

        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-rose-500/20 border border-rose-500/30 text-rose-400">
            <AlertTriangle className="h-5 w-5" />
          </div>

          <div>
            <div className="text-sm font-bold text-white">
              Remove Deployment Site
            </div>

            <div className="text-xs text-slate-400 mt-0.5">
              Use this when the client contract has ended.
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-3">
          <p className="text-xs text-slate-300">
            Are you sure you want to remove:
          </p>

          <p className="mt-1 text-sm font-bold text-white">
            {label}
          </p>
        </div>

        <p className="text-[10px] leading-relaxed text-slate-500">
          This will permanently remove the deployment site from
          Site Management. Make sure the client contract has
          ended before continuing.
        </p>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={
              onCancel
            }
            className="btn-secondary flex-1 text-xs"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={
              onConfirm
            }
            className="flex-1 py-2 px-4 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white transition flex items-center justify-center gap-2"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Remove Site
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Site Form
// ─────────────────────────────────────────────────────────────

const SITE_TYPES = [
  'Commercial',
  'Industrial',
  'Residential',
  'Government',
  'Healthcare',
  'Education',
  'Financial',
  'Warehouse',
  'Port / Terminal'
];

const SITE_STATUSES = [
  'Active',
  'Inactive',
  'Under Maintenance'
];

const EMPTY_SITE = {
  name: '',
  type: 'Commercial',
  client: '',
  clientId: '',
  address: '',
  status: 'Active',
  image: '',
  lat: null,
  lng: null
};

function SiteFormFields({
  form,
  onChange,
  clients = []
}) {
  const handleCoordsFound = (
    coords
  ) => {
    onChange(
      'lat',
      coords.lat
    );

    onChange(
      'lng',
      coords.lng
    );
  };

  return (
    <>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Site Name *">
          <input
            className="input-spot"
            value={
              form.name
            }
            onChange={(
              e
            ) =>
              onChange(
                'name',
                e.target
                  .value
              )
            }
            placeholder="e.g. Eastwood Mall Facility"
          />
        </Field>

        <Field label="Facility Type">
          <select
            className="input-spot"
            value={
              form.type
            }
            onChange={(
              e
            ) =>
              onChange(
                'type',
                e.target
                  .value
              )
            }
          >
            {SITE_TYPES.map(
              (type) => (
                <option
                  key={
                    type
                  }
                >
                  {type}
                </option>
              )
            )}
          </select>
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Client Organization">
          {clients.length > 0 ? (
            <select
              className="input-spot"
              value={form.clientId || ''}
              onChange={(e) => {
                const clientId = e.target.value;
                const client = clients.find((item) => String(item.id) === String(clientId));
                onChange('clientId', clientId);
                onChange('client', client?.company || client?.name || '');
              }}
            >
              <option value="">Select client</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.company || client.name || client.id}
                </option>
              ))}
            </select>
          ) : (
            <input
              className="input-spot"
              value={form.client}
              onChange={(e) => onChange('client', e.target.value)}
              placeholder="e.g. ETON Properties"
            />
          )}
        </Field>

        <Field label="Security Status">
          <select
            className="input-spot"
            value={
              form.status
            }
            onChange={(
              e
            ) =>
              onChange(
                'status',
                e.target
                  .value
              )
            }
          >
            {SITE_STATUSES.map(
              (status) => (
                <option
                  key={
                    status
                  }
                >
                  {status}
                </option>
              )
            )}
          </select>
        </Field>
      </div>

      <Field label="Full Address (used for map pinning) *">
        <input
          className="input-spot"
          value={
            form.address
          }
          onChange={(
            e
          ) =>
            onChange(
              'address',
              e.target
                .value
            )
          }
          placeholder="e.g. E. Rodriguez Jr. Avenue, Quezon City, Philippines"
        />
      </Field>

      <AddressPreviewMap
        address={
          form.address
        }
        coords={
          form.lat &&
          form.lng
            ? {
                lat:
                  form.lat,
                lng:
                  form.lng
              }
            : null
        }
        onCoordsFound={
          handleCoordsFound
        }
      />

      <Field label="Cover Image URL (optional)">
        <input
          className="input-spot"
          value={
            form.image
          }
          onChange={(
            e
          ) =>
            onChange(
              'image',
              e.target
                .value
            )
          }
          placeholder="https://..."
        />
      </Field>
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// Main Sites Page
// ─────────────────────────────────────────────────────────────

export default function Sites() {
  const {
    sites,
    guards,
    clients = [],
    patrols = [],
    incidents = [],
    addSite,
    updateSite,
    deleteSite,
    addToast
  } = useSpot();

  const [
    selectedSite,
    setSelectedSite
  ] = useState(null);

  const [
    showAdd,
    setShowAdd
  ] = useState(false);

  const [
    editTarget,
    setEditTarget
  ] = useState(null);

  const [
    deleteTarget,
    setDeleteTarget
  ] = useState(null);

  const [
    addForm,
    setAddForm
  ] = useState(
    EMPTY_SITE
  );

  const [
    editForm,
    setEditForm
  ] = useState(
    EMPTY_SITE
  );

  const [
    saving,
    setSaving
  ] = useState(false);

  const [
    viewMode,
    setViewMode
  ] = useState('grid');

  const [
    checkpoints,
    setCheckpoints
  ] = useState([]);

  const [
    rovingAssignments,
    setRovingAssignments
  ] = useState([]);

  const [
    qrGeneratorOpen,
    setQrGeneratorOpen
  ] = useState(false);

  const [
    qrPreview,
    setQrPreview
  ] = useState(null);

  const [
    siteIncidentsOpen,
    setSiteIncidentsOpen
  ] = useState(false);

  const [
    guardActionTarget,
    setGuardActionTarget
  ] = useState(null);

  const [
    assignQrTarget,
    setAssignQrTarget
  ] = useState(null);

  const [
    rovingTarget,
    setRovingTarget
  ] = useState(null);

  // Guard deployment transfer
  const [
    moveGuardTarget,
    setMoveGuardTarget
  ] = useState(null);

  const [
    moveGuardSiteId,
    setMoveGuardSiteId
  ] = useState('');

  const [
    moveGuardReason,
    setMoveGuardReason
  ] = useState('');

  const [
    selectedQrIds,
    setSelectedQrIds
  ] = useState([]);

  // Floor / Level removed
  const [
    qrForm,
    setQrForm
  ] = useState({
    name: '',
    area: '',
    lat: '',
    lng: '',
    assignedGuardIds: []
  });

  const [
    rovingForm,
    setRovingForm
  ] = useState({
    patrolTimes: [
      '19:00'
    ],
    days: [
      'Mon',
      'Tue',
      'Wed',
      'Thu',
      'Fri',
      'Sat',
      'Sun'
    ],
    notes: ''
  });

  // ─────────────────────────────────────────────
  // Realtime subscriptions
  // ─────────────────────────────────────────────

  useEffect(() => {
    const unsubCheckpoints =
      subscribeCollection(
        'checkpoints',
        setCheckpoints
      );

    const unsubRoving =
      subscribeCollection(
        'roving_assignments',
        setRovingAssignments
      );

    return () => {
      unsubCheckpoints();
      unsubRoving();
    };
  }, []);

  // ─────────────────────────────────────────────
  // Live site counters
  // ─────────────────────────────────────────────

  const sitesWithLiveCounts =
    useMemo(() => {
      const normalize = (
        value
      ) =>
        String(
          value || ''
        )
          .trim()
          .toLowerCase();

      const belongsToSite = (
        record,
        site
      ) => {
        if (
          !record ||
          !site
        ) {
          return false;
        }

        if (
          record.siteId &&
          String(
            record.siteId
          ) ===
            String(
              site.id
            )
        ) {
          return true;
        }

        if (
          record.assignedSiteId &&
          String(
            record.assignedSiteId
          ) ===
            String(
              site.id
            )
        ) {
          return true;
        }

        if (
          record.siteName &&
          site.name &&
          normalize(
            record.siteName
          ) ===
            normalize(
              site.name
            )
        ) {
          return true;
        }

        return false;
      };

      return sites.map(
        (site) => ({
          ...site,

          activeGuardsCount:
            guards.filter(
              (guard) =>
                belongsToSite(
                  guard,
                  site
                )
            ).length,

          checkpointsCount:
            checkpoints.filter(
              (
                checkpoint
              ) =>
                belongsToSite(
                  checkpoint,
                  site
                )
            ).length,

          incidentsCount:
            incidents.filter(
              (
                incident
              ) =>
                belongsToSite(
                  incident,
                  site
                )
            ).length,
        })
      );
    }, [
      sites,
      guards,
      checkpoints,
      incidents
    ]);

  // ─────────────────────────────────────────────
  // Site CRUD
  // ─────────────────────────────────────────────

  const handleAdd =
    async () => {
      if (
        !addForm.name.trim()
      ) {
        return;
      }

      setSaving(true);

      try {
        await addSite(
          addForm
        );

        setAddForm(
          EMPTY_SITE
        );

        setShowAdd(
          false
        );
      } finally {
        setSaving(
          false
        );
      }
    };

  const openEdit = (
    site,
    event
  ) => {
    if (event) {
      event.stopPropagation();
    }

    setSelectedSite(
      null
    );

    setEditForm({
      name:
        site.name || '',
      type:
        site.type ||
        'Commercial',
      client:
        site.client || '',

      clientId:
        site.clientId || '',
      address:
        site.address || '',
      status:
        site.status ||
        'Active',
      image:
        site.image || '',
      lat:
        site.lat ||
        null,
      lng:
        site.lng ||
        null
    });

    setEditTarget(
      site
    );
  };

  const handleEdit =
    async () => {
      if (
        !editTarget ||
        !editForm.name.trim()
      ) {
        return;
      }

      setSaving(true);

      try {
        await updateSite(
          editTarget.id,
          editForm
        );

        setEditTarget(
          null
        );
      } finally {
        setSaving(
          false
        );
      }
    };

  const handleDelete =
    async () => {
      if (
        !deleteTarget
      ) {
        return;
      }

      setSaving(true);

      try {
        await deleteSite(
          deleteTarget.id
        );

        addToast(
          'Site Removed',
          `${deleteTarget.name} was removed from deployment sites.`,
          'info'
        );

        setSelectedSite(
          null
        );

        setDeleteTarget(
          null
        );
      } catch (error) {
        console.error(
          'Unable to remove site:',
          error
        );

        addToast(
          'Unable to Remove Site',
          'The site could not be removed. Please try again.',
          'error'
        );
      } finally {
        setSaving(
          false
        );
      }
    };

  // ─────────────────────────────────────────────
  // Site checkpoints
  // ─────────────────────────────────────────────

  const siteCheckpoints =
    selectedSite
      ? checkpoints.filter(
          (cp) =>
            (cp.siteId &&
              String(
                cp.siteId
              ) ===
                String(
                  selectedSite.id
                )) ||
            (cp.siteName &&
              selectedSite.name &&
              String(
                cp.siteName
              )
                .trim()
                .toLowerCase() ===
                String(
                  selectedSite.name
                )
                  .trim()
                  .toLowerCase())
        )
      : [];

  const makeQrCode =
    () => {
      const random =
        globalThis.crypto
          ?.randomUUID
          ? globalThis.crypto
              .randomUUID()
              .replaceAll(
                '-',
                ''
              )
              .slice(
                0,
                12
              )
              .toUpperCase()
          : Math.random()
              .toString(36)
              .slice(
                2,
                14
              )
              .toUpperCase();

      return `SPOT-${
        selectedSite?.id ||
        'SITE'
      }-${random}`;
    };

  const resetQrForm =
    () => {
      setQrForm({
        name: '',
        area: '',
        lat: '',
        lng: '',
        assignedGuardIds:
          []
      });
    };

  const handleCreateQr =
    async () => {
      if (
        !selectedSite ||
        !qrForm.name.trim()
      ) {
        return;
      }

      setSaving(true);

      try {
        const assigned =
          guards.filter(
            (guard) =>
              qrForm.assignedGuardIds.includes(
                guard.id
              )
          );

        const qrCode =
          makeQrCode();

        const payload = {
          name:
            qrForm.name.trim(),

          siteId:
            selectedSite.id,

          siteName:
            selectedSite.name,

          clientId:
            selectedSite.clientId || '',

          client:
            selectedSite.client || '',

          area:
            qrForm.area.trim(),

          lat:
            Number.parseFloat(
              qrForm.lat
            ) ||
            selectedSite.lat ||
            0,

          lng:
            Number.parseFloat(
              qrForm.lng
            ) ||
            selectedSite.lng ||
            0,

          qrCode,

          qrPayload:
            qrCode,

          assignedGuardIds:
            assigned.map(
              (guard) =>
                guard.id
            ),

          assignedGuardNames:
            assigned.map(
              (guard) =>
                guard.name
            ),

          status:
            'Active',

          generatedAt:
            new Date().toISOString(),

          generatedFrom:
            'Site Management'
        };

        const id =
          await addItem(
            'checkpoints',
            payload
          );

        const created = {
          id,
          ...payload
        };

        setQrGeneratorOpen(
          false
        );

        resetQrForm();

        setQrPreview(
          created
        );

        addToast(
          'QR Checkpoint Generated',
          `${created.name} is ready at ${selectedSite.name}.`,
          'success'
        );
      } finally {
        setSaving(
          false
        );
      }
    };

  // ─────────────────────────────────────────────
  // Guard actions
  // ─────────────────────────────────────────────

  const openGuardActions =
    (guard) => {
      setGuardActionTarget(
        guard
      );
    };

  const openAssignQr =
    (guard) => {
      const currentlyAssigned =
        siteCheckpoints
          .filter(
            (cp) =>
              Array.isArray(
                cp.assignedGuardIds
              ) &&
              cp.assignedGuardIds.includes(
                guard.id
              )
          )
          .map(
            (cp) =>
              cp.id
          );

      setSelectedQrIds(
        currentlyAssigned
      );

      setAssignQrTarget(
        guard
      );

      setGuardActionTarget(
        null
      );
    };

  const handleSaveQrAssignments =
    async () => {
      if (
        !assignQrTarget
      ) {
        return;
      }

      setSaving(true);

      try {
        await Promise.all(
          siteCheckpoints.map(
            async (cp) => {
              const oldIds =
                Array.isArray(
                  cp.assignedGuardIds
                )
                  ? cp.assignedGuardIds
                  : [];

              const shouldAssign =
                selectedQrIds.includes(
                  cp.id
                );

              const nextIds =
                shouldAssign
                  ? Array.from(
                      new Set([
                        ...oldIds,
                        assignQrTarget.id
                      ])
                    )
                  : oldIds.filter(
                      (id) =>
                        id !==
                        assignQrTarget.id
                    );

              if (
                JSON.stringify(
                  [
                    ...oldIds
                  ].sort()
                ) ===
                JSON.stringify(
                  [
                    ...nextIds
                  ].sort()
                )
              ) {
                return;
              }

              const nextNames =
                guards
                  .filter(
                    (
                      guard
                    ) =>
                      nextIds.includes(
                        guard.id
                      )
                  )
                  .map(
                    (
                      guard
                    ) =>
                      guard.name
                  );

              await updateItem(
                'checkpoints',
                cp.id,
                {
                  assignedGuardIds:
                    nextIds,

                  assignedGuardNames:
                    nextNames,

                  assignmentUpdatedAt:
                    new Date().toISOString()
                }
              );
            }
          )
        );

        addToast(
          'QR Assignment Saved',
          `${assignQrTarget.name}'s checkpoint access has been updated.`,
          'success'
        );

        setAssignQrTarget(
          null
        );

        setSelectedQrIds(
          []
        );
      } finally {
        setSaving(
          false
        );
      }
    };

  // ─────────────────────────────────────────────
  // Move / transfer guard to another deployment site
  // ─────────────────────────────────────────────

  const normalizePatrolStatus =
    (value) =>
      String(value || '')
        .trim()
        .toUpperCase()
        .replace(/[\s-]+/g, '_');

  const isGuardOnActivePatrol =
    (guard, site) => {
      if (!guard || !site) {
        return false;
      }

      return patrols.some(
        (patrol) => {
          const sameGuard =
            String(
              patrol.guardId ||
                ''
            ) ===
            String(
              guard.id
            );

          const sameSite =
            (
              patrol.siteId &&
              String(
                patrol.siteId
              ) ===
              String(
                site.id
              )
            ) ||
            (
              patrol.siteName &&
              site.name &&
              String(
                patrol.siteName
              )
                .trim()
                .toLowerCase() ===
                String(
                  site.name
                )
                  .trim()
                  .toLowerCase()
            );

          const status =
            normalizePatrolStatus(
              patrol.status
            );

          return (
            sameGuard &&
            sameSite &&
            [
              'IN_PROGRESS',
              'ACTIVE',
              'ON_PATROL'
            ].includes(status)
          );
        }
      );
    };

  const openMoveGuard =
    (guard) => {
      const firstDestination =
        sites.find(
          (site) =>
            String(
              site.id
            ) !==
            String(
              selectedSite?.id
            ) &&
            String(
              site.status ||
                'Active'
            )
              .trim()
              .toLowerCase() !==
              'inactive'
        );

      setMoveGuardTarget(
        guard
      );

      setMoveGuardSiteId(
        firstDestination?.id ||
          ''
      );

      setMoveGuardReason(
        ''
      );

      setGuardActionTarget(
        null
      );
    };

  const handleMoveGuard =
    async () => {
      if (
        !moveGuardTarget ||
        !selectedSite ||
        !moveGuardSiteId
      ) {
        addToast(
          'Guard Transfer Not Saved',
          'Select a destination deployment site.',
          'danger'
        );
        return;
      }

      const destinationSite =
        sites.find(
          (site) =>
            String(
              site.id
            ) ===
            String(
              moveGuardSiteId
            )
        );

      if (!destinationSite) {
        addToast(
          'Guard Transfer Not Saved',
          'The selected destination site could not be found.',
          'danger'
        );
        return;
      }

      if (
        String(
          destinationSite.id
        ) ===
        String(
          selectedSite.id
        )
      ) {
        addToast(
          'Guard Transfer Not Saved',
          'Choose a different deployment site.',
          'danger'
        );
        return;
      }

      // Never change deployment while the guard is in the middle of a patrol.
      // This protects the active patrol, QR validation, and GPS tracking.
      if (
        isGuardOnActivePatrol(
          moveGuardTarget,
          selectedSite
        )
      ) {
        addToast(
          'Active Patrol In Progress',
          `${moveGuardTarget.name} must complete the current patrol at ${selectedSite.name} before being transferred.`,
          'danger'
        );
        return;
      }

      setSaving(
        true
      );

      try {
        const now =
          new Date().toISOString();

        const oldSiteId =
          selectedSite.id;

        const oldSiteName =
          selectedSite.name;

        // 1. Move the guard profile first.
        // Keep the same Firebase UID/account/face enrollment.
        await updateItem(
          'users',
          moveGuardTarget.id,
          {
            assignedSiteId:
              destinationSite.id,

            // Keep both names for compatibility with older code.
            siteId:
              destinationSite.id,

            siteName:
              destinationSite.name,

            clientId:
              destinationSite.clientId || '',

            client:
              destinationSite.client || '',

            previousSiteId:
              oldSiteId,

            previousSiteName:
              oldSiteName,

            deploymentUpdatedAt:
              now
          }
        );

        // 2. Disable old recurring patrol schedule(s).
        // Do not delete them — they remain useful as deployment history.
        const oldAssignments =
          rovingAssignments.filter(
            (assignment) =>
              String(
                assignment.guardId ||
                  ''
              ) ===
                String(
                  moveGuardTarget.id
                ) &&
              (
                String(
                  assignment.siteId ||
                    ''
                ) ===
                  String(
                    oldSiteId
                  ) ||
                (
                  assignment.siteName &&
                  oldSiteName &&
                  String(
                    assignment.siteName
                  )
                    .trim()
                    .toLowerCase() ===
                    String(
                      oldSiteName
                    )
                      .trim()
                      .toLowerCase()
                )
              )
          );

        await Promise.all(
          oldAssignments.map(
            (assignment) =>
              updateItem(
                'roving_assignments',
                assignment.id,
                {
                  status:
                    'Inactive',

                  endedAt:
                    now,

                  endedReason:
                    `Guard transferred to ${destinationSite.name}`,

                  updatedAt:
                    now
                }
              )
          )
        );

        // 3. Remove old-site QR responsibility.
        // New-site QR codes are intentionally NOT auto-assigned.
        const oldCheckpoints =
          checkpoints.filter(
            (checkpoint) =>
              (
                checkpoint.siteId &&
                String(
                  checkpoint.siteId
                ) ===
                  String(
                    oldSiteId
                  )
              ) ||
              (
                checkpoint.siteName &&
                oldSiteName &&
                String(
                  checkpoint.siteName
                )
                  .trim()
                  .toLowerCase() ===
                  String(
                    oldSiteName
                  )
                    .trim()
                    .toLowerCase()
              )
          );

        await Promise.all(
          oldCheckpoints.map(
            async (checkpoint) => {
              const oldIds =
                Array.isArray(
                  checkpoint.assignedGuardIds
                )
                  ? checkpoint.assignedGuardIds
                  : [];

              if (
                !oldIds.some(
                  (id) =>
                    String(
                      id
                    ) ===
                    String(
                      moveGuardTarget.id
                    )
                )
              ) {
                return;
              }

              const nextIds =
                oldIds.filter(
                  (id) =>
                    String(
                      id
                    ) !==
                    String(
                      moveGuardTarget.id
                    )
                );

              const nextNames =
                guards
                  .filter(
                    (guard) =>
                      nextIds.some(
                        (id) =>
                          String(
                            id
                          ) ===
                          String(
                            guard.id
                          )
                      )
                  )
                  .map(
                    (guard) =>
                      guard.name
                  );

              await updateItem(
                'checkpoints',
                checkpoint.id,
                {
                  assignedGuardIds:
                    nextIds,

                  assignedGuardNames:
                    nextNames,

                  assignmentUpdatedAt:
                    now
                }
              );
            }
          )
        );

        // 4. Add an immutable transfer/history record.
        await addItem(
          'guard_transfer_history',
          {
            guardId:
              moveGuardTarget.id,

            guardName:
              moveGuardTarget.name,

            fromSiteId:
              oldSiteId,

            fromSiteName:
              oldSiteName,

            toSiteId:
              destinationSite.id,

            toSiteName:
              destinationSite.name,

            fromClientId:
              selectedSite.clientId || moveGuardTarget.clientId || '',

            toClientId:
              destinationSite.clientId || '',

            clientId:
              destinationSite.clientId || '',

            reason:
              String(
                moveGuardReason ||
                  ''
              ).trim(),

            status:
              'Completed',

            transferredAt:
              now,

            source:
              'supervisor-web'
          }
        );

        addToast(
          'Guard Transferred',
          `${moveGuardTarget.name} moved from ${oldSiteName} to ${destinationSite.name}. Assign the new site's QR checkpoints and patrol times next.`,
          'success'
        );

        setMoveGuardTarget(
          null
        );

        setMoveGuardSiteId(
          ''
        );

        setMoveGuardReason(
          ''
        );

      } catch (
        error
      ) {
        console.error(
          'Guard transfer failed:',
          error
        );

        addToast(
          'Guard Transfer Failed',
          error?.message ||
            'Unable to move the guard to the selected site.',
          'danger'
        );

      } finally {
        setSaving(
          false
        );
      }
    };

  // ─────────────────────────────────────────────
  // Patrol times
  // ─────────────────────────────────────────────

  const openRovingTime =
    (guard) => {
      const existing =
        rovingAssignments.find(
          (assignment) =>
            assignment.guardId ===
              guard.id &&
            (assignment.siteId ===
              selectedSite?.id ||
              assignment.siteName ===
                selectedSite?.name)
        );

      let existingTimes =
        Array.isArray(
          existing?.patrolTimes
        )
          ? existing.patrolTimes.filter(
              Boolean
            )
          : [];

      if (
        existingTimes.length ===
        0
      ) {
        if (
          existing?.startTime
        ) {
          existingTimes.push(
            existing.startTime
          );
        }

        if (
          existing?.endTime &&
          existing.endTime !==
            existing.startTime
        ) {
          existingTimes.push(
            existing.endTime
          );
        }
      }

      setRovingForm({
        patrolTimes:
          existingTimes.length
            ? existingTimes
            : ['19:00'],

        days:
          Array.isArray(
            existing?.days
          ) &&
          existing.days.length
            ? existing.days
            : [
                'Mon',
                'Tue',
                'Wed',
                'Thu',
                'Fri',
                'Sat',
                'Sun'
              ],

        notes:
          existing?.notes ||
          ''
      });

      setRovingTarget(
        guard
      );

      setGuardActionTarget(
        null
      );
    };

  const addRovingPatrolTime =
    () => {
      setRovingForm(
        (previous) => ({
          ...previous,
          patrolTimes: [
            ...previous.patrolTimes,
            '20:00'
          ]
        })
      );
    };

  const updateRovingPatrolTime =
    (
      index,
      value
    ) => {
      setRovingForm(
        (previous) => ({
          ...previous,

          patrolTimes:
            previous.patrolTimes.map(
              (
                time,
                currentIndex
              ) =>
                currentIndex ===
                index
                  ? value
                  : time
            )
        })
      );
    };

  const removeRovingPatrolTime =
    (index) => {
      setRovingForm(
        (previous) => ({
          ...previous,

          patrolTimes:
            previous.patrolTimes.filter(
              (
                _,
                currentIndex
              ) =>
                currentIndex !==
                index
            )
        })
      );
    };

  const handleSaveRovingTime =
    async () => {
      if (
        !rovingTarget ||
        !selectedSite
      ) {
        addToast(
          'Patrol Schedule Not Saved',
          'Guard or deployment site information is missing.',
          'danger'
        );
        return;
      }

      const normalizedTimes =
        Array.from(
          new Set(
            (rovingForm.patrolTimes || [])
              .map(
                (time) =>
                  String(
                    time ||
                      ''
                  ).trim()
              )
              .filter(
                Boolean
              )
          )
        ).sort();

      if (
        normalizedTimes.length ===
        0
      ) {
        addToast(
          'Patrol Schedule Not Saved',
          'Add at least one patrol time.',
          'danger'
        );
        return;
      }

      if (
        !Array.isArray(
          rovingForm.days
        ) ||
        rovingForm.days.length ===
        0
      ) {
        addToast(
          'Patrol Schedule Not Saved',
          'Select at least one patrol day.',
          'danger'
        );
        return;
      }

      setSaving(
        true
      );

      try {
        const payload = {
          guardId:
            rovingTarget.id,

          guardName:
            rovingTarget.name,

          siteId:
            selectedSite.id,

          siteName:
            selectedSite.name,

          clientId:
            selectedSite.clientId || rovingTarget.clientId || '',

          client:
            selectedSite.client || rovingTarget.client || '',

          // Official recurring patrol entries.
          patrolTimes:
            normalizedTimes,

          // Compatibility fields for older Android builds.
          startTime:
            normalizedTimes[0],

          endTime:
            normalizedTimes[
              normalizedTimes.length -
                1
            ],

          days:
            [...rovingForm.days],

          notes:
            String(
              rovingForm.notes ||
                ''
            ).trim(),

          status:
            'Active',

          updatedAt:
            new Date().toISOString()
        };

        const existing =
          rovingAssignments.find(
            (assignment) =>
              String(
                assignment.guardId ||
                  ''
              ) ===
                String(
                  rovingTarget.id
                ) &&
              (
                String(
                  assignment.siteId ||
                    ''
                ) ===
                  String(
                    selectedSite.id
                  ) ||
                (
                  assignment.siteName &&
                  selectedSite.name &&
                  String(
                    assignment.siteName
                  )
                    .trim()
                    .toLowerCase() ===
                    String(
                      selectedSite.name
                    )
                      .trim()
                      .toLowerCase()
                )
              )
          );

        if (
          existing?.id
        ) {
          await updateItem(
            'roving_assignments',
            existing.id,
            payload
          );
        } else {
          // Use a stable document ID for new schedules.
          // This prevents duplicate patrol schedules for the same
          // guard + site if the realtime list has not refreshed yet.
          const stableScheduleId =
            `${selectedSite.id}__${rovingTarget.id}`;

          await setItem(
            'roving_assignments',
            stableScheduleId,
            {
              ...payload,
              createdAt:
                new Date().toISOString()
            }
          );
        }

        addToast(
          'Patrol Times Saved',
          `${rovingTarget.name}: ${normalizedTimes.join(', ')} at ${selectedSite.name}.`,
          'success'
        );

        setRovingTarget(
          null
        );

      } catch (
        error
      ) {
        console.error(
          'Failed to save patrol schedule:',
          error
        );

        const message =
          error?.code ===
          'permission-denied'
            ? 'Firestore denied this write. Make sure the logged-in web account has a supervisor/admin role and the latest rules are published.'
            : (
                error?.message ||
                'Unable to save the patrol schedule.'
              );

        addToast(
          'Patrol Schedule Save Failed',
          message,
          'danger'
        );

      } finally {
        setSaving(
          false
        );
      }
    };

  const toggleQrForGuard =
    (checkpointId) => {
      setSelectedQrIds(
        (previous) =>
          previous.includes(
            checkpointId
          )
            ? previous.filter(
                (id) =>
                  id !==
                  checkpointId
              )
            : [
                ...previous,
                checkpointId
              ]
      );
    };

  const toggleRovingDay =
    (day) => {
      setRovingForm(
        (previous) => ({
          ...previous,

          days:
            previous.days.includes(
              day
            )
              ? previous.days.filter(
                  (
                    currentDay
                  ) =>
                    currentDay !==
                    day
                )
              : [
                  ...previous.days,
                  day
                ]
        })
      );
    };

  // ─────────────────────────────────────────────
  // Selected site data
  // ─────────────────────────────────────────────

  const assignedGuards =
    selectedSite
      ? guards.filter(
          (guard) =>
            (guard.siteId &&
              String(
                guard.siteId
              ) ===
                String(
                  selectedSite.id
                )) ||
            (guard.assignedSiteId &&
              String(
                guard.assignedSiteId
              ) ===
                String(
                  selectedSite.id
                )) ||
            (guard.siteName &&
              selectedSite.name &&
              String(
                guard.siteName
              )
                .trim()
                .toLowerCase() ===
                String(
                  selectedSite.name
                )
                  .trim()
                  .toLowerCase())
        )
      : [];

  const siteIncidents =
    selectedSite
      ? incidents.filter(
          (incident) =>
            (incident.siteId &&
              String(
                incident.siteId
              ) ===
                String(
                  selectedSite.id
                )) ||
            (incident.siteName &&
              selectedSite.name &&
              String(
                incident.siteName
              )
                .trim()
                .toLowerCase() ===
                String(
                  selectedSite.name
                )
                  .trim()
                  .toLowerCase())
        )
      : [];

  const getIncidentTime =
    (incident) => {
      const value =
        incident?.createdAt ||
        incident?.reportedAt ||
        incident?.timestamp ||
        incident?.date;

      if (!value) {
        return 0;
      }

      if (
        typeof value?.toDate ===
        'function'
      ) {
        return value
          .toDate()
          .getTime();
      }

      if (
        typeof value?.seconds ===
        'number'
      ) {
        return (
          value.seconds *
          1000
        );
      }

      const parsed =
        new Date(
          value
        ).getTime();

      return Number.isNaN(
        parsed
      )
        ? 0
        : parsed;
    };

  const formatIncidentDate =
    (incident) => {
      const time =
        getIncidentTime(
          incident
        );

      if (!time) {
        return 'No timestamp available';
      }

      return new Date(
        time
      ).toLocaleString(
        'en-PH',
        {
          year:
            'numeric',
          month:
            'short',
          day:
            'numeric',
          hour:
            'numeric',
          minute:
            '2-digit'
        }
      );
    };

  const sortedSiteIncidents =
    [
      ...siteIncidents
    ].sort(
      (a, b) =>
        getIncidentTime(
          b
        ) -
        getIncidentTime(
          a
        )
    );

  return (
    <Layout
      title="Deployment Sites Management"
      subtitle="Categorized Facility Profiles, Live Map Pinning & Guard Allocation"
    >
      <div className="space-y-6">

        {/* PAGE HEADER */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">

            <span className="text-xs text-slate-400">
              <span className="text-white font-bold">
                {sites.length}
              </span>{' '}
              sites registered

              {sites.filter(
                (site) =>
                  site.lat &&
                  site.lng
              ).length > 0 && (
                <span className="ml-2 text-emerald-400">
                  •{' '}
                  <span className="font-bold">
                    {
                      sites.filter(
                        (
                          site
                        ) =>
                          site.lat &&
                          site.lng
                      ).length
                    }
                  </span>{' '}
                  pinned on map
                </span>
              )}
            </span>

            <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800 text-xs">
              <button
                type="button"
                onClick={() =>
                  setViewMode(
                    'grid'
                  )
                }
                className={`px-3 py-1.5 rounded-lg font-semibold transition ${
                  viewMode ===
                  'grid'
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Grid View
              </button>

              <button
                type="button"
                onClick={() =>
                  setViewMode(
                    'map'
                  )
                }
                className={`px-3 py-1.5 rounded-lg font-semibold transition ${
                  viewMode ===
                  'map'
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Map View
              </button>
            </div>
          </div>

          <button
            type="button"
            onClick={() =>
              setShowAdd(true)
            }
            className="btn-primary text-xs flex items-center gap-2"
          >
            <Plus className="h-4 w-4" />
            Add Site
          </button>
        </div>

        {/* MAP VIEW */}
        {viewMode ===
          'map' && (
          <AllSitesMap
            sites={
              sitesWithLiveCounts
            }
            onSiteClick={
              setSelectedSite
            }
          />
        )}

        {/* EMPTY / GRID */}
        {sites.length ===
        0 ? (
          <div className="card-spot py-20 flex flex-col items-center gap-4">
            <div className="p-4 rounded-2xl bg-slate-800/60 border border-slate-700">
              <Building2 className="h-8 w-8 text-slate-500" />
            </div>

            <div className="text-sm font-semibold text-slate-400">
              No deployment sites registered
            </div>

            <div className="text-xs text-slate-500">
              Click "Add Site" to register a new deployment facility.
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">

            {sitesWithLiveCounts.map(
              (site) => (
                <div
                  key={
                    site.id
                  }
                  onClick={() =>
                    setSelectedSite(
                      site
                    )
                  }
                  className="card-spot p-0 overflow-hidden cursor-pointer transition-all duration-200 hover:-translate-y-1 hover:border-blue-500/60 flex flex-col justify-between group"
                >
                  <div>
                    <div className="relative h-44 w-full overflow-hidden">

                      <img
                        src={
                          site.image ||
                          'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&w=500&q=80'
                        }
                        alt={
                          site.name
                        }
                        className="h-full w-full object-cover transition-transform duration-500 hover:scale-105"
                      />

                      <div className="absolute inset-0 bg-gradient-to-t from-[#1E293B] via-transparent to-transparent" />

                      <span className="absolute top-3 right-3 rounded-full bg-slate-900/80 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-blue-400 border border-slate-700 backdrop-blur-md">
                        {
                          site.type
                        }
                      </span>

                      {site.lat &&
                        site.lng && (
                          <span className="absolute bottom-3 left-3 flex items-center gap-1 rounded-full bg-blue-600/80 px-2 py-0.5 text-[10px] font-bold text-white backdrop-blur-sm">
                            <Navigation className="h-2.5 w-2.5" />
                            Pinned
                          </span>
                        )}

                      <div className="absolute top-3 left-3 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">

                        <button
                          type="button"
                          onClick={(
                            event
                          ) =>
                            openEdit(
                              site,
                              event
                            )
                          }
                          title="Edit Site"
                          className="p-1.5 rounded-lg bg-amber-500/90 hover:bg-amber-400 text-slate-900 shadow-lg transition"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>

                        <button
                          type="button"
                          onClick={(
                            event
                          ) => {
                            event.stopPropagation();

                            setDeleteTarget(
                              site
                            );
                          }}
                          title="Remove Site"
                          className="p-1.5 rounded-lg bg-rose-600/90 hover:bg-rose-500 text-white shadow-lg transition"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="p-5">
                      <div className="flex items-start justify-between gap-2">

                        <h3 className="text-base font-bold text-white leading-tight">
                          {
                            site.name
                          }
                        </h3>

                        <span
                          className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                            site.status ===
                            'Active'
                              ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                              : site.status ===
                                  'Inactive'
                                ? 'bg-slate-800 text-slate-400 border-slate-700'
                                : 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                          }`}
                        >
                          {
                            site.status
                          }
                        </span>
                      </div>

                      <p className="mt-1 text-xs text-slate-400 flex items-center gap-1">
                        <MapPin className="h-3.5 w-3.5 text-blue-400 shrink-0" />

                        {site.address ||
                          'No address set'}
                      </p>

                      <div className="mt-1 text-xs text-slate-500">
                        {
                          site.client
                        }
                      </div>

                      <div className="mt-4 grid grid-cols-3 gap-2 text-center">

                        <div className="p-2 rounded-xl bg-slate-900/60 border border-slate-800">
                          <div className="text-[10px] text-slate-400">
                            Guards
                          </div>

                          <div className="text-sm font-bold text-white mt-0.5">
                            {
                              site.activeGuardsCount
                            }
                          </div>
                        </div>

                        <div className="p-2 rounded-xl bg-slate-900/60 border border-slate-800">
                          <div className="text-[10px] text-slate-400">
                            Checkpoints
                          </div>

                          <div className="text-sm font-bold text-emerald-400 mt-0.5">
                            {
                              site.checkpointsCount
                            }
                          </div>
                        </div>

                        <div className="p-2 rounded-xl bg-slate-900/60 border border-slate-800">
                          <div className="text-[10px] text-slate-400">
                            Incidents
                          </div>

                          <div className="text-sm font-bold text-rose-400 mt-0.5">
                            {
                              site.incidentsCount
                            }
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="px-5 py-3 border-t border-slate-800 flex items-center justify-between text-xs text-blue-400 font-semibold">
                    <span>
                      Inspect Facility & Guards
                    </span>

                    <span>
                      →
                    </span>
                  </div>
                </div>
              )
            )}
          </div>
        )}
      </div>

      {/* ─────────────────────────────────────────────────
          SITE DETAILS
      ───────────────────────────────────────────────── */}

      {selectedSite && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">

          <div className="w-full max-w-3xl overflow-hidden rounded-2xl border border-slate-700 bg-[#1E293B] shadow-2xl">

            <div className="flex items-center justify-between border-b border-slate-800 p-5">

              <div>
                <span className="text-xs font-mono text-blue-400">
                  {selectedSite.id} • {selectedSite.type}
                </span>

                <h3 className="text-lg font-bold text-white">
                  {
                    selectedSite.name
                  }
                </h3>
              </div>

              <div className="flex items-center gap-2">

                <button
                  type="button"
                  onClick={() =>
                    openEdit(
                      selectedSite
                    )
                  }
                  className="rounded-xl border border-amber-700/50 bg-amber-500/10 p-2 text-amber-400 hover:text-white transition"
                  title="Edit Site"
                >
                  <Pencil className="h-4 w-4" />
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const siteToDelete =
                      selectedSite;

                    setSelectedSite(
                      null
                    );

                    setDeleteTarget(
                      siteToDelete
                    );
                  }}
                  className="rounded-xl border border-rose-700/50 bg-rose-500/10 p-2 text-rose-400 hover:text-white transition"
                  title="Remove Site"
                >
                  <Trash2 className="h-4 w-4" />
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setSiteIncidentsOpen(
                      false
                    );

                    setSelectedSite(
                      null
                    );
                  }}
                  className="rounded-xl border border-slate-700 bg-slate-800 p-2 text-slate-400 hover:text-white"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="p-6 space-y-5 max-h-[80vh] overflow-y-auto custom-scrollbar">

              {/* MAP */}
              <div>
                <div className="flex items-center gap-2 mb-2">

                  <Navigation className="h-4 w-4 text-blue-400" />

                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Live Location Map
                  </span>

                  {selectedSite.lat &&
                  selectedSite.lng ? (
                    <span className="text-[10px] text-emerald-400 font-semibold ml-auto">
                      ● GPS Coordinates Available
                    </span>
                  ) : (
                    <span className="text-[10px] text-amber-400 font-semibold ml-auto">
                      ⚠ No GPS Coordinates — Edit to Add
                    </span>
                  )}
                </div>

                <SiteMapView
                  site={
                    selectedSite
                  }
                />

                {selectedSite.lat &&
                  selectedSite.lng && (
                    <div className="mt-2 flex items-center gap-2 text-[10px] font-mono text-slate-500">

                      <MapPin className="h-3 w-3 text-blue-400" />

                      {Number(
                        selectedSite.lat
                      ).toFixed(5)}
                      ,{' '}
                      {Number(
                        selectedSite.lng
                      ).toFixed(5)}
                    </div>
                  )}
              </div>

              {/* OVERVIEW */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">

                <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 text-center">
                  <div className="text-[10px] text-slate-400">
                    Guards
                  </div>

                  <div className="text-xl font-bold mt-0.5 text-white">
                    {
                      assignedGuards.length
                    }
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 text-center">
                  <div className="text-[10px] text-slate-400">
                    Checkpoints
                  </div>

                  <div className="text-xl font-bold mt-0.5 text-emerald-400">
                    {
                      siteCheckpoints.length
                    }
                  </div>
                </div>

                <button
                  type="button"
                  onClick={(
                    event
                  ) => {
                    event.preventDefault();
                    event.stopPropagation();

                    setSiteIncidentsOpen(
                      true
                    );
                  }}
                  className="relative z-10 p-3 rounded-xl bg-slate-900/60 border border-rose-500/30 text-center cursor-pointer transition-all hover:bg-rose-500/10 hover:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-500/50"
                  title={`View ${siteIncidents.length} incident report${siteIncidents.length === 1 ? '' : 's'} for ${selectedSite.name}`}
                >
                  <div className="text-[10px] text-slate-400">
                    Incidents
                  </div>

                  <div className="text-xl font-bold mt-0.5 text-rose-400">
                    {
                      siteIncidents.length
                    }
                  </div>

                  <div className="mt-1 text-[9px] font-semibold text-rose-400">
                    View Logs →
                  </div>
                </button>

                <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 text-center">
                  <div className="text-[10px] text-slate-400">
                    Routes
                  </div>

                  <div className="text-xl font-bold mt-0.5 text-blue-400">
                    {selectedSite.routesCount ||
                      0}
                  </div>
                </div>
              </div>

              {/* SITE INFO */}
              <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2 text-xs">

                <div className="flex justify-between">
                  <span className="text-slate-400">
                    Client Organization:
                  </span>

                  <span className="font-bold text-white">
                    {selectedSite.client ||
                      'Not specified'}
                  </span>
                </div>

                <div className="flex justify-between">
                  <span className="text-slate-400">
                    Security Status:
                  </span>

                  <span
                    className={`font-bold ${
                      selectedSite.status ===
                      'Active'
                        ? 'text-emerald-400'
                        : 'text-slate-400'
                    }`}
                  >
                    {
                      selectedSite.status
                    }
                  </span>
                </div>

                <div className="flex justify-between">
                  <span className="text-slate-400">
                    Address:
                  </span>

                  <span className="font-bold text-white text-right max-w-[60%]">
                    {selectedSite.address ||
                      'No address'}
                  </span>
                </div>
              </div>

              {/* QR MANAGEMENT */}
              <div className="rounded-2xl border border-slate-800 bg-slate-900/35 p-4">

                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">

                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                      <QrCode className="h-4 w-4 text-emerald-400" />
                      QR Checkpoint Management
                    </h4>

                    <p className="mt-1 text-[11px] text-slate-500">
                      Generate site-specific QR checkpoints and control which deployed guards are assigned to each code.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      setQrGeneratorOpen(
                        true
                      )
                    }
                    className="btn-primary text-xs flex items-center gap-2 shrink-0"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Generate QR
                  </button>
                </div>

                <div className="mt-4 space-y-2">

                  {siteCheckpoints
                    .slice()
                    .sort(
                      (
                        a,
                        b
                      ) =>
                        String(
                          b.generatedAt ||
                            ''
                        ).localeCompare(
                          String(
                            a.generatedAt ||
                              ''
                          )
                        )
                    )
                    .map(
                      (
                        cp
                      ) => (
                        <div
                          key={
                            cp.id
                          }
                          className="flex flex-col gap-3 rounded-xl border border-slate-800 bg-slate-950/35 p-3 sm:flex-row sm:items-center"
                        >
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-emerald-500/25 bg-emerald-500/10 text-emerald-400">
                            <QrCode className="h-5 w-5" />
                          </div>

                          <div className="min-w-0 flex-1">

                            <div className="flex flex-wrap items-center gap-2">

                              <span className="text-xs font-bold text-white">
                                {cp.name ||
                                  'Checkpoint'}
                              </span>

                              <span className="rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-[9px] font-bold text-emerald-400">
                                {cp.status ||
                                  'Active'}
                              </span>
                            </div>

                            <div className="mt-1 truncate font-mono text-[10px] text-slate-500">
                              {
                                cp.qrCode
                              }
                            </div>

                            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-slate-500">

                              <span className="flex items-center gap-1">
                                <UserCheck className="h-3 w-3 text-blue-400" />

                                {(cp.assignedGuardIds ||
                                  [])
                                  .length}{' '}
                                guard
                                {(cp.assignedGuardIds ||
                                  [])
                                  .length ===
                                1
                                  ? ''
                                  : 's'}{' '}
                                assigned
                              </span>

                              {cp.area && (
                                <span className="flex items-center gap-1">
                                  <MapPinned className="h-3 w-3 text-slate-500" />

                                  {
                                    cp.area
                                  }
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="flex shrink-0 gap-2">

                            <button
                              type="button"
                              onClick={() =>
                                setQrPreview(
                                  cp
                                )
                              }
                              className="btn-secondary px-3 py-2 text-[10px] flex items-center gap-1.5"
                            >
                              <Eye className="h-3.5 w-3.5" />
                              View
                            </button>

                            <button
                              type="button"
                              onClick={async () => {
                                if (
                                  !confirm(
                                    `Delete QR checkpoint ${cp.name}?`
                                  )
                                ) {
                                  return;
                                }

                                await removeItem(
                                  'checkpoints',
                                  cp.id
                                );

                                addToast(
                                  'QR Checkpoint Removed',
                                  `${cp.name} was removed from ${selectedSite.name}.`,
                                  'info'
                                );
                              }}
                              className="rounded-xl border border-rose-700/40 bg-rose-500/10 px-3 py-2 text-[10px] font-bold text-rose-400 hover:bg-rose-500/20"
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      )
                    )}

                  {siteCheckpoints.length ===
                    0 && (
                    <div className="rounded-xl border border-dashed border-slate-700 py-5 text-center">

                      <History className="mx-auto h-5 w-5 text-slate-600" />

                      <div className="mt-2 text-xs font-semibold text-slate-400">
                        No QR checkpoints generated for this site yet.
                      </div>

                      <div className="mt-1 text-[10px] text-slate-600">
                        Generated QR codes will remain listed here as the site's QR history.
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* ASSIGNED GUARDS */}
              <div>

                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-2">
                  <Users className="h-4 w-4 text-blue-400" />
                  Assigned Guards at Facility
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

                  {assignedGuards.map(
                    (guard) => {
                      const assignedQrCount =
                        siteCheckpoints.filter(
                          (cp) =>
                            Array.isArray(
                              cp.assignedGuardIds
                            ) &&
                            cp.assignedGuardIds.includes(
                              guard.id
                            )
                        ).length;

                      const roving =
                        rovingAssignments.find(
                          (
                            assignment
                          ) =>
                            assignment.guardId ===
                              guard.id &&
                            (assignment.siteId ===
                              selectedSite.id ||
                              assignment.siteName ===
                                selectedSite.name)
                        );

                      return (
                        <button
                          type="button"
                          key={
                            guard.id
                          }
                          onClick={() =>
                            openGuardActions(
                              guard
                            )
                          }
                          className="flex w-full items-center gap-3 rounded-xl border border-slate-800 bg-slate-900/40 p-3 text-left text-xs transition hover:border-blue-500/40 hover:bg-slate-900/70"
                        >

                          <GuardAvatar
                            photo={
                              guard.photo
                            }
                            name={
                              guard.name
                            }
                            size="h-9 w-9"
                          />

                          <div className="flex-1 min-w-0">

                            <div className="font-bold text-white truncate">
                              {
                                guard.name
                              }
                            </div>

                            <div className="text-slate-400">
                              {guard.shift ||
                                'Shift not set'}
                            </div>

                            <div className="mt-1 flex flex-wrap gap-2 text-[9px] text-slate-500">

                              <span>
                                {
                                  assignedQrCount
                                }{' '}
                                QR assigned
                              </span>

                              {roving && (
                                <span className="text-blue-400">
                                  Patrols:{' '}
                                  {(Array.isArray(
                                    roving.patrolTimes
                                  ) &&
                                  roving
                                    .patrolTimes
                                    .length
                                    ? roving.patrolTimes
                                    : [
                                        roving.startTime,
                                        roving.endTime
                                      ].filter(
                                        Boolean
                                      )
                                  ).join(
                                    ', '
                                  )}
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">

                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-bold border ${
                                guard.status ===
                                'On Patrol'
                                  ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                                  : 'bg-slate-800 text-slate-400 border-slate-700'
                              }`}
                            >
                              {guard.status ||
                                'Idle'}
                            </span>

                            <ChevronRight className="h-4 w-4 text-slate-600" />
                          </div>
                        </button>
                      );
                    }
                  )}

                  {assignedGuards.length ===
                    0 && (
                    <div className="col-span-2 text-xs text-slate-500 text-center py-4">
                      No guards currently assigned to this site.
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* SITE DETAILS FOOTER */}
            <div className="p-4 border-t border-slate-800 flex flex-wrap justify-end gap-3">

              <button
                type="button"
                onClick={() => {
                  const siteToDelete =
                    selectedSite;

                  setSiteIncidentsOpen(
                    false
                  );

                  setSelectedSite(
                    null
                  );

                  setDeleteTarget(
                    siteToDelete
                  );
                }}
                className="flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2 text-xs font-bold text-rose-400 transition hover:border-rose-500/50 hover:bg-rose-500/20"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Remove Site
              </button>

              <button
                type="button"
                onClick={() =>
                  openEdit(
                    selectedSite
                  )
                }
                className="btn-secondary text-xs flex items-center gap-2"
              >
                <Pencil className="h-3.5 w-3.5" />
                Edit Site
              </button>

              <button
                type="button"
                onClick={() => {
                  setSiteIncidentsOpen(
                    false
                  );

                  setSelectedSite(
                    null
                  );
                }}
                className="btn-secondary text-xs"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────
          SITE INCIDENT LOGS
      ───────────────────────────────────────────────── */}

      {siteIncidentsOpen &&
        selectedSite && (
          <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md">

            <div className="w-full max-w-3xl overflow-hidden rounded-2xl border border-slate-700 bg-[#1E293B] shadow-2xl">

              <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">

                <div className="flex items-center gap-3">

                  <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-rose-500/30 bg-rose-500/10">
                    <AlertTriangle className="h-5 w-5 text-rose-400" />
                  </div>

                  <div>
                    <h3 className="text-base font-bold text-white">
                      Site Incident Logs
                    </h3>

                    <p className="mt-0.5 text-xs text-slate-400">
                      {
                        selectedSite.name
                      }

                      <span className="mx-2 text-slate-600">
                        •
                      </span>

                      {
                        siteIncidents.length
                      }{' '}
                      report
                      {siteIncidents.length ===
                      1
                        ? ''
                        : 's'}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    setSiteIncidentsOpen(
                      false
                    )
                  }
                  className="rounded-xl border border-slate-700 bg-slate-800 p-2 text-slate-400 transition hover:bg-slate-700 hover:text-white"
                  title="Close incident logs"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="max-h-[70vh] overflow-y-auto p-6 custom-scrollbar">

                {sortedSiteIncidents.length >
                0 ? (
                  <div className="space-y-3">

                    {sortedSiteIncidents.map(
                      (
                        incident
                      ) => {
                        const priority =
                          incident.priority ||
                          incident.severity ||
                          'Normal';

                        const status =
                          incident.status ||
                          'Submitted';

                        const guardName =
                          incident.guardName ||
                          incident.reporterName ||
                          incident.guard ||
                          'Unknown Guard';

                        const description =
                          incident.description ||
                          incident.details ||
                          incident.message ||
                          'No description was provided.';

                        const location =
                          incident.location ||
                          incident.area ||
                          incident.checkpointName ||
                          incident.checkpoint ||
                          '';

                        const title =
                          incident.title ||
                          incident.type ||
                          incident.category ||
                          'Guard Incident Report';

                        const normalizedPriority =
                          String(
                            priority
                          ).toLowerCase();

                        const normalizedStatus =
                          String(
                            status
                          ).toLowerCase();

                        return (
                          <div
                            key={
                              incident.id
                            }
                            className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 transition hover:border-slate-700"
                          >

                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">

                              <div className="min-w-0">

                                <div className="flex flex-wrap items-center gap-2">

                                  <h4 className="text-sm font-bold text-white">
                                    {
                                      title
                                    }
                                  </h4>

                                  <span
                                    className={`rounded-full border px-2 py-0.5 text-[9px] font-bold ${
                                      normalizedPriority ===
                                        'high' ||
                                      normalizedPriority ===
                                        'critical' ||
                                      normalizedPriority ===
                                        'emergency'
                                        ? 'border-rose-500/30 bg-rose-500/10 text-rose-400'
                                        : normalizedPriority ===
                                            'medium'
                                          ? 'border-amber-500/30 bg-amber-500/10 text-amber-400'
                                          : 'border-blue-500/30 bg-blue-500/10 text-blue-400'
                                    }`}
                                  >
                                    {
                                      priority
                                    }
                                  </span>

                                  <span
                                    className={`rounded-full border px-2 py-0.5 text-[9px] font-bold ${
                                      normalizedStatus ===
                                        'resolved' ||
                                      normalizedStatus ===
                                        'closed'
                                        ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                                        : normalizedStatus ===
                                              'investigating' ||
                                            normalizedStatus ===
                                              'in progress'
                                          ? 'border-amber-500/30 bg-amber-500/10 text-amber-400'
                                          : 'border-slate-700 bg-slate-800 text-slate-400'
                                    }`}
                                  >
                                    {
                                      status
                                    }
                                  </span>
                                </div>

                                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-slate-400">

                                  <span className="flex items-center gap-1">
                                    <Users className="h-3 w-3 text-blue-400" />

                                    Submitted by:

                                    <span className="font-semibold text-white">
                                      {
                                        guardName
                                      }
                                    </span>
                                  </span>

                                  <span className="flex items-center gap-1">
                                    <Clock3 className="h-3 w-3 text-blue-400" />

                                    {formatIncidentDate(
                                      incident
                                    )}
                                  </span>
                                </div>
                              </div>

                              <AlertTriangle className="h-5 w-5 shrink-0 text-rose-500" />
                            </div>

                            <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/50 p-3">

                              <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                                Incident Description
                              </div>

                              <p className="whitespace-pre-wrap text-xs leading-relaxed text-slate-300">
                                {
                                  description
                                }
                              </p>
                            </div>

                            {location && (
                              <div className="mt-3 flex items-center gap-2 text-[10px] text-slate-400">

                                <MapPin className="h-3 w-3 text-blue-400" />

                                <span>
                                  Location:
                                </span>

                                <span className="font-semibold text-slate-300">
                                  {
                                    location
                                  }
                                </span>
                              </div>
                            )}

                            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-800 pt-3">

                              <span className="font-mono text-[9px] text-slate-600">
                                Report ID:{' '}
                                {
                                  incident.id
                                }
                              </span>

                              {incident.source && (
                                <span className="text-[9px] text-slate-500">
                                  Source:{' '}
                                  {
                                    incident.source
                                  }
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      }
                    )}
                  </div>
                ) : (
                  <div className="py-14 text-center">

                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl border border-slate-800 bg-slate-900">
                      <ShieldCheck className="h-6 w-6 text-emerald-400" />
                    </div>

                    <h4 className="mt-4 text-sm font-bold text-white">
                      No Incidents Reported
                    </h4>

                    <p className="mt-1 text-xs text-slate-500">
                      No guards have submitted an incident report for{' '}
                      {
                        selectedSite.name
                      }.
                    </p>
                  </div>
                )}
              </div>

              <div className="flex justify-end border-t border-slate-800 px-6 py-4">
                <button
                  type="button"
                  onClick={() =>
                    setSiteIncidentsOpen(
                      false
                    )
                  }
                  className="btn-secondary text-xs"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

      {/* ─────────────────────────────────────────────────
          QR GENERATOR
      ───────────────────────────────────────────────── */}

      {qrGeneratorOpen &&
        selectedSite && (
          <Modal
            title="Generate QR Checkpoint"
            subtitle={`${selectedSite.name} — Create a physical scan point and optionally assign guards now`}
            wide
            onClose={() => {
              setQrGeneratorOpen(
                false
              );

              resetQrForm();
            }}
            footer={
              <>
                <button
                  type="button"
                  onClick={() => {
                    setQrGeneratorOpen(
                      false
                    );

                    resetQrForm();
                  }}
                  className="btn-secondary text-xs"
                >
                  Cancel
                </button>

                <button
                  type="button"
                  onClick={
                    handleCreateQr
                  }
                  disabled={
                    saving ||
                    !qrForm.name.trim()
                  }
                  className="btn-primary text-xs flex items-center gap-2"
                >
                  {saving ? (
                    <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  ) : (
                    <QrCode className="h-3.5 w-3.5" />
                  )}

                  Generate QR
                </button>
              </>
            }
          >
            {/* FLOOR / LEVEL REMOVED */}

            <Field label="Checkpoint Name *">
              <input
                className="input-spot"
                value={
                  qrForm.name
                }
                onChange={(
                  event
                ) =>
                  setQrForm(
                    (
                      previous
                    ) => ({
                      ...previous,

                      name:
                        event
                          .target
                          .value
                    })
                  )
                }
                placeholder="e.g. Main Entrance"
              />
            </Field>

            <Field label="Area / Location Description">
              <input
                className="input-spot"
                value={
                  qrForm.area
                }
                onChange={(
                  event
                ) =>
                  setQrForm(
                    (
                      previous
                    ) => ({
                      ...previous,

                      area:
                        event
                          .target
                          .value
                    })
                  )
                }
                placeholder="e.g. Main lobby beside elevator"
              />
            </Field>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">

              <Field label="Latitude (optional)">
                <input
                  className="input-spot"
                  inputMode="decimal"
                  value={
                    qrForm.lat
                  }
                  onChange={(
                    event
                  ) =>
                    setQrForm(
                      (
                        previous
                      ) => ({
                        ...previous,

                        lat:
                          event
                            .target
                            .value
                      })
                    )
                  }
                  placeholder={
                    selectedSite.lat?.toFixed?.(
                      6
                    ) ||
                    '14.596240'
                  }
                />
              </Field>

              <Field label="Longitude (optional)">
                <input
                  className="input-spot"
                  inputMode="decimal"
                  value={
                    qrForm.lng
                  }
                  onChange={(
                    event
                  ) =>
                    setQrForm(
                      (
                        previous
                      ) => ({
                        ...previous,

                        lng:
                          event
                            .target
                            .value
                      })
                    )
                  }
                  placeholder={
                    selectedSite.lng?.toFixed?.(
                      6
                    ) ||
                    '120.990540'
                  }
                />
              </Field>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950/35 p-4">

              <div className="flex items-center justify-between gap-3">

                <div>
                  <div className="text-xs font-bold text-white">
                    Assign guards to this QR
                  </div>

                  <div className="mt-0.5 text-[10px] text-slate-500">
                    Only guards deployed to this site are listed.
                  </div>
                </div>

                <span className="text-[10px] font-semibold text-blue-400">
                  {
                    qrForm.assignedGuardIds
                      .length
                  }{' '}
                  selected
                </span>
              </div>

              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">

                {assignedGuards.map(
                  (guard) => {
                    const checked =
                      qrForm.assignedGuardIds.includes(
                        guard.id
                      );

                    return (
                      <label
                        key={
                          guard.id
                        }
                        className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition ${
                          checked
                            ? 'border-blue-500/50 bg-blue-500/10'
                            : 'border-slate-800 bg-slate-900/40 hover:border-slate-700'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={
                            checked
                          }
                          onChange={() =>
                            setQrForm(
                              (
                                previous
                              ) => ({
                                ...previous,

                                assignedGuardIds:
                                  checked
                                    ? previous.assignedGuardIds.filter(
                                        (
                                          id
                                        ) =>
                                          id !==
                                          guard.id
                                      )
                                    : [
                                        ...previous.assignedGuardIds,
                                        guard.id
                                      ]
                              })
                            )
                          }
                          className="h-4 w-4 accent-blue-600"
                        />

                        <GuardAvatar
                          photo={
                            guard.photo
                          }
                          name={
                            guard.name
                          }
                          size="h-8 w-8"
                        />

                        <div className="min-w-0">

                          <div className="truncate text-xs font-bold text-white">
                            {
                              guard.name
                            }
                          </div>

                          <div className="text-[10px] text-slate-500">
                            {guard.status ||
                              'Idle'}
                          </div>
                        </div>
                      </label>
                    );
                  }
                )}

                {assignedGuards.length ===
                  0 && (
                  <div className="col-span-2 py-4 text-center text-xs text-slate-500">
                    No guards are deployed to this site yet.
                  </div>
                )}
              </div>
            </div>
          </Modal>
        )}

      {/* ─────────────────────────────────────────────────
          QR PREVIEW
      ───────────────────────────────────────────────── */}

      {qrPreview && (
        <Modal
          title={
            qrPreview.name ||
            'Checkpoint QR'
          }
          subtitle={
            qrPreview.siteName ||
            selectedSite?.name ||
            'Site'
          }
          onClose={() =>
            setQrPreview(
              null
            )
          }
          footer={
            <>
              <button
                type="button"
                onClick={() =>
                  setQrPreview(
                    null
                  )
                }
                className="btn-secondary text-xs"
              >
                Close
              </button>

              <button
                type="button"
                onClick={() =>
                  window.print()
                }
                className="btn-primary text-xs flex items-center gap-2"
              >
                <QrCode className="h-3.5 w-3.5" />
                Print QR
              </button>
            </>
          }
        >
          <div className="text-center">

            <div className="inline-block rounded-2xl bg-white p-5 shadow-xl">

              <QRCodeSVG
                value={
                  qrPreview.qrPayload ||
                  qrPreview.qrCode ||
                  ''
                }
                size={230}
                level="H"
                includeMargin
              />
            </div>

            <div className="mt-4 break-all font-mono text-xs text-emerald-400">
              {
                qrPreview.qrCode
              }
            </div>

            <div className="mt-3 rounded-xl border border-slate-800 bg-slate-950/40 p-3 text-left text-[11px] text-slate-400">

              <div>
                <span className="text-slate-500">
                  Assigned guards:
                </span>{' '}

                {(qrPreview.assignedGuardNames ||
                  []).join(
                  ', '
                ) ||
                  'None yet'}
              </div>

              {qrPreview.area && (
                <div className="mt-1">
                  <span className="text-slate-500">
                    Area:
                  </span>{' '}

                  {
                    qrPreview.area
                  }
                </div>
              )}
            </div>
          </div>
        </Modal>
      )}

      {/* ─────────────────────────────────────────────────
          GUARD ACTION CHOOSER
      ───────────────────────────────────────────────── */}

      {guardActionTarget &&
        selectedSite && (
          <Modal
            title={
              guardActionTarget.name
            }
            subtitle={`${selectedSite.name} — Select a supervisor action`}
            onClose={() =>
              setGuardActionTarget(
                null
              )
            }
          >
            <div className="space-y-3">

              <button
                type="button"
                onClick={() =>
                  openAssignQr(
                    guardActionTarget
                  )
                }
                className="flex w-full items-center gap-4 rounded-2xl border border-emerald-500/25 bg-emerald-500/10 p-4 text-left transition hover:bg-emerald-500/15"
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-500/15 text-emerald-400">
                  <QrCode className="h-5 w-5" />
                </div>

                <div className="flex-1">

                  <div className="text-sm font-bold text-white">
                    ASSIGN QR
                  </div>

                  <div className="mt-0.5 text-[11px] text-slate-400">
                    Choose which checkpoint QR codes this guard is responsible for.
                  </div>
                </div>

                <ChevronRight className="h-5 w-5 text-slate-500" />
              </button>

              <button
                type="button"
                onClick={() =>
                  openRovingTime(
                    guardActionTarget
                  )
                }
                className="flex w-full items-center gap-4 rounded-2xl border border-blue-500/25 bg-blue-500/10 p-4 text-left transition hover:bg-blue-500/15"
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-blue-500/30 bg-blue-500/15 text-blue-400">
                  <Clock3 className="h-5 w-5" />
                </div>

                <div className="flex-1">

                  <div className="text-sm font-bold text-white">
                    ASSIGN PATROL TIMES
                  </div>

                  <div className="mt-0.5 text-[11px] text-slate-400">
                    Add one or more required patrol times for this guard.
                  </div>
                </div>

                <ChevronRight className="h-5 w-5 text-slate-500" />
              </button>

              <button
                type="button"
                onClick={() =>
                  openMoveGuard(
                    guardActionTarget
                  )
                }
                className="flex w-full items-center gap-4 rounded-2xl border border-amber-500/25 bg-amber-500/10 p-4 text-left transition hover:bg-amber-500/15"
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-amber-500/30 bg-amber-500/15 text-amber-400">
                  <Navigation className="h-5 w-5" />
                </div>

                <div className="flex-1">
                  <div className="text-sm font-bold text-white">
                    MOVE GUARD
                  </div>

                  <div className="mt-0.5 text-[11px] text-slate-400">
                    Transfer this guard to another deployment site while keeping the same account, Face ID, and history.
                  </div>
                </div>

                <ChevronRight className="h-5 w-5 text-slate-500" />
              </button>
            </div>
          </Modal>
        )}

      {/* ─────────────────────────────────────────────────
          MOVE GUARD
      ───────────────────────────────────────────────── */}

      {moveGuardTarget &&
        selectedSite && (
          <Modal
            title={`Move Guard — ${moveGuardTarget.name}`}
            subtitle={`${selectedSite.name} → Select the guard's new deployment site`}
            onClose={() => {
              if (!saving) {
                setMoveGuardTarget(
                  null
                );
                setMoveGuardSiteId(
                  ''
                );
                setMoveGuardReason(
                  ''
                );
              }
            }}
          >
            <div className="space-y-4">

              <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">

                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Current Deployment
                </div>

                <div className="mt-2 flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-blue-500/30 bg-blue-500/10 text-blue-400">
                    <Building2 className="h-5 w-5" />
                  </div>

                  <div>
                    <div className="text-sm font-bold text-white">
                      {selectedSite.name}
                    </div>

                    <div className="text-[10px] font-mono text-slate-500">
                      {selectedSite.id}
                    </div>
                  </div>
                </div>

              </div>


              {isGuardOnActivePatrol(
                moveGuardTarget,
                selectedSite
              ) && (
                <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />

                    <div>
                      <div className="font-bold text-rose-300">
                        Active patrol in progress
                      </div>

                      <div className="mt-1 text-[11px] leading-relaxed text-rose-200/80">
                        Finish the current patrol before moving this guard. This prevents the active QR route and GPS session from switching sites in the middle of a patrol.
                      </div>
                    </div>
                  </div>
                </div>
              )}


              <Field label="Move To Site">
                <select
                  className="input-spot"
                  value={
                    moveGuardSiteId
                  }
                  onChange={
                    (event) =>
                      setMoveGuardSiteId(
                        event.target.value
                      )
                  }
                >
                  <option value="">
                    Select destination site
                  </option>

                  {sites
                    .filter(
                      (site) =>
                        String(
                          site.id
                        ) !==
                          String(
                            selectedSite.id
                          ) &&
                        String(
                          site.status ||
                            'Active'
                        )
                          .trim()
                          .toLowerCase() !==
                          'inactive'
                    )
                    .map(
                      (site) => (
                        <option
                          key={
                            site.id
                          }
                          value={
                            site.id
                          }
                        >
                          {site.name} ({site.id})
                        </option>
                      )
                    )}
                </select>
              </Field>


              <Field label="Transfer Reason (optional)">
                <textarea
                  className="input-spot min-h-[88px] resize-none"
                  value={
                    moveGuardReason
                  }
                  onChange={
                    (event) =>
                      setMoveGuardReason(
                        event.target.value
                      )
                  }
                  placeholder="Example: Permanent reassignment, temporary coverage, client request..."
                />
              </Field>


              <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-[11px] leading-relaxed text-slate-400">
                <span className="font-bold text-amber-300">
                  What will happen:
                </span>{' '}
                the guard keeps the same Firebase account, password, Face ID, device binding, and previous patrol history. Old-site patrol schedules are deactivated and old-site QR assignments are removed. New-site QR checkpoints and patrol times must be assigned separately.
              </div>


              <div className="flex justify-end gap-3 pt-2">

                <button
                  type="button"
                  disabled={
                    saving
                  }
                  onClick={() => {
                    setMoveGuardTarget(
                      null
                    );
                    setMoveGuardSiteId(
                      ''
                    );
                    setMoveGuardReason(
                      ''
                    );
                  }}
                  className="btn-secondary"
                >
                  Cancel
                </button>

                <button
                  type="button"
                  disabled={
                    saving ||
                    !moveGuardSiteId ||
                    isGuardOnActivePatrol(
                      moveGuardTarget,
                      selectedSite
                    )
                  }
                  onClick={
                    handleMoveGuard
                  }
                  className="btn-primary flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {saving ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Moving Guard...
                    </>
                  ) : (
                    <>
                      <Navigation className="h-4 w-4" />
                      Confirm Transfer
                    </>
                  )}
                </button>

              </div>

            </div>
          </Modal>
        )}

      {/* ─────────────────────────────────────────────────
          ASSIGN QR
      ───────────────────────────────────────────────── */}

      {assignQrTarget &&
        selectedSite && (
          <Modal
            title={`Assign QR — ${assignQrTarget.name}`}
            subtitle={`${selectedSite.name} — Select one or more checkpoint codes`}
            wide
            onClose={() => {
              setAssignQrTarget(
                null
              );

              setSelectedQrIds(
                []
              );
            }}
            footer={
              <>
                <button
                  type="button"
                  onClick={() => {
                    setAssignQrTarget(
                      null
                    );

                    setSelectedQrIds(
                      []
                    );
                  }}
                  className="btn-secondary text-xs"
                >
                  Cancel
                </button>

                <button
                  type="button"
                  onClick={
                    handleSaveQrAssignments
                  }
                  disabled={
                    saving
                  }
                  className="btn-primary text-xs flex items-center gap-2"
                >
                  {saving ? (
                    <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  ) : (
                    <Save className="h-3.5 w-3.5" />
                  )}

                  Save QR Assignment
                </button>
              </>
            }
          >
            <div className="space-y-2">

              {siteCheckpoints.map(
                (
                  cp
                ) => {
                  const checked =
                    selectedQrIds.includes(
                      cp.id
                    );

                  return (
                    <label
                      key={
                        cp.id
                      }
                      className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition ${
                        checked
                          ? 'border-emerald-500/45 bg-emerald-500/10'
                          : 'border-slate-800 bg-slate-900/40 hover:border-slate-700'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={
                          checked
                        }
                        onChange={() =>
                          toggleQrForGuard(
                            cp.id
                          )
                        }
                        className="h-4 w-4 accent-emerald-500"
                      />

                      <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-700 bg-slate-800 text-emerald-400">
                        <QrCode className="h-4 w-4" />
                      </div>

                      <div className="min-w-0 flex-1">

                        <div className="text-xs font-bold text-white">
                          {
                            cp.name
                          }
                        </div>

                        <div className="mt-0.5 truncate font-mono text-[9px] text-slate-500">
                          {
                            cp.qrCode
                          }
                        </div>

                        {cp.area && (
                          <div className="mt-1 flex items-center gap-1 text-[9px] text-slate-500">
                            <MapPin className="h-3 w-3" />

                            {
                              cp.area
                            }
                          </div>
                        )}
                      </div>
                    </label>
                  );
                }
              )}

              {siteCheckpoints.length ===
                0 && (
                <div className="rounded-xl border border-dashed border-slate-700 py-8 text-center">

                  <QrCode className="mx-auto h-7 w-7 text-slate-600" />

                  <div className="mt-2 text-xs font-semibold text-slate-400">
                    Generate a QR checkpoint first.
                  </div>
                </div>
              )}
            </div>
          </Modal>
        )}

      {/* ─────────────────────────────────────────────────
          ASSIGN PATROL TIMES
      ───────────────────────────────────────────────── */}

      {rovingTarget &&
        selectedSite && (
          <Modal
            title={`Assign Patrol Times — ${rovingTarget.name}`}
            subtitle={`${selectedSite.name} — Add each required patrol time`}
            onClose={() =>
              setRovingTarget(
                null
              )
            }
            footer={
              <>
                <button
                  type="button"
                  onClick={() =>
                    setRovingTarget(
                      null
                    )
                  }
                  className="btn-secondary text-xs"
                >
                  Cancel
                </button>

                <button
                  type="button"
                  onClick={
                    handleSaveRovingTime
                  }
                  disabled={
                    saving ||
                    rovingForm
                      .patrolTimes
                      .length ===
                      0 ||
                    rovingForm.patrolTimes.some(
                      (
                        time
                      ) =>
                        !time
                    ) ||
                    rovingForm
                      .days
                      .length ===
                      0
                  }
                  className="btn-primary text-xs flex items-center gap-2"
                >
                  {saving ? (
                    <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  ) : (
                    <Clock3 className="h-3.5 w-3.5" />
                  )}

                  Save Patrol Times
                </button>
              </>
            }
          >
            <Field label="Patrol Times *">

              <div className="space-y-2">

                {rovingForm.patrolTimes.map(
                  (
                    time,
                    index
                  ) => (
                    <div
                      key={
                        index
                      }
                      className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900/40 p-2"
                    >

                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-500/10 text-[10px] font-bold text-blue-400">
                        {index +
                          1}
                      </div>

                      <input
                        type="time"
                        className="input-spot flex-1"
                        value={
                          time
                        }
                        onChange={(
                          event
                        ) =>
                          updateRovingPatrolTime(
                            index,
                            event
                              .target
                              .value
                          )
                        }
                      />

                      <button
                        type="button"
                        onClick={() =>
                          removeRovingPatrolTime(
                            index
                          )
                        }
                        disabled={
                          rovingForm
                            .patrolTimes
                            .length ===
                          1
                        }
                        className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[10px] font-bold text-rose-400 transition hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-30"
                        title="Remove patrol time"
                      >
                        Remove
                      </button>
                    </div>
                  )
                )}

                <button
                  type="button"
                  onClick={
                    addRovingPatrolTime
                  }
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-blue-500/40 bg-blue-500/5 px-4 py-3 text-xs font-bold text-blue-400 transition hover:bg-blue-500/10"
                >
                  <Plus className="h-4 w-4" />
                  Add Patrol Time
                </button>

                <p className="text-[10px] text-slate-500">
                  Example: 7:00 PM, 8:00 PM, 10:00 PM. Each time is a separate required patrol.
                </p>
              </div>
            </Field>

            <Field label="Roving Days *">

              <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">

                {[
                  'Mon',
                  'Tue',
                  'Wed',
                  'Thu',
                  'Fri',
                  'Sat',
                  'Sun'
                ].map(
                  (
                    day
                  ) => {
                    const active =
                      rovingForm.days.includes(
                        day
                      );

                    return (
                      <button
                        type="button"
                        key={
                          day
                        }
                        onClick={() =>
                          toggleRovingDay(
                            day
                          )
                        }
                        className={`rounded-xl border px-2 py-2 text-[10px] font-bold transition ${
                          active
                            ? 'border-blue-500/50 bg-blue-500/15 text-blue-300'
                            : 'border-slate-800 bg-slate-900/50 text-slate-500'
                        }`}
                      >
                        {
                          day
                        }
                      </button>
                    );
                  }
                )}
              </div>
            </Field>

            <Field label="Supervisor Note">

              <textarea
                className="input-spot min-h-24 resize-none"
                value={
                  rovingForm.notes
                }
                onChange={(
                  event
                ) =>
                  setRovingForm(
                    (
                      previous
                    ) => ({
                      ...previous,

                      notes:
                        event
                          .target
                          .value
                    })
                  )
                }
                placeholder="Optional instructions for this patrol schedule..."
              />
            </Field>
          </Modal>
        )}

      {/* ─────────────────────────────────────────────────
          ADD SITE
      ───────────────────────────────────────────────── */}

      {showAdd && (
        <Modal
          title="Register New Deployment Site"
          subtitle="Address will be automatically geocoded and pinned on the live map"
          wide
          onClose={() => {
            setShowAdd(
              false
            );

            setAddForm(
              EMPTY_SITE
            );
          }}
          footer={
            <>
              <button
                type="button"
                onClick={() => {
                  setShowAdd(
                    false
                  );

                  setAddForm(
                    EMPTY_SITE
                  );
                }}
                className="btn-secondary text-xs"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={
                  handleAdd
                }
                disabled={
                  saving ||
                  !addForm.name.trim()
                }
                className="btn-primary text-xs flex items-center gap-2"
              >
                {saving ? (
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                ) : (
                  <Check className="h-3.5 w-3.5" />
                )}

                Save Site
              </button>
            </>
          }
        >
          <SiteFormFields
            form={
              addForm
            }
            clients={clients}
            onChange={(
              key,
              value
            ) =>
              setAddForm(
                (
                  previous
                ) => ({
                  ...previous,

                  [key]:
                    value
                })
              )
            }
          />
        </Modal>
      )}

      {/* ─────────────────────────────────────────────────
          EDIT SITE
      ───────────────────────────────────────────────── */}

      {editTarget && (
        <Modal
          title="Edit Deployment Site"
          subtitle={`Editing: ${editTarget.name} — Update address to re-pin on map`}
          wide
          onClose={() =>
            setEditTarget(
              null
            )
          }
          footer={
            <>
              <button
                type="button"
                onClick={() =>
                  setEditTarget(
                    null
                  )
                }
                className="btn-secondary text-xs"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={
                  handleEdit
                }
                disabled={
                  saving ||
                  !editForm.name.trim()
                }
                className="btn-primary text-xs flex items-center gap-2"
              >
                {saving ? (
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                ) : (
                  <Check className="h-3.5 w-3.5" />
                )}

                Save Changes
              </button>
            </>
          }
        >
          <SiteFormFields
            form={
              editForm
            }
            clients={clients}
            onChange={(
              key,
              value
            ) =>
              setEditForm(
                (
                  previous
                ) => ({
                  ...previous,

                  [key]:
                    value
                })
              )
            }
          />
        </Modal>
      )}

      {/* ─────────────────────────────────────────────────
          REMOVE SITE CONFIRMATION
      ───────────────────────────────────────────────── */}

      {deleteTarget && (
        <DeleteConfirm
          label={
            deleteTarget.name
          }
          onCancel={() =>
            setDeleteTarget(
              null
            )
          }
          onConfirm={
            handleDelete
          }
        />
      )}
    </Layout>
  );
}
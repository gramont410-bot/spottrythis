import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { where } from 'firebase/firestore';
import { createUserWithEmailAndPassword, deleteUser } from 'firebase/auth';
import { db, hasFirebaseConfig, createIsolatedAuth } from '../lib/firebase';
import { subscribeCollection, updateItem, addItem, removeItem, setItem, uploadDataUrl } from '../lib/dataSource';
import { useAuth } from './AuthContext';

const SpotContext = createContext();

function getShiftTimes(shift) {
  const normalized = String(shift || '');

  if (normalized.includes('18:00 - 06:00')) {
    return { dutyStart: '18:00', dutyEnd: '06:00' };
  }

  if (normalized.includes('10:00 - 22:00')) {
    return { dutyStart: '10:00', dutyEnd: '22:00' };
  }

  return { dutyStart: '06:00', dutyEnd: '18:00' };
}

function getAuthErrorMessage(error) {
  switch (error?.code) {
    case 'auth/email-already-in-use':
      return 'That email already has a Firebase Authentication account.';
    case 'auth/invalid-email':
      return 'Enter a valid guard email address.';
    case 'auth/weak-password':
      return 'The temporary password is too weak. Use at least 8 characters.';
    case 'auth/operation-not-allowed':
      return 'Email/Password sign-in is disabled in Firebase Authentication.';
    case 'auth/network-request-failed':
      return 'Network error while creating the guard login. Check the internet connection.';
    default:
      return error?.message || 'Could not create the guard login.';
  }
}

function playChime() {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const playNote = (freq, time, duration) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, time);
      gain.gain.setValueAtTime(0.15, time);
      gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(time);
      osc.stop(time + duration);
    };
    const now = audioCtx.currentTime;
    playNote(659.25, now, 0.3); // E5
    playNote(880.00, now + 0.12, 0.4); // A5
  } catch (e) {
    console.error("Audio playback failed:", e);
  }
}

export function SpotProvider({ children }) {
  const { profile, role } = useAuth();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Pure Database State (Starts completely empty for fresh sync)
  const [guards, setGuards] = useState([]);
  const [sites, setSites] = useState([]);
  const [clients, setClients] = useState([]);
  const [patrols, setPatrols] = useState([]);
  const [incidents, setIncidents] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [liveEvents, setLiveEvents] = useState([]);
  const [devices, setDevices] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [checkpointLogs, setCheckpointLogs] = useState([]);
  const [guardLocations, setGuardLocations] = useState([]);
  const [checkpoints, setCheckpoints] = useState([]);
  const [schedules, setSchedules] = useState([]);

  // Database Connection Indicator
  const [dbConnected, setDbConnected] = useState(Boolean(hasFirebaseConfig && db));

  // Drawer & Modal States
  const [selectedGuard, setSelectedGuard] = useState(null);
  const [isGuardDrawerOpen, setIsGuardDrawerOpen] = useState(false);
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);

  // Track previous guards state to detect device updates
  const prevGuardsRef = useRef({});

  // Toasts Notification Stack
  const [toasts, setToasts] = useState([]);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback((title, message, type = 'info') => {
    const newToast = {
      id: `toast-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      title,
      message,
      type,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    setToasts((prev) => [newToast, ...prev.slice(0, 4)]);
    window.setTimeout(() => removeToast(newToast.id), 3000);
  }, [removeToast]);

  const openGuardDrawer = (guard) => {
    setSelectedGuard(guard);
    setIsGuardDrawerOpen(true);
  };

  const closeGuardDrawer = () => {
    setIsGuardDrawerOpen(false);
    setSelectedGuard(null);
  };

  const toggleSidebar = () => {
    setSidebarCollapsed((prev) => !prev);
  };

  // -------------------------------------------------------------
  // Real-time Cloud Firestore Subscriptions
  // -------------------------------------------------------------
  useEffect(() => {
    if (!hasFirebaseConfig || !db) return;
    const isClient = role === 'client';
    const clientScope = isClient && profile?.clientId ? [where('clientId', '==', profile.clientId)] : [];
    const subscribeForRole = (name, callback, options = {}) => {
      if (isClient && options.staffOnly) return () => {};
      return subscribeCollection(name, callback, () => {}, clientScope);
    };

    // 1. Incidents
    const unsubIncidents = subscribeForRole('incidents', (fsIncidents) => {
      const formatted = (fsIncidents || []).map((doc) => ({
        id: doc.id,
        title: doc.title || doc.type || 'Field Incident',
        priority: doc.priority || 'Medium',
        siteName: doc.siteName || doc.location || 'Site',
        location: doc.location || doc.checkpointName || 'Zone',
        reporterName: doc.reporterName || doc.guardName || 'Guard',
        reporterId: doc.reporterId || doc.guardId || 'G-100',
        clientId: doc.clientId || '',
        client: doc.client || '',
        timestamp: doc.createdAt?.toDate ? doc.createdAt.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Recently',
        status: doc.status || 'Investigating',
        photoUrls: Array.isArray(doc.photoUrls) ? doc.photoUrls.filter(Boolean) : [],
        photoCount: Number(doc.photoCount) || (Array.isArray(doc.photoUrls) ? doc.photoUrls.length : 0),
        evidencePhoto: doc.evidencePhoto || doc.photoUrl || '',
        description: doc.description || 'Reported incident.',
        actionsTaken: doc.actionsTaken || 'Pending review.'
      }));
      setIncidents(formatted);
    });

    // 2. Sites — merge web 'sites' + Android 'client_sites'
    let webSites = [];
    let androidSites = [];
    const mergeSites = () => {
      const all = [...webSites];
      androidSites.forEach(as => {
        if (!all.find(s => s.id === as.id)) all.push(as);
      });
      setSites(all);
    };

    const unsubSites = subscribeForRole('sites', (fsSites) => {
      webSites = (fsSites || []).map((doc) => ({
        id: doc.id,
        name: doc.name || doc.siteName || 'Managed Site',
        type: doc.type || 'Commercial',
        client: doc.client || 'Client',
        clientId: doc.clientId || '',
        address: doc.address || doc.location || 'Address',
        activeGuardsCount: doc.activeGuardsCount || 0,
        checkpointsCount: doc.checkpointsCount || 0,
        routesCount: doc.routesCount || 0,
        incidentsCount: doc.incidentsCount || 0,
        status: doc.status || 'Active',
        lat: doc.lat ?? null,
        lng: doc.lng ?? null,
        image: doc.image || 'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&w=500&q=80'
      }));
      mergeSites();
    });

    const unsubClientSites = subscribeForRole('client_sites', (fsSites) => {
      androidSites = (fsSites || []).map((doc) => ({
        id: doc.id,
        name: doc.siteName || doc.name || 'Managed Site',
        type: doc.type || 'Commercial',
        client: doc.client || 'Client',
        clientId: doc.clientId || '',
        address: doc.address || doc.location || 'Address',
        activeGuardsCount: doc.activeGuardsCount || 0,
        checkpointsCount: doc.checkpointsCount || 0,
        routesCount: doc.routesCount || 0,
        incidentsCount: doc.incidentsCount || 0,
        status: doc.status || 'Active',
        lat: doc.lat ?? null,
        lng: doc.lng ?? null,
        image: doc.image || 'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&w=500&q=80'
      }));
      mergeSites();
    });

    const unsubCheckpoints = subscribeForRole('checkpoints', (fsCheckpoints) => {
      const normalized = (fsCheckpoints || []).map((checkpoint) => ({
        ...checkpoint,
        id: checkpoint.id,
        siteId: checkpoint.siteId || '',
        siteName: checkpoint.siteName || 'Managed Site',
        qrCode: checkpoint.qrCode || checkpoint.scanValue || '',
        clientId: checkpoint.clientId || ''
      }));
      setCheckpoints(normalized);
      const counts = normalized.reduce((result, checkpoint) => {
        result[checkpoint.siteId] = (result[checkpoint.siteId] || 0) + 1;
        return result;
      }, {});
      setSites((current) => current.map((site) => ({ ...site, checkpointsCount: counts[site.id] || 0 })));
    });

    // 3. Guards / Users
    const unsubUsers = subscribeForRole('users', (fsUsers) => {
      const formatted = (fsUsers || [])
        .filter((u) => u.role === 'guard' || u.role === 'Guard' || !u.role)
        .map((u) => ({
          id: u.id,
          authUid: u.authUid || u.id,
          guardId: u.guardId || '',
          email: u.email || '',
          name: u.fullName || u.name || u.displayName || u.email || 'Guard Personnel',
          photo: u.photo || u.photoUrl || '',
          client: u.client || 'Client',
          clientId: u.clientId || '',
          siteId: u.assignedSiteId || u.siteId || '',
          assignedSiteId: u.assignedSiteId || u.siteId || '',
          siteName: u.siteName || 'Assigned Site',
          shift: u.shift || ((u.dutyStart && u.dutyEnd) ? `${u.dutyStart} - ${u.dutyEnd}` : 'Day Shift'),
          dutyStart: u.dutyStart || '',
          dutyEnd: u.dutyEnd || '',
          status: u.status || (u.active === false ? 'Inactive' : 'Idle'),
          battery: u.battery !== undefined ? u.battery : 100,
          gpsAccuracy: u.gpsAccuracy || 'Unknown',
          gpsLat: u.gpsLat ?? u.lat ?? null,
          gpsLng: u.gpsLng ?? u.lng ?? null,
          faceVerified: Boolean(u.faceVerified),
          faceVerifiedAt: u.faceVerifiedAt || 'Pending',
          faceEnrollmentStatus: u.faceEnrollmentStatus || (u.faceVerified ? 'enrolled' : 'pending'),
          faceProfileId: u.faceProfileId || null,
          facePhotoUrl: u.facePhotoUrl || u.facePhoto || '',
          currentPatrolName: u.currentPatrolName || '',
          progressPct: u.progressPct || 0,
          completedCheckpoints: u.completedCheckpoints || 0,
          totalCheckpoints: u.totalCheckpoints || 0,
          etaMinutes: u.etaMinutes || 0,
          phone: u.phone || 'N/A',
          deviceId: u.deviceId || null,
          performanceRating: u.performanceRating || 100,
          attendanceRate: u.attendanceRate || 100,
          stepCount: u.stepCount || u.steps || 0,
          distanceWalkedMeters: u.distanceWalkedMeters || u.distanceMeters || 0,
          lastLocationUpdate: u.lastLocationUpdate || u.locationUpdatedAt || null,
          networkSignal: u.networkSignal || u.signalStrength || 'Unknown'
        }));

      // Check if we already had guards loaded (to avoid triggering on first load)
      const hasPrev = Object.keys(prevGuardsRef.current).length > 0;
      
      formatted.forEach((guard) => {
        const prev = prevGuardsRef.current[guard.id];
        if (hasPrev && prev) {
          const deviceChanged = guard.deviceId !== prev.deviceId;
          const phoneChanged = guard.phone !== prev.phone && prev.phone !== 'N/A';
          
          if (deviceChanged || phoneChanged) {
            let message = '';
            if (deviceChanged) {
              message = `${guard.name}'s assigned device updated to: ${guard.deviceId || 'None'}`;
            } else {
              message = `${guard.name}'s phone number updated to: ${guard.phone}`;
            }
            
            // Trigger toast
            addToast('Guard Device/Contact Updated', message, 'info');
            
            // Play chime sound
            playChime();
          }
        }
        
        // Update ref value
        prevGuardsRef.current[guard.id] = {
          deviceId: guard.deviceId,
          phone: guard.phone
        };
      });

      // Initialize keys for new guards if it was empty
      if (!hasPrev) {
        formatted.forEach((g) => {
          prevGuardsRef.current[g.id] = {
            deviceId: g.deviceId,
            phone: g.phone
          };
        });
      }

      setGuards(formatted);
    });

    const unsubGuardLocations = subscribeForRole('guardLocations', (fsLocations) => {
      const normalizedLocations = (fsLocations || []).map((location) => {
        const updatedAtDate =
          location.updatedAt?.toDate
            ? location.updatedAt.toDate()
            : location.deviceTimestamp?.toDate
            ? location.deviceTimestamp.toDate()
            : location.timestamp?.toDate
            ? location.timestamp.toDate()
            : null;

        const latitude = Number(location.latitude ?? location.lat ?? location.gpsLat);
        const longitude = Number(location.longitude ?? location.lng ?? location.gpsLng);

        return {
          ...location,
          id: location.id,
          guardId: location.guardId || location.userId || location.id,
          humanGuardId: location.humanGuardId || '',
          clientId: location.clientId || '',
          siteId: location.siteId || '',
          siteName: location.siteName || '',
          patrolId: location.patrolId || location.patrolLogId || '',
          patrolLogId: location.patrolLogId || location.patrolId || '',
          latitude: Number.isFinite(latitude) ? latitude : null,
          longitude: Number.isFinite(longitude) ? longitude : null,
          accuracy: location.accuracy !== undefined && location.accuracy !== null ? Number(location.accuracy) : null,
          tracking: Boolean(location.tracking),
          updatedAt: location.updatedAt || location.deviceTimestamp || location.timestamp || null,
          updatedAtDate,
          updatedAtMs: updatedAtDate?.getTime() || 0,
        };
      });

      setGuardLocations(normalizedLocations);

      const latestByGuard = {};
      normalizedLocations.forEach((location) => {
        const guardId = location.guardId || location.id;
        if (!guardId) return;
        const recordedAt = location.updatedAtMs || 0;
        if (!latestByGuard[guardId] || recordedAt >= latestByGuard[guardId].recordedAt) {
          latestByGuard[guardId] = { location, recordedAt };
        }
      });

      setGuards((current) => current.map((guard) => {
        const latest = latestByGuard[guard.id]?.location;
        if (!latest) return guard;
        return {
          ...guard,
          gpsLat: latest.latitude ?? guard.gpsLat,
          gpsLng: latest.longitude ?? guard.gpsLng,
          gpsAccuracy: latest.accuracy !== null && latest.accuracy !== undefined
            ? `${Number(latest.accuracy).toFixed(1)}m`
            : guard.gpsAccuracy,
          networkSignal: latest.networkSignal || latest.signalStrength || guard.networkSignal,
          lastLocationUpdate: latest.updatedAt || guard.lastLocationUpdate,
          status: latest.tracking ? 'On Patrol' : (latest.status || guard.status)
        };
      }));
    });

    // 4. PATROL OPERATIONS
    // -------------------------------------------------------------
    // SOURCE OF TRUTH:
    //   roving_assignments = supervisor's expected patrol schedule
    //   patrol_logs         = what the guard actually did
    //   checkpoints         = QR checkpoints assigned to that guard/site
    //
    // This lets the supervisor see SCHEDULED / LATE / MISSED even if
    // the guard never opens the app and therefore never creates a log.
    // -------------------------------------------------------------
    let latestPatrolLogs = [];
    let latestRovingAssignments = [];
    let latestCheckpointDefinitions = [];

    const toDate = (value) => {
      if (!value) return null;

      if (value instanceof Date && !Number.isNaN(value.getTime())) {
        return value;
      }

      if (typeof value?.toDate === 'function') {
        const converted = value.toDate();
        return converted instanceof Date && !Number.isNaN(converted.getTime())
          ? converted
          : null;
      }

      if (typeof value === 'number' || typeof value === 'string') {
        const converted = new Date(value);
        return Number.isNaN(converted.getTime()) ? null : converted;
      }

      return null;
    };

    const localDateKey = (date = new Date()) => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    const dayCode = (date = new Date()) =>
      ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][date.getDay()];

    const parsePatrolTime = (dateKey, timeValue) => {
      if (!dateKey || !timeValue) return null;

      const raw = String(timeValue).trim();

      // 24-hour time from the supervisor site scheduler, e.g. 19:00.
      const twentyFourHour = raw.match(/^(\d{1,2}):(\d{2})$/);
      if (twentyFourHour) {
        const hours = Number(twentyFourHour[1]);
        const minutes = Number(twentyFourHour[2]);

        if (
          Number.isInteger(hours) &&
          Number.isInteger(minutes) &&
          hours >= 0 &&
          hours <= 23 &&
          minutes >= 0 &&
          minutes <= 59
        ) {
          const [year, month, day] = dateKey.split('-').map(Number);
          return new Date(year, month - 1, day, hours, minutes, 0, 0);
        }
      }

      // Backward compatibility with old values like "06:00 PM".
      const twelveHour = raw.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
      if (twelveHour) {
        let hours = Number(twelveHour[1]);
        const minutes = Number(twelveHour[2]);
        const meridiem = twelveHour[3].toUpperCase();

        if (hours >= 1 && hours <= 12 && minutes >= 0 && minutes <= 59) {
          if (hours === 12) hours = 0;
          if (meridiem === 'PM') hours += 12;

          const [year, month, day] = dateKey.split('-').map(Number);
          return new Date(year, month - 1, day, hours, minutes, 0, 0);
        }
      }

      return null;
    };

    const formatClockTime = (value, fallback = '') => {
      const date = toDate(value);
      if (!date) return fallback;

      return date.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit'
      });
    };

    const normalizeStoredStatus = (value) => {
      const raw = String(value || '')
        .trim()
        .toUpperCase()
        .replace(/[\s-]+/g, '_');

      if (['IN_PROGRESS', 'ACTIVE', 'ON_PATROL'].includes(raw)) return 'In Progress';
      if (['COMPLETED', 'COMPLETE'].includes(raw)) return 'Completed';
      if (['MISSED'].includes(raw)) return 'Missed';
      if (['LATE', 'DELAYED'].includes(raw)) return 'Late';
      if (['SCHEDULED', 'PENDING'].includes(raw)) return 'Scheduled';

      return raw ? raw.replace(/_/g, ' ') : 'Scheduled';
    };

    const assignmentPatrolTimes = (assignment) => {
      const explicitTimes = Array.isArray(assignment.patrolTimes)
        ? assignment.patrolTimes
            .map((time) => String(time || '').trim())
            .filter(Boolean)
        : [];

      if (explicitTimes.length > 0) {
        return Array.from(new Set(explicitTimes));
      }

      // Legacy fallback.
      return Array.from(
        new Set(
          [assignment.startTime, assignment.endTime]
            .map((time) => String(time || '').trim())
            .filter(Boolean)
        )
      );
    };

    const assignedCheckpointsFor = (guardId, siteId) => {
      return latestCheckpointDefinitions.filter((checkpoint) => {
        const checkpointSiteId = checkpoint.siteId || '';
        const assignedGuardIds = Array.isArray(checkpoint.assignedGuardIds)
          ? checkpoint.assignedGuardIds.map((id) => String(id || '').trim())
          : [];

        const checkpointStatus = String(checkpoint.status || 'Active')
          .trim()
          .toLowerCase();

        const active =
          !['inactive', 'disabled', 'revoked', 'archived'].includes(
            checkpointStatus
          );

        return (
          active &&
          checkpointSiteId === siteId &&
          assignedGuardIds.some(
            (assignedId) =>
              assignedId &&
              guardId &&
              assignedId.toLowerCase() === String(guardId).toLowerCase()
          )
        );
      });
    };

    const findLogForExpectedPatrol = ({
      assignment,
      patrolTime,
      dateKey
    }) => {
      return latestPatrolLogs.find((log) => {
        const logTime = String(
          log.patrolTime || log.scheduledTime || ''
        ).trim();

        return (
          String(log.guardId || '') === String(assignment.guardId || '') &&
          String(log.siteId || '') === String(assignment.siteId || '') &&
          String(log.patrolDate || log.scheduledDate || '') === dateKey &&
          logTime === String(patrolTime)
        );
      });
    };

    const mapActualPatrol = ({
      log,
      assignment = null,
      expectedTime = '',
      expectedCheckpoints = []
    }) => {
      const scheduledAt =
        toDate(log.scheduledAt) ||
        parsePatrolTime(
          log.patrolDate || log.scheduledDate || localDateKey(),
          log.patrolTime || log.scheduledTime || expectedTime
        );

      const lateAfter =
        toDate(log.lateAfter) ||
        (scheduledAt ? new Date(scheduledAt.getTime() + 5 * 60 * 1000) : null);

      const missedAfter =
        toDate(log.missedAfter) ||
        (scheduledAt ? new Date(scheduledAt.getTime() + 15 * 60 * 1000) : null);

      const startedAt = toDate(log.startedAt);
      const completedAt = toDate(log.completedAt);

      let status = normalizeStoredStatus(log.status);

      // If an older log is still SCHEDULED/PENDING, derive its live state.
      // Do NOT override active/completed records.
      if (status === 'Scheduled' && !startedAt) {
        if (missedAfter && Date.now() > missedAfter.getTime()) {
          status = 'Missed';
        } else if (lateAfter && Date.now() > lateAfter.getTime()) {
          status = 'Late';
        }
      }

      // While a patrol is IN_PROGRESS, the supervisor's current checkpoint
      // definitions are authoritative. This prevents a checkpoint that was
      // deleted/unassigned after patrol start from remaining stuck in the
      // live 2/4, 3/5, etc. progress view.
      //
      // Completed patrols intentionally keep their original checkpoint
      // snapshot for historical/audit accuracy.
      const useLiveCheckpointRequirements =
        status === 'In Progress' && Boolean(assignment);

      const storedRequiredCheckpointIds =
        Array.isArray(log.requiredCheckpointIds)
          ? log.requiredCheckpointIds.map((id) => String(id || ''))
          : [];

      const storedRequiredCheckpointNames =
        Array.isArray(log.requiredCheckpointNames)
          ? log.requiredCheckpointNames
          : [];

      const requiredCheckpointIds = useLiveCheckpointRequirements
        ? expectedCheckpoints.map((checkpoint) => checkpoint.id)
        : storedRequiredCheckpointIds.length > 0
        ? storedRequiredCheckpointIds
        : expectedCheckpoints.map((checkpoint) => checkpoint.id);

      const requiredCheckpointNames = useLiveCheckpointRequirements
        ? expectedCheckpoints.map(
            (checkpoint) =>
              checkpoint.name ||
              checkpoint.checkpointName ||
              'Checkpoint'
          )
        : storedRequiredCheckpointNames.length > 0
        ? storedRequiredCheckpointNames
        : expectedCheckpoints.map(
            (checkpoint) =>
              checkpoint.name ||
              checkpoint.checkpointName ||
              'Checkpoint'
          );

      const storedCompletedCheckpointIds = Array.isArray(
        log.completedCheckpointIds
      )
        ? log.completedCheckpointIds.map((id) => String(id || ''))
        : [];

      const completedCheckpointIds = useLiveCheckpointRequirements
        ? storedCompletedCheckpointIds.filter((id) =>
            requiredCheckpointIds.includes(id)
          )
        : storedCompletedCheckpointIds;

      const checkpointScans = Array.isArray(log.checkpointScans)
        ? log.checkpointScans
        : [];

      const totalCount = Number(
        useLiveCheckpointRequirements
          ? requiredCheckpointIds.length
          : log.totalCheckpoints ??
              log.totalCount ??
              requiredCheckpointIds.length ??
              0
      );

      const completedCount = Number(
        useLiveCheckpointRequirements
          ? completedCheckpointIds.length
          : log.completedCheckpoints ??
              log.completedCount ??
              completedCheckpointIds.length ??
              0
      );

      const safeTotal = Number.isFinite(totalCount) ? Math.max(0, totalCount) : 0;
      const safeCompleted = Number.isFinite(completedCount)
        ? Math.max(0, Math.min(completedCount, safeTotal || completedCount))
        : 0;

      const progressPct =
        safeTotal > 0
          ? Math.round((safeCompleted / safeTotal) * 100)
          : Number(log.progressPct || 0);

      const durationMinutes =
        startedAt && completedAt
          ? Math.max(
              0,
              Math.round(
                (completedAt.getTime() - startedAt.getTime()) / 60000
              )
            )
          : null;

      return {
        ...log,

        id: log.id,
        source: 'patrol_logs',

        guardId: log.guardId || assignment?.guardId || '',
        guardName: log.guardName || assignment?.guardName || 'Guard',
        guardPhoto: log.guardPhoto || '',
        clientId: log.clientId || assignment?.clientId || '',
        client: log.client || assignment?.client || '',

        siteId: log.siteId || assignment?.siteId || '',
        siteName: log.siteName || assignment?.siteName || 'Site',

        rovingAssignmentId:
          log.rovingAssignmentId || assignment?.id || '',

        patrolDate:
          log.patrolDate ||
          log.scheduledDate ||
          localDateKey(),

        patrolTime:
          log.patrolTime ||
          log.scheduledTime ||
          expectedTime ||
          '',

        scheduledTime:
          log.scheduledTime ||
          log.patrolTime ||
          expectedTime ||
          '',

        routeName:
          log.routeName ||
          `${log.patrolTime || log.scheduledTime || expectedTime || 'Scheduled'} Patrol`,

        status,

        // Keep the stored Android flag. An IN_PROGRESS/COMPLETED patrol can
        // still have a separate "Started Late" warning in Routes.jsx.
        startedLate: Boolean(log.startedLate),

        scheduledAt,
        lateAfter,
        missedAfter,
        startedAt,
        completedAt,
        missedAt: toDate(log.missedAt),

        startTime:
          log.startTime ||
          formatClockTime(startedAt, ''),

        completedTime:
          formatClockTime(completedAt, ''),

        totalCheckpoints: safeTotal,
        completedCheckpoints: safeCompleted,

        // Old Routes fields are kept for compatibility with other pages.
        totalCount: safeTotal,
        completedCount: safeCompleted,
        remainingCount: Math.max(0, safeTotal - safeCompleted),
        progressPct: Math.min(100, Math.max(0, progressPct || 0)),
        etaMinutes: Number(log.etaMinutes || 0),
        durationMinutes,

        requiredCheckpointIds,
        requiredCheckpointNames,
        completedCheckpointIds,
        checkpointScans,

        checkpoints: Array.isArray(log.checkpoints)
          ? log.checkpoints
          : []
      };
    };

    const buildExpectedPatrol = ({
      assignment,
      patrolTime,
      dateKey,
      scheduledAt,
      expectedCheckpoints
    }) => {
      const lateAfter = new Date(
        scheduledAt.getTime() + 5 * 60 * 1000
      );

      const missedAfter = new Date(
        scheduledAt.getTime() + 15 * 60 * 1000
      );

      let status = 'Scheduled';

      if (Date.now() > missedAfter.getTime()) {
        status = 'Missed';
      } else if (Date.now() > lateAfter.getTime()) {
        status = 'Late';
      }

      const requiredCheckpointIds =
        expectedCheckpoints.map((checkpoint) => checkpoint.id);

      const requiredCheckpointNames =
        expectedCheckpoints.map(
          (checkpoint) =>
            checkpoint.name ||
            checkpoint.checkpointName ||
            'Checkpoint'
        );

      return {
        id: `EXPECTED_${assignment.id}_${dateKey}_${String(patrolTime).replace(
          /[^0-9A-Za-z]/g,
          ''
        )}`,

        source: 'roving_assignments',
        derivedStatus: true,

        guardId: assignment.guardId || '',
        guardName: assignment.guardName || 'Guard',
        guardPhoto: '',
        clientId: assignment.clientId || '',
        client: assignment.client || '',

        siteId: assignment.siteId || '',
        siteName: assignment.siteName || 'Site',

        rovingAssignmentId: assignment.id,

        patrolDate: dateKey,
        patrolTime,
        scheduledTime: patrolTime,
        routeName: `${patrolTime} Patrol`,

        status,
        startedLate: false,

        scheduledAt,
        lateAfter,
        missedAfter,
        startedAt: null,
        completedAt: null,
        missedAt: status === 'Missed' ? missedAfter : null,

        startTime: '',
        completedTime: '',

        totalCheckpoints: requiredCheckpointIds.length,
        completedCheckpoints: 0,
        totalCount: requiredCheckpointIds.length,
        completedCount: 0,
        remainingCount: requiredCheckpointIds.length,
        progressPct: 0,
        etaMinutes: 0,
        durationMinutes: null,

        requiredCheckpointIds,
        requiredCheckpointNames,
        completedCheckpointIds: [],
        checkpointScans: [],
        checkpoints: []
      };
    };

    const publishPatrols = () => {
      const now = new Date();
      const dateKey = localDateKey(now);
      const todayDay = dayCode(now);

      const expectedPatrols = [];

      latestRovingAssignments.forEach((assignment) => {
        const status = String(assignment.status || 'Active')
          .trim()
          .toLowerCase();

        if (['inactive', 'disabled', 'archived'].includes(status)) {
          return;
        }

        const days = Array.isArray(assignment.days)
          ? assignment.days.map((day) => String(day || '').trim())
          : [];

        if (
          days.length > 0 &&
          !days.some(
            (day) => day.toLowerCase() === todayDay.toLowerCase()
          )
        ) {
          return;
        }

        const guardId = assignment.guardId || '';
        const siteId = assignment.siteId || '';
        const expectedCheckpoints = assignedCheckpointsFor(
          guardId,
          siteId
        );

        assignmentPatrolTimes(assignment).forEach((patrolTime) => {
          const scheduledAt = parsePatrolTime(
            dateKey,
            patrolTime
          );

          if (!scheduledAt) return;

          const actualLog = findLogForExpectedPatrol({
            assignment,
            patrolTime,
            dateKey
          });

          if (actualLog) {
            expectedPatrols.push(
              mapActualPatrol({
                log: actualLog,
                assignment,
                expectedTime: patrolTime,
                expectedCheckpoints
              })
            );
          } else {
            expectedPatrols.push(
              buildExpectedPatrol({
                assignment,
                patrolTime,
                dateKey,
                scheduledAt,
                expectedCheckpoints
              })
            );
          }
        });
      });

      // Keep actual patrol_logs from today even if their old schedule was
      // deleted or changed. They are still valid history/execution records.
      const expectedActualIds = new Set(
        expectedPatrols
          .filter((patrol) => patrol.source === 'patrol_logs')
          .map((patrol) => patrol.id)
      );

      const extraTodayLogs = latestPatrolLogs
        .filter((log) => {
          const logDate =
            log.patrolDate ||
            log.scheduledDate ||
            localDateKey(toDate(log.startedAt) || now);

          return (
            logDate === dateKey &&
            !expectedActualIds.has(log.id)
          );
        })
        .map((log) => {
          const expectedCheckpoints = assignedCheckpointsFor(
            log.guardId || '',
            log.siteId || ''
          );

          return mapActualPatrol({
            log,
            expectedCheckpoints
          });
        });

      const combined = [
        ...expectedPatrols,
        ...extraTodayLogs
      ];

      combined.sort((a, b) => {
        const aTime =
          toDate(a.scheduledAt)?.getTime() ||
          toDate(a.startedAt)?.getTime() ||
          0;

        const bTime =
          toDate(b.scheduledAt)?.getTime() ||
          toDate(b.startedAt)?.getTime() ||
          0;

        return aTime - bTime;
      });

      setPatrols(combined);
    };

    // Current Android execution records.
    const unsubPatrols = subscribeForRole(
      'patrol_logs',
      (fsLogs) => {
        latestPatrolLogs = fsLogs || [];
        publishPatrols();
      }
    );

    // Supervisor-created recurring schedule.
    const unsubRovingAssignments = subscribeForRole(
      'roving_assignments',
      (assignments) => {
        latestRovingAssignments = assignments || [];
        publishPatrols();
      }
    );

    // Needed so SCHEDULED/LATE/MISSED cards can already show the number of
    // QR checkpoints before the guard starts the patrol.
    const unsubPatrolCheckpointDefinitions = subscribeForRole(
      'checkpoints',
      (definitions) => {
        latestCheckpointDefinitions = definitions || [];
        publishPatrols();
      }
    );

    // Time itself changes SCHEDULED -> LATE -> MISSED even when Firestore
    // receives no new write. Recalculate the supervisor view every 30 sec.
    const patrolStatusClock = window.setInterval(
      publishPatrols,
      30 * 1000
    );

    const unsubSchedules = subscribeForRole('schedules', (fsSchedules) => setSchedules((fsSchedules || []).map((schedule) => ({
      id: schedule.id,
      guardId: schedule.guardId || '',
      guardName: schedule.guardName || 'Guard',
      siteId: schedule.siteId || '',
      siteName: schedule.siteName || 'Site',
      shift: schedule.shift || 'Day Shift',
      date: schedule.date || '',
      status: schedule.status || 'Scheduled',
      clientId: schedule.clientId || '',
      patrolWindows: Array.isArray(schedule.patrolWindows) ? schedule.patrolWindows.map((window, index) => ({
        id: window.id || `window-${index + 1}`,
        name: window.name || `Patrol ${index + 1}`,
        startTime: window.startTime || '',
        endTime: window.endTime || '',
        checkpointIds: Array.isArray(window.checkpointIds) ? window.checkpointIds : []
      })) : []
    }))));

    // 5. Audit Logs
    const unsubAudit = subscribeForRole('adminLogs', (fsAudit) => {
      const formatted = (fsAudit || []).map((doc) => ({
        id: doc.id,
        timestamp: doc.timestamp?.toDate ? doc.timestamp.toDate().toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : 'Recently',
        actor: doc.userId || doc.actor || 'Supervisor Admin',
        category: doc.collection || doc.category || 'System Action',
        action: doc.action || 'Data Change',
        details: typeof doc.details === 'object' ? JSON.stringify(doc.details) : String(doc.details || ''),
        ipAddress: 'Cloud Sync',
        severity: doc.severity || 'Info'
      }));
      setAuditLogs(formatted);
    }, { staffOnly: true });

    // 6. Clients
    const unsubClients = subscribeForRole('clients', (fsClients) => {
      const formatted = (fsClients || []).map((doc) => ({
        id: doc.id,
        company: doc.company || doc.name || 'Client Organization',
        contactPerson: doc.contactPerson || 'Contact Person',
        email: doc.email || 'contact@client.com',
        accountUid: doc.accountUid || '',
        phone: doc.phone || 'N/A',
        supervisor: doc.supervisor || 'Assigned Supervisor',
        status: doc.status || 'Active',
        deploymentsCount: doc.deploymentsCount || 0,
        assignedGuards: doc.assignedGuards || 0,
        slaCompliance: doc.slaCompliance || 100,
        contractStart: doc.contractStart || '',
        contractEnd: doc.contractEnd || '',
        notes: doc.notes || ''
      }));
      setClients(formatted);
    }, { staffOnly: true });

    // 7. Devices
    const unsubDevices = subscribeForRole('devices', (fsDevices) => {
      const formatted = (fsDevices || []).map((d) => ({
        id: d.id,
        deviceId: d.deviceId || d.id,
        deviceModel: d.deviceModel || 'Unknown Device',
        osVersion: d.osVersion || 'Unknown OS',
        lastActive: d.lastActive?.toDate ? d.lastActive.toDate() : null,
      }));
      setDevices(formatted);
    }, { staffOnly: true });

    // 8. Attendance (from Android app)
    const unsubAttendance = subscribeForRole('attendance', (fsDocs) => {
      const formatted = (fsDocs || []).map((doc) => ({
        id: doc.id,
        guardId: doc.guardId || doc.userId || '',
        guardName: doc.guardName || doc.name || 'Guard',
        siteId: doc.siteId || '',
        siteName: doc.siteName || 'Site',
        timeIn: doc.timeIn?.toDate ? doc.timeIn.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : (doc.timeIn || ''),
        timeOut: doc.timeOut?.toDate ? doc.timeOut.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : (doc.timeOut || ''),
        date: doc.date || (doc.timestamp?.toDate ? doc.timestamp.toDate().toLocaleDateString() : ''),
        status: doc.status || 'Present',
        faceVerified: Boolean(doc.faceVerified),
      }));
      setAttendance(formatted);
    }, { staffOnly: true });

    // 9. Checkpoint logs (from Android app)
    const unsubCheckpointLogs = subscribeForRole('checkpoint_logs', (fsDocs) => {
      const formatted = (fsDocs || []).map((doc) => ({
        id: doc.id,
        guardId: doc.guardId || '',
        guardName: doc.guardName || 'Guard',
        checkpointId: doc.checkpointId || doc.locationId || '',
        checkpointName: doc.checkpointName || doc.locationName || 'Checkpoint',
        siteId: doc.siteId || '',
        clientId: doc.clientId || '',
        timestamp: doc.timestamp?.toDate ? doc.timestamp.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Recently',
        verified: Boolean(doc.verified),
      }));
      setCheckpointLogs(formatted);
    });

    setDbConnected(true);

    return () => {
      unsubIncidents();
      unsubSites();
      unsubClientSites();
      unsubCheckpoints();
      unsubUsers();
      unsubGuardLocations();
      unsubPatrols();
      unsubRovingAssignments();
      unsubPatrolCheckpointDefinitions();
      window.clearInterval(patrolStatusClock);
      unsubSchedules();
      unsubAudit();
      unsubClients();
      unsubDevices();
      unsubAttendance();
      unsubCheckpointLogs();
    };
  }, [profile?.clientId, role]);

  useEffect(() => {
    const incidentEvents = incidents.map((incident) => ({
      id: `incident-${incident.id}`,
      text: `${incident.priority} incident at ${incident.siteName}: ${incident.title}`,
      time: incident.timestamp,
      clientId: incident.clientId || incident.client || ''
    }));
    const scanEvents = checkpointLogs.map((log) => ({
      id: `scan-${log.id}`,
      text: `${log.guardName} scanned ${log.checkpointName}`,
      time: log.timestamp,
      clientId: log.clientId || ''
    }));
    setLiveEvents([...incidentEvents, ...scanEvents].slice(0, 30));
  }, [incidents, checkpointLogs]);

  // -------------------------------------------------------------
  // CRUD — Guards
  // -------------------------------------------------------------
  const persistGuardPhoto = async (guardId, photo) => {
    if (!photo?.startsWith('data:') || !hasFirebaseConfig || !db) return photo || '';

    try {
      return await uploadDataUrl(`guardProfiles/${guardId}/profile-photo`, photo);
    } catch (e) {
      console.warn('Firebase Storage guard photo upload:', e);
      return photo;
    }
  };

  const addGuard = async (newGuard) => {
    if (!hasFirebaseConfig || !db) {
      throw new Error('Firebase is not connected. The guard was not saved.');
    }

    const email = String(newGuard.email || '').trim().toLowerCase();
    const password = String(newGuard.password || '');
    const name = String(newGuard.name || '').trim();

    if (!name) throw new Error('Enter the guard full name.');
    if (!email) throw new Error('Enter the guard login email.');
    if (password.length < 8) throw new Error('Temporary password must contain at least 8 characters.');

    const guardCode = newGuard.guardId || `G-${Date.now().toString().slice(-6)}`;
    const assignedSiteId = newGuard.assignedSiteId || newGuard.siteId || '';
    const selectedSite = sites.find((site) => String(site.id) === String(assignedSiteId));
    const shift = newGuard.shift || 'Day Shift (06:00 - 18:00)';
    const shiftTimes = getShiftTimes(shift);

    const isolated = createIsolatedAuth();
    let createdAuthUser = null;
    let firestoreProfileCreated = false;

    try {
      const credential = await createUserWithEmailAndPassword(isolated.auth, email, password);
      createdAuthUser = credential.user;
      const authUid = createdAuthUser.uid;

      const created = {
        id: authUid,
        authUid,
        guardId: guardCode,
        name,
        fullName: newGuard.fullName?.trim() || name,
        email,
        clientId: newGuard.clientId || selectedSite?.clientId || profile?.clientId || '',
        client: newGuard.client || selectedSite?.client || 'Client Account',
        siteId: assignedSiteId,
        assignedSiteId,
        siteName: newGuard.siteName || selectedSite?.name || 'Assigned Site',
        shift,
        dutyStart: newGuard.dutyStart || shiftTimes.dutyStart,
        dutyEnd: newGuard.dutyEnd || shiftTimes.dutyEnd,
        status: newGuard.status || 'Idle',
        active: true,
        battery: 100,
        gpsAccuracy: 'Unknown',
        gpsLat: null,
        gpsLng: null,
        faceVerified: false,
        faceVerifiedAt: 'Pending',
        faceEnrollmentStatus: 'pending',
        faceEmbedding: [],
        faceProfileId: null,
        facePhotoUrl: '',
        facePhoto: '',
        currentPatrolName: '',
        progressPct: 0,
        completedCheckpoints: 0,
        totalCheckpoints: 0,
        etaMinutes: 0,
        phone: newGuard.phone || '',
        deviceId: null,
        performanceRating: 100,
        attendanceRate: 100,
        photo: '',
        role: 'guard',
        authProvider: 'password',
        mustChangePassword: true,
        temporaryPasswordIssuedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      };

      // Canonical identity contract shared with Android:
      // Firebase Auth UID == users/{uid} document ID == patrol guardId.
      await setItem('users', authUid, created);
      firestoreProfileCreated = true;

      setGuards((prev) => [created, ...prev.filter((guard) => guard.id !== authUid)]);

      if (newGuard.photo) {
        persistGuardPhoto(authUid, newGuard.photo)
          .then((photo) => {
            if (!photo) return;
            setGuards((prev) => prev.map((guard) => (
              guard.id === authUid ? { ...guard, photo } : guard
            )));
            return updateItem('users', authUid, { photo });
          })
          .catch((photoError) => {
            console.warn('Firebase Storage guard photo upload:', photoError);
          });
      }

      addToast(
        'Guard Account Created',
        `${created.name} can now sign in to the Android app with ${email}.`,
        'success'
      );

      return { ...created, temporaryPassword: password };
    } catch (error) {
      console.error('Guard account creation failed:', error);

      if (createdAuthUser && !firestoreProfileCreated) {
        try {
          await deleteUser(createdAuthUser);
        } catch (rollbackError) {
          console.warn('Unable to roll back newly-created Firebase Auth user:', rollbackError);
        }
      }

      throw new Error(error?.code?.startsWith('auth/') ? getAuthErrorMessage(error) : (error?.message || 'Could not create the guard account.'));
    } finally {
      try {
        await isolated.dispose();
      } catch (_) {}
    }
  };

  const updateGuard = async (id, patch) => {
    const persistedPatch = patch.photo !== undefined
      ? { ...patch, photo: await persistGuardPhoto(id, patch.photo) }
      : patch;
    setGuards((prev) => prev.map((g) => (g.id === id ? { ...g, ...persistedPatch } : g)));
    if (hasFirebaseConfig && db) {
      try {
        await updateItem('users', id, persistedPatch);
      } catch (e) {
        console.warn('Firestore update user:', e);
      }
    }
    addToast('Guard Updated', `Guard record has been updated.`, 'info');
  };

  const enrollGuardFace = async (guard, capture) => {
    if (!guard?.id) throw new Error('Select a guard before enrolling a face.');
    if (!capture?.dataUrl) throw new Error('Capture a face photo before enrolling.');

    const enrolledAt = new Date();
    const enrolledAtLabel = enrolledAt.toLocaleString();
    const storagePath = `faceProfiles/${guard.id}/enrollment-${enrolledAt.getTime()}.jpg`;
    let facePhotoUrl = '';

    if (hasFirebaseConfig && db) {
      try {
        facePhotoUrl = await uploadDataUrl(storagePath, capture.dataUrl);
      } catch (e) {
        console.warn('Firebase Storage face upload:', e);
      }
    }

    const userPatch = {
      faceVerified: true,
      faceVerifiedAt: enrolledAtLabel,
      faceEnrollmentStatus: 'enrolled',
      faceProfileId: guard.id,
      facePhotoUrl: facePhotoUrl || guard.facePhotoUrl || '',
      faceDetectorSupported: Boolean(capture.faceDetectorSupported),
      faceDetected: capture.faceDetected !== false,
    };

    if (!facePhotoUrl) {
      userPatch.facePhoto = capture.dataUrl;
    }

    const faceProfile = {
      guardId: guard.id,
      guardName: guard.name || 'Guard',
      siteId: guard.siteId || '',
      siteName: guard.siteName || '',
      imageUrl: facePhotoUrl,
      imageDataUrl: facePhotoUrl ? '' : capture.dataUrl,
      storagePath: facePhotoUrl ? storagePath : '',
      faceDetected: capture.faceDetected !== false,
      faceCount: capture.faceCount ?? null,
      detector: capture.faceDetectorSupported ? 'browser-face-detector' : 'manual-review',
      source: 'web-command-center',
      enrolledAt: enrolledAt.toISOString(),
      updatedAt: enrolledAt.toISOString(),
    };

    const attendanceRecord = {
      guardId: guard.id,
      guardName: guard.name || 'Guard',
      siteId: guard.siteId || '',
      siteName: guard.siteName || '',
      date: enrolledAt.toLocaleDateString(),
      timeIn: enrolledAt.toISOString(),
      timestamp: enrolledAt.toISOString(),
      status: 'Face Enrolled',
      faceVerified: true,
      source: 'web-command-center',
    };

    setGuards((prev) => prev.map((g) => (g.id === guard.id ? { ...g, ...userPatch } : g)));

    if (hasFirebaseConfig && db) {
      try {
        await setItem('faceProfiles', guard.id, faceProfile);
        await updateItem('users', guard.id, userPatch);
        await addItem('attendance', attendanceRecord);
      } catch (e) {
        console.warn('Firestore face enrollment:', e);
        throw e;
      }
    }

    addToast('Face Enrollment Saved', `${guard.name}'s face profile is ready for guard app login.`, 'success');
    return { ...userPatch, faceProfile };
  };

  const deleteGuardFace = async (guard) => {
    if (!guard?.id) throw new Error('Select a guard before deleting face recognition.');

    const userPatch = {
      faceVerified: false,
      faceVerifiedAt: 'Pending',
      faceEnrollmentStatus: 'pending',
      faceEmbedding: [],
      faceProfileId: null,
      facePhotoUrl: '',
      facePhoto: '',
      faceDetected: false,
      faceDetectorSupported: false,
    };

    setGuards((prev) => prev.map((g) => (g.id === guard.id ? { ...g, ...userPatch } : g)));

    if (hasFirebaseConfig && db) {
      try {
        await removeItem('faceProfiles', guard.id);
      } catch (e) {
        if (e.code !== 'not-found') throw e;
      }
      await updateItem('users', guard.id, userPatch);
    }

    addToast('Face Recognition Deleted', `${guard.name}'s profile can now be enrolled again.`, 'success');
  };

  const deleteGuard = async (id) => {
    const target = guards.find((g) => g.id === id);
    setGuards((prev) => prev.filter((g) => g.id !== id));
    if (hasFirebaseConfig && db) {
      try {
        await removeItem('users', id);
      } catch (e) {
        console.warn('Firestore delete user:', e);
      }
    }
    addToast('Guard Removed', `${target?.name || 'Guard'} has been removed from the roster.`, 'danger');
  };

  // -------------------------------------------------------------
  // CRUD — Sites
  // -------------------------------------------------------------
  const persistSiteImage = async (siteId, image) => {
    if (!image?.startsWith('data:') || !hasFirebaseConfig || !db) return image || '';
    try {
      return await uploadDataUrl(`siteProfiles/${siteId}/cover-image`, image);
    } catch (error) {
      console.warn('Firebase Storage site image upload:', error);
      return image;
    }
  };

  const addSite = async (newSite) => {
    const siteId = `SITE-${Date.now().toString().slice(-4)}`;
    const image = await persistSiteImage(siteId, newSite.image);
    const created = {
      id: siteId,
      name: newSite.name,
      clientId: newSite.clientId || profile?.clientId || '',
      type: newSite.type || 'Commercial',
      client: newSite.client || 'Client Organization',
      address: newSite.address || 'Deployment Address',
      activeGuardsCount: 0,
      checkpointsCount: 0,
      routesCount: 0,
      incidentsCount: 0,
      status: newSite.status || 'Active',
      // Preserve geocoded coordinates — null means no pin yet
      lat: newSite.lat || null,
      lng: newSite.lng || null,
      image: image || 'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&w=500&q=80'
    };

    setSites((prev) => [created, ...prev]);

    if (hasFirebaseConfig && db) {
      try {
        await addItem('sites', created);
      } catch (e) {
        console.warn('Firestore add site:', e);
      }
    }
    addToast('Site Added', `${created.name} added to deployment inventory.`, 'success');
  };

  const updateSite = async (id, patch) => {
    const sitePatch = { ...patch };
    if (patch.image?.startsWith('data:')) sitePatch.image = await persistSiteImage(id, patch.image);
    delete sitePatch.checkpointsCount;
    setSites((prev) => prev.map((s) => (s.id === id ? { ...s, ...sitePatch } : s)));
    if (hasFirebaseConfig && db) {
      try {
        await updateItem('sites', id, sitePatch);
      } catch (e) {
        console.warn('Firestore update site:', e);
      }
    }
    addToast('Site Updated', `Site record has been updated.`, 'info');
  };

  const deleteSite = async (id) => {
    const target = sites.find((s) => s.id === id);
    setSites((prev) => prev.filter((s) => s.id !== id));
    if (hasFirebaseConfig && db) {
      try {
        await removeItem('sites', id);
      } catch (e) {
        console.warn('Firestore delete site:', e);
      }
    }
    addToast('Site Removed', `${target?.name || 'Site'} has been removed.`, 'danger');
  };

  // -------------------------------------------------------------
  // CRUD — Clients
  // -------------------------------------------------------------
  const addClient = async (newClient) => {
    const created = {
      id: `CLT-${Date.now().toString().slice(-4)}`,
      company: newClient.company,
      contactPerson: newClient.contactPerson || 'Contact Person',
      email: newClient.email || 'contact@client.com',
      phone: newClient.phone || 'N/A',
      supervisor: newClient.supervisor || 'Unassigned',
      status: newClient.status || 'Active',
      deploymentsCount: 0,
      assignedGuards: 0,
      slaCompliance: 100,
      contractStart: newClient.contractStart || '',
      contractEnd: newClient.contractEnd || '',
      notes: newClient.notes || ''
    };

    setClients((prev) => [created, ...prev]);

    if (hasFirebaseConfig && db) {
      try {
        await setItem('clients', created.id, created);
      } catch (e) {
        throw new Error('The client record could not be saved. No login account was created.');
      }
    }
    addToast('Client Added', `${created.company} has been onboarded.`, 'success');
    return created.id;
  };

  const updateClient = async (id, patch) => {
    setClients((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
    if (hasFirebaseConfig && db) {
      try {
        await updateItem('clients', id, patch);
      } catch (e) {
        console.warn('Firestore update client:', e);
      }
    }
    addToast('Client Updated', `Client record has been updated.`, 'info');
  };

  const deleteClient = async (id) => {
    const target = clients.find((c) => c.id === id);
    setClients((prev) => prev.filter((c) => c.id !== id));
    if (hasFirebaseConfig && db) {
      try {
        await removeItem('clients', id);
      } catch (e) {
        console.warn('Firestore delete client:', e);
      }
    }
    addToast('Client Removed', `${target?.company || 'Client'} has been removed.`, 'danger');
  };

  // -------------------------------------------------------------
  // CRUD — Incidents
  // -------------------------------------------------------------
  const addIncident = async (newInc) => {
    const created = {
      id: `INC-${Date.now().toString().slice(-4)}`,
      title: newInc.title,
      priority: newInc.priority || 'High',
      siteName: newInc.siteName || 'Deployment Site',
      location: newInc.location || 'Perimeter Zone',
      reporterName: newInc.reporterName || 'Duty Guard',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      status: 'Investigating',
      photoUrls: Array.isArray(newInc.photoUrls) ? newInc.photoUrls.filter(Boolean) : [],
      photoCount: Array.isArray(newInc.photoUrls) ? newInc.photoUrls.filter(Boolean).length : 0,
      evidencePhoto: newInc.evidencePhoto || '',
      description: newInc.description || 'Incident filed by supervisor.',
      actionsTaken: 'Dispatch notification logged.'
    };

    setIncidents((prev) => [created, ...prev]);

    if (hasFirebaseConfig && db) {
      try {
        await addItem('incidents', created);
      } catch (e) {
        console.warn('Firestore add incident:', e);
      }
    }
    addToast('Incident Logged', `Priority incident ${created.id} submitted.`, 'danger');
  };

  const updateIncidentStatus = async (incidentId, newStatus) => {
    setIncidents((prev) =>
      prev.map((i) => (i.id === incidentId ? { ...i, status: newStatus } : i))
    );

    if (hasFirebaseConfig && db) {
      try {
        await updateItem('incidents', incidentId, { status: newStatus });
      } catch (err) {
        console.warn('Firestore update:', err);
      }
    }
  };

  const deleteIncident = async (id) => {
    const target = incidents.find((i) => i.id === id);
    setIncidents((prev) => prev.filter((i) => i.id !== id));
    if (hasFirebaseConfig && db) {
      try {
        await removeItem('incidents', id);
      } catch (e) {
        console.warn('Firestore delete incident:', e);
      }
    }
    addToast('Incident Removed', `Incident ${target?.id || id} has been deleted.`, 'danger');
  };

  // -------------------------------------------------------------
  // Assign Device to Guard
  // -------------------------------------------------------------
  const assignDeviceToGuard = async (guardId, deviceId) => {
    const guard = guards.find((g) => g.id === guardId);
    if (!guard) return;

    // Optimistic update
    setGuards((prev) =>
      prev.map((g) => (g.id === guardId ? { ...g, deviceId: deviceId || null } : g))
    );

    if (hasFirebaseConfig && db) {
      try {
        await updateItem('users', guardId, { deviceId: deviceId || null });
      } catch (e) {
        console.warn('Firestore assign device:', e);
      }
    }

    if (deviceId) {
      addToast(
        'Device Assigned',
        `Device bound to ${guard.name}. Chime alert active.`,
        'success'
      );
      playChime();
    } else {
      addToast('Device Unlinked', `${guard.name}'s device binding has been removed.`, 'info');
    }
  };

  // -------------------------------------------------------------
  // CRUD — Patrols
  // -------------------------------------------------------------
  const addPatrol = async (newPatrol) => {
    const created = {
      id: `PAT-${Date.now().toString().slice(-4)}`,
      guardId: newPatrol.guardId || '',
      guardName: newPatrol.guardName || 'Assigned Guard',
      guardPhoto: '',
      clientId: newPatrol.clientId || '',
      siteId: newPatrol.siteId || '',
      siteName: newPatrol.siteName || 'Facility Site',
      routeName: newPatrol.routeName || 'Perimeter Sweep',
      status: 'In Progress',
      progressPct: 0,
      completedCount: 0,
      totalCount: 5,
      remainingCount: 5,
      etaMinutes: 30,
      startTime: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      checkpoints: [
        { id: 'CP-1', name: 'Entrance Gate', status: 'Pending' },
        { id: 'CP-2', name: 'Main Lobby', status: 'Pending' },
        { id: 'CP-3', name: 'Vault Entrance', status: 'Pending' }
      ]
    };

    setPatrols((prev) => [created, ...prev]);

    if (hasFirebaseConfig && db) {
      try {
        await addItem('patrol_logs', created);
      } catch (e) {
        console.warn('Firestore add patrol:', e);
      }
    }
    addToast('Patrol Initiated', `Route ${created.routeName} assigned.`, 'success');
  };

  const saveSchedule = async (schedule) => {
    const record = { ...schedule, clientId: schedule.clientId || profile?.clientId || '' };
    if (record.id) await updateItem('schedules', record.id, record);
    else await addItem('schedules', record);
  };

  // Compute stats dynamically from active DB datasets
  const stats = {
    activeGuards: guards.length,
    currentlyOnPatrol: patrols.filter((p) => p.status === 'In Progress').length,
    todaysPatrols: patrols.length,
    completedPatrols: patrols.filter((p) => p.status === 'Completed').length,
    delayedPatrols: patrols.filter((p) => p.status === 'Late' || p.startedLate === true).length,
    missedPatrols: patrols.filter((p) => p.status === 'Missed').length,
    offlineGuards: guards.filter((g) => g.status === 'Offline' || g.status === 'Off Duty').length,
    incidentsToday: incidents.length,
    avgPatrolDurationMinutes: patrols.length ? Math.round(patrols.reduce((sum, patrol) => sum + Math.max(0, 60 - (patrol.etaMinutes || 0)), 0) / patrols.length) : 0,
    avgDelayMinutes: patrols.length ? Number((patrols.reduce((sum, patrol) => sum + (patrol.status === 'Delayed' || patrol.status === 'Late' ? patrol.etaMinutes || 0 : 0), 0) / patrols.length).toFixed(1)) : 0,
    attendanceRate: attendance.length ? Number((attendance.filter((record) => record.status === 'Present' || record.status === 'Face Enrolled').length / attendance.length * 100).toFixed(1)) : 0,
    faceVerificationSuccessRate: attendance.length ? Number((attendance.filter((record) => record.faceVerified).length / attendance.length * 100).toFixed(1)) : 0,
    offlineSessionsCount: guards.filter((g) => g.status === 'Offline').length,
    synchronizationSuccessRate: devices.length ? Number((devices.filter((device) => device.lastActive).length / devices.length * 100).toFixed(1)) : 0,
    qrCompletionRate: checkpointLogs.length ? Number((checkpointLogs.filter((log) => log.verified).length / checkpointLogs.length * 100).toFixed(1)) : 0,
    gpsAccuracyMeters: guards.length ? Number((guards.reduce((sum, guard) => sum + (Number.parseFloat(guard.gpsAccuracy) || 0), 0) / guards.length).toFixed(1)) : 0
  };

  // Keyboard shortcut listener for Ctrl + K
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setGlobalSearchOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <SpotContext.Provider
      value={{
        sidebarCollapsed,
        toggleSidebar,
        dbConnected,
        guards,
        sites,
        clients,
        checkpoints,
        schedules,
        patrols,
        incidents,
        auditLogs,
        liveEvents,
        devices,
        attendance,
        checkpointLogs,
        guardLocations,
        stats,
        selectedGuard,
        isGuardDrawerOpen,
        openGuardDrawer,
        closeGuardDrawer,
        globalSearchOpen,
        setGlobalSearchOpen,
        toasts,
        addToast,
        removeToast,
        // Guards CRUD
        addGuard,
        updateGuard,
        enrollGuardFace,
        deleteGuardFace,
        deleteGuard,
        // Sites CRUD
        addSite,
        updateSite,
        deleteSite,
        // Clients CRUD
        addClient,
        updateClient,
        deleteClient,
        // Incidents CRUD
        addIncident,
        updateIncidentStatus,
        deleteIncident,
        // Patrols
        addPatrol,
        saveSchedule,
        // Devices
        assignDeviceToGuard,
      }}
    >
      {children}
    </SpotContext.Provider>
  );
}

export const useSpot = () => useContext(SpotContext);

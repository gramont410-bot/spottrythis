import React, { useRef, useState, useEffect, useCallback } from 'react';
import Layout from '../components/Layout';
import GuardAvatar from '../components/GuardAvatar';
import { useSpot } from '../context/SpotContext';
import { useAuth } from '../context/AuthContext';
import { estimateFaceMatchScore } from '../lib/faceRecognition';
import { hasFaceApiConfig, verifyFaceWithApi } from '../lib/faceApi';
import {
  Camera, ShieldCheck, X, ScanFace, AlertTriangle, CheckCircle2,
  RefreshCw, UserCheck, SunMedium
} from 'lucide-react';

// ─── Simple pixel-based brightness comparison for face detection hint ─────────
function getBrightnessFraction(ctx, w, h) {
  const data = ctx.getImageData(0, 0, w, h).data;
  let total = 0;
  for (let i = 0; i < data.length; i += 4) {
    total += (data[i] + data[i + 1] + data[i + 2]) / 3;
  }
  return total / (w * h * 255);
}

// ─── Capture a base64 JPEG from the video element ────────────────────────────
function captureFrame(videoEl, size = 320) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  // Center-crop
  const vw = videoEl.videoWidth;
  const vh = videoEl.videoHeight;
  const dim = Math.min(vw, vh);
  const sx = (vw - dim) / 2;
  const sy = (vh - dim) / 2;
  ctx.drawImage(videoEl, sx, sy, dim, dim, 0, 0, size, size);
  const brightness = getBrightnessFraction(ctx, size, size);
  return { dataUrl: canvas.toDataURL('image/jpeg', 0.85), brightness };
}

function dataUrlToBlob(dataUrl) {
  const [header, base64] = dataUrl.split(',');
  const mime = header.match(/:(.*?);/)?.[1] || 'image/jpeg';
  const bytes = atob(base64);
  const buffer = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i += 1) {
    buffer[i] = bytes.charCodeAt(i);
  }
  return new Blob([buffer], { type: mime });
}

async function detectFaces(dataUrl) {
  if (!('FaceDetector' in window)) {
    return { supported: false, faceDetected: false, faceCount: null };
  }

  const detector = new window.FaceDetector({ fastMode: false, maxDetectedFaces: 2 });
  const bitmap = await createImageBitmap(dataUrlToBlob(dataUrl));
  try {
    const faces = await detector.detect(bitmap);
    return {
      supported: true,
      faceDetected: faces.length > 0,
      faceCount: faces.length,
    };
  } finally {
    bitmap.close?.();
  }
}

async function getReferenceFaceDataUrl(guard) {
  if (!guard) return null;

  const candidateUrls = [guard.facePhoto, guard.facePhotoUrl];
  for (const value of candidateUrls) {
    if (!value) continue;
    if (value.startsWith('data:')) return value;
    if (value.startsWith('http')) {
      try {
        const response = await fetch(value);
        if (!response.ok) continue;
        const blob = await response.blob();
        return await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
      } catch {
        continue;
      }
    }
  }

  return null;
}

// ─── Guard selector pill ──────────────────────────────────────────────────────
function GuardPill({ guard, selected, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs transition ${
        selected
          ? 'border-blue-500 bg-blue-500/20 text-blue-300'
          : 'border-slate-700 bg-slate-900/60 text-slate-400 hover:border-slate-500'
      }`}
    >
      <GuardAvatar photo={guard.photo} name={guard.name} size="h-6 w-6" />
      <span className="font-semibold">{guard.name}</span>
      {guard.faceVerified && (
        <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
      )}
    </button>
  );
}

export default function FaceVerify() {
  const { guards, addToast, enrollGuardFace, deleteGuardFace } = useSpot();
  const { profile } = useAuth();
  const canManageFaceProfiles = ['superadmin', 'admin'].includes(String(profile?.role || '').toLowerCase());

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const intervalRef = useRef(null);
  const resetTimerRef = useRef(null);
  const autoCaptureRef = useRef(false);
  const faceStabilityRef = useRef(0);
  const captureHandlerRef = useRef(null);

  const [selectedGuard, setSelectedGuard] = useState(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [capturedImage, setCapturedImage] = useState(null);
  const [capturedFace, setCapturedFace] = useState(null);
  const [status, setStatus] = useState('idle'); // idle | capturing | verifying | success | failed
  const [savingEnrollment, setSavingEnrollment] = useState(false);
  const [brightness, setBrightness] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [faceScanProgress, setFaceScanProgress] = useState(0);

  const guardList = guards.filter(
    g => g.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  useEffect(() => {
    if (!selectedGuard) return;
    const freshGuard = guards.find((guard) => guard.id === selectedGuard.id);
    if (freshGuard) setSelectedGuard(freshGuard);
  }, [guards, selectedGuard?.id]);

  // ─── Start camera ───────────────────────────────────────────────────────────
  const startCamera = useCallback(async () => {
    try {
      setCameraError('');
      setCapturedImage(null);
      setCapturedFace(null);
      autoCaptureRef.current = false;
      faceStabilityRef.current = 0;
      setFaceScanProgress(0);

      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Camera capture is not supported in this browser.');
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: 640, height: 480 }
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraActive(true);
      setStatus('capturing');

      // Live preview frames
      intervalRef.current = setInterval(() => {
        if (!videoRef.current || !videoRef.current.videoWidth) return;
        const { brightness: b } = captureFrame(videoRef.current, 240);
        setBrightness(b);
      }, 200);
    } catch (e) {
      setStatus('failed');
      setCameraActive(false);
      setCameraError(e.message || 'Camera access was denied.');
      addToast('Camera Unavailable', e.message || 'Please allow camera access and try again.', 'danger');
    }
  }, [addToast]);

  // ─── Stop camera ────────────────────────────────────────────────────────────
  const stopCamera = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraActive(false);
    setStatus('idle');
    setBrightness(0);
  }, []);

  useEffect(() => () => {
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    stopCamera();
  }, [stopCamera]);

  // ─── Capture face photo ─────────────────────────────────────────────────────
  const handleCapture = async () => {
    if (!videoRef.current || !videoRef.current.videoWidth) {
      addToast('Camera Warming Up', 'Please wait for the camera preview to appear.', 'info');
      return;
    }

    const { dataUrl, brightness: b } = captureFrame(videoRef.current, 320);

    if (b < 0.12) {
      addToast('Low Light', 'Face not clearly visible. Please improve lighting.', 'danger');
      return;
    }

    setCapturedImage(dataUrl);
    setCapturedFace(null);
    setStatus('verifying');

    try {
      const result = await detectFaces(dataUrl);
      if (result.supported && !result.faceDetected) {
        setCapturedImage(null);
        setStatus('capturing');
        addToast('No Face Detected', 'Please center the guard face in the frame and capture again.', 'danger');
        return;
      }

      let aiMatchScore = null;
      let aiMatch = null;
      const referenceFace = await getReferenceFaceDataUrl(selectedGuard);

      if (referenceFace) {
        if (hasFaceApiConfig()) {
          try {
            const apiResult = await verifyFaceWithApi(dataUrl, referenceFace);
            if (apiResult) {
              aiMatchScore = Number(apiResult.score || 0);
              aiMatch = Boolean(apiResult.success);
              if (apiResult.success) {
                addToast('Azure Face Verified', `${selectedGuard.name} matched the enrolled face profile with ${(aiMatchScore * 100).toFixed(0)}% confidence.`, 'success');
              }
            }
          } catch (apiError) {
            console.warn('Azure Face verification failed, falling back to heuristic:', apiError);
          }
        }

        if (aiMatchScore === null) {
          aiMatchScore = estimateFaceMatchScore(dataUrl, referenceFace);
          aiMatch = aiMatchScore >= 0.72;
        }
      }

      const nextFaceCheck = {
        ...result,
        aiMatchScore,
        aiMatch,
        referenceAvailable: Boolean(referenceFace),
      };

      setCapturedFace(nextFaceCheck);

      if (referenceFace && aiMatchScore !== null && !aiMatch) {
        addToast('AI Face Mismatch', `Similarity score ${aiMatchScore.toFixed(2)} is too low for ${selectedGuard.name}. Please retake the photo or select the correct guard.`, 'warning');
      }

      if (!result.supported) {
        addToast('Manual Face Review', 'This browser cannot run native face detection. The captured photo can still be enrolled for the guard app.', 'info');
      }
    } catch (e) {
      setCapturedFace({ supported: false, faceDetected: true, faceCount: null, aiMatchScore: null, aiMatch: null, referenceAvailable: false });
      addToast('Face Detection Skipped', 'The photo was captured, but browser face detection was unavailable.', 'info');
    }
  };

  captureHandlerRef.current = handleCapture;

  useEffect(() => {
    if (!cameraActive || capturedImage) return undefined;
    const scanTimer = setInterval(async () => {
      if (autoCaptureRef.current || !videoRef.current?.videoWidth) return;
      try {
        const frame = captureFrame(videoRef.current, 240);
        if (frame.brightness < 0.12) {
          faceStabilityRef.current = 0;
          setFaceScanProgress(0);
          return;
        }
        const result = await detectFaces(frame.dataUrl);
        faceStabilityRef.current = result.supported && result.faceDetected ? faceStabilityRef.current + 1 : 0;
        setFaceScanProgress(Math.min((faceStabilityRef.current / 3) * 100, 100));
        if (faceStabilityRef.current >= 3 && captureHandlerRef.current) {
          autoCaptureRef.current = true;
          await captureHandlerRef.current();
        }
      } catch {
        setFaceScanProgress(0);
      }
    }, 650);
    return () => clearInterval(scanTimer);
  }, [cameraActive, capturedImage]);

  // Save enrollment profile and attendance record.
  const handleVerify = async () => {
    if (!selectedGuard || !capturedImage || savingEnrollment) return;

    if (capturedFace?.referenceAvailable && capturedFace.aiMatch === false) {
      setStatus('failed');
      addToast('AI Face Mismatch', `Similarity score ${((capturedFace.aiMatchScore ?? 0)).toFixed(2)} is too low. Please retake the face or pick the correct guard.`, 'danger');
      return;
    }

    setStatus('verifying');
    setSavingEnrollment(true);

    try {
      const patch = await enrollGuardFace(selectedGuard, {
        dataUrl: capturedImage,
        faceDetectorSupported: Boolean(capturedFace?.supported),
        faceDetected: capturedFace?.faceDetected !== false,
        faceCount: capturedFace?.faceCount ?? null,
        aiMatchScore: capturedFace?.aiMatchScore ?? null,
        aiMatch: capturedFace?.aiMatch ?? null,
      });
      setSelectedGuard((prev) => (prev ? { ...prev, ...patch } : prev));

      setStatus('success');
      addToast('Face Profile Enrolled', `${selectedGuard.name}'s face profile was saved for guard app login.`, 'success');

      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
      resetTimerRef.current = setTimeout(() => {
        setCapturedImage(null);
        setCapturedFace(null);
        setStatus('capturing');
        resetTimerRef.current = null;
      }, 3000);
    } catch (e) {
      setStatus('failed');
      addToast('Enrollment Failed', e.message || 'Could not save face data.', 'danger');
    } finally {
      setSavingEnrollment(false);
    }
  };

  const handleRetake = () => {
    setCapturedImage(null);
    setCapturedFace(null);
    setStatus('capturing');
    autoCaptureRef.current = false;
    faceStabilityRef.current = 0;
    setFaceScanProgress(0);
  };

  const handleReset = () => {
    if (resetTimerRef.current) {
      clearTimeout(resetTimerRef.current);
      resetTimerRef.current = null;
    }
    stopCamera();
    setCapturedImage(null);
    setCapturedFace(null);
    setSavingEnrollment(false);
    setCameraError('');
    autoCaptureRef.current = false;
    faceStabilityRef.current = 0;
    setFaceScanProgress(0);
  };

  const handleDeleteEnrollment = async () => {
    if (!selectedGuard || !canManageFaceProfiles || !window.confirm(`Delete face recognition for ${selectedGuard.name}? They will need to be enrolled again.`)) return;

    try {
      await deleteGuardFace(selectedGuard);
      handleReset();
      setSelectedGuard((prev) => (prev ? {
        ...prev,
        faceVerified: false,
        faceVerifiedAt: 'Pending',
        faceEnrollmentStatus: 'pending',
        faceProfileId: null,
        facePhotoUrl: '',
        facePhoto: '',
      } : prev));
    } catch (e) {
      addToast('Delete Failed', e.message || 'Could not delete the face profile.', 'danger');
    }
  };

  const handleSelectGuard = (guard) => {
    stopCamera();
    setSelectedGuard(guard);
    setCapturedImage(null);
    setCapturedFace(null);
    setSavingEnrollment(false);
    setCameraError('');
  };

  const statusColor = {
    idle: 'text-slate-400',
    capturing: 'text-blue-400',
    verifying: 'text-amber-400',
    success: 'text-emerald-400',
    failed: 'text-rose-400',
  };

  const statusLabel = {
    idle: 'Select a guard and start camera',
    capturing: 'Position face in frame, then capture',
    verifying: 'Review the captured photo',
    success: 'Face enrollment saved!',
    failed: 'Enrollment failed - please retry',
  };

  return (
    <Layout
      title="Face Enrollment Center"
      subtitle="Capture a guard face profile for guard app login"
    >
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* ── Left: Guard Selector ─────────────────────────────────────────── */}
        <div className="space-y-4">
          <div className="card-spot p-5 space-y-4">
            <div className="flex items-center gap-2">
              <UserCheck className="h-5 w-5 text-blue-400" />
              <span className="text-sm font-bold text-white">Select Guard</span>
            </div>

            <input
              className="input-spot text-xs"
              placeholder="Search guard..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />

            <div className="flex flex-col gap-2 max-h-[60vh] overflow-y-auto custom-scrollbar pr-1">
              {guardList.length === 0 && (
                <div className="text-xs text-slate-500 text-center py-6">No guards found</div>
              )}
              {guardList.map(guard => (
                <GuardPill
                  key={guard.id}
                  guard={guard}
                  selected={selectedGuard?.id === guard.id}
                  onClick={() => handleSelectGuard(guard)}
                />
              ))}
            </div>
          </div>

          {/* Selected guard detail */}
          {selectedGuard && (
            <div className="card-spot p-5 space-y-3">
              <GuardAvatar photo={selectedGuard.photo} name={selectedGuard.name} size="h-20 w-20" rounded="rounded-2xl" />
              <div className="text-center">
                <div className="text-sm font-bold text-white">{selectedGuard.name}</div>
                <div className="text-xs text-slate-400">{selectedGuard.siteName}</div>
              </div>
              <div className={`flex items-center justify-center gap-1.5 text-xs font-bold ${selectedGuard.faceVerified ? 'text-emerald-400' : 'text-amber-400'}`}>
                {selectedGuard.faceVerified
                  ? <><ShieldCheck className="h-3.5 w-3.5" /> Enrolled - {selectedGuard.faceVerifiedAt}</>
                  : <><AlertTriangle className="h-3.5 w-3.5" /> Not Yet Enrolled</>}
              </div>
                {canManageFaceProfiles && selectedGuard.faceVerified && (
                  <button
                    onClick={handleDeleteEnrollment}
                    className="btn-secondary w-full text-xs text-rose-400 hover:text-rose-300"
                  >
                    Delete Face Recognition
                  </button>
                )}
            </div>
          )}
        </div>

        {/* ── Center: Camera / Capture View ───────────────────────────────── */}
        <div className="lg:col-span-2 space-y-4">
          <div className="card-spot p-6 space-y-4">

            {/* Status bar */}
            <div className="flex items-center justify-between">
              <div className={`flex items-center gap-2 text-sm font-semibold ${statusColor[status]}`}>
                <ScanFace className="h-5 w-5" />
                {statusLabel[status]}
              </div>
              {cameraActive && (
                <button onClick={handleReset} className="btn-secondary text-xs flex items-center gap-1.5">
                  <X className="h-3.5 w-3.5" /> Stop Camera
                </button>
              )}
            </div>

            {/* Camera / preview area */}
            <div className="relative w-full aspect-square max-w-sm mx-auto rounded-2xl overflow-hidden border-2 border-slate-700 bg-slate-950">

              {/* Live video (hidden but captures stream) */}
              <video
                ref={videoRef}
                className="absolute inset-0 w-full h-full object-cover"
                style={{ display: cameraActive && !capturedImage ? 'block' : 'none', transform: 'scaleX(-1)' }}
                muted
                playsInline
              />

              {/* Captured still */}
              {capturedImage && (
                <img
                  src={capturedImage}
                  alt="Captured face"
                  className="absolute inset-0 w-full h-full object-cover"
                  style={{ transform: 'scaleX(-1)' }}
                />
              )}

              {/* Idle / no camera */}
              {!cameraActive && !capturedImage && (
                <div className="flex flex-col items-center justify-center h-full gap-4 text-slate-500">
                  <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
                    <Camera className="h-10 w-10" />
                  </div>
                  <div className="text-sm font-medium">Camera not started</div>
                </div>
              )}

              {/* Face guide overlay */}
              {cameraActive && !capturedImage && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="face-scan-frame h-48 w-40 rounded-full border-4 border-cyan-300/70 shadow-[0_0_40px_rgba(34,211,238,0.3)]"><span className="face-scan-line" /></div>
                </div>
              )}

              {cameraActive && !capturedImage && (
                <div className="absolute bottom-3 left-4 right-4 rounded-lg border border-cyan-300/20 bg-slate-950/70 p-2 text-center text-[10px] font-semibold uppercase tracking-wider text-cyan-200 backdrop-blur-sm">
                  {faceScanProgress >= 100 ? 'Face locked - capturing' : 'Scanning face'}
                  <div className="mt-1 h-1 overflow-hidden rounded-full bg-slate-700"><div className="h-full rounded-full bg-cyan-300 transition-all" style={{ width: `${faceScanProgress}%` }} /></div>
                </div>
              )}

              {/* Success overlay */}
              {status === 'success' && (
                <div className="absolute inset-0 bg-emerald-500/30 flex items-center justify-center">
                  <CheckCircle2 className="h-20 w-20 text-emerald-400 drop-shadow-lg" />
                </div>
              )}
            </div>

            {/* Brightness indicator */}
            {cameraActive && !capturedImage && (
              <div className="flex items-center gap-3 text-xs text-slate-400">
                <SunMedium className="h-4 w-4 text-amber-400" />
                <span>Lighting:</span>
                <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${brightness > 0.3 ? 'bg-emerald-500' : brightness > 0.15 ? 'bg-amber-500' : 'bg-rose-500'}`}
                    style={{ width: `${Math.min(brightness * 200, 100)}%` }}
                  />
                </div>
                <span className={brightness > 0.3 ? 'text-emerald-400' : brightness > 0.15 ? 'text-amber-400' : 'text-rose-400'}>
                  {brightness > 0.3 ? 'Good' : brightness > 0.15 ? 'Low' : 'Too Dark'}
                </span>
              </div>
            )}

            {capturedFace && (
              <div className="rounded-xl border border-slate-700 bg-slate-950/80 p-3 text-xs text-slate-300">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-semibold text-slate-200">AI Face Check</span>
                  {capturedFace.aiMatchScore !== null && (
                    <span className={`font-bold ${capturedFace.aiMatch ? 'text-emerald-400' : 'text-amber-400'}`}>
                      {capturedFace.aiMatchScore.toFixed(2)}
                    </span>
                  )}
                </div>
                <div className="mt-2 flex items-center justify-between gap-3 text-[11px] text-slate-400">
                  <span>Browser detection</span>
                  <span className={capturedFace.faceDetected ? 'text-emerald-400' : 'text-rose-400'}>
                    {capturedFace.faceDetected ? 'Face found' : 'No face found'}
                  </span>
                </div>
                {capturedFace.aiMatchScore !== null && (
                  <div className="mt-1 flex items-center justify-between gap-3 text-[11px] text-slate-400">
                    <span>AI similarity</span>
                    <span className={capturedFace.aiMatch ? 'text-emerald-400' : 'text-amber-400'}>
                      {capturedFace.aiMatch ? 'Match' : 'Review'}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Action buttons */}
            <div className="flex gap-3 justify-center flex-wrap">
              {!cameraActive && !capturedImage && (
                <button
                  onClick={startCamera}
                  disabled={!selectedGuard}
                  className="btn-primary flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Camera className="h-4 w-4" />
                  {selectedGuard ? 'Start Camera' : 'Select a Guard First'}
                </button>
              )}

              {cameraActive && !capturedImage && (
                <button
                  onClick={handleCapture}
                  className="btn-primary flex items-center gap-2 text-sm px-6 py-2.5"
                >
                  <ScanFace className="h-4 w-4" /> Capture Face
                </button>
              )}

              {capturedImage && status !== 'success' && (
                <>
                  <button
                    onClick={handleRetake}
                    className="btn-secondary flex items-center gap-2"
                  >
                    <RefreshCw className="h-4 w-4" /> Retake
                  </button>
                  <button
                    onClick={handleVerify}
                    disabled={savingEnrollment || (status === 'verifying' && !capturedFace)}
                    className="btn-primary flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <ShieldCheck className="h-4 w-4" />
                    {savingEnrollment ? 'Saving...' : status === 'verifying' && !capturedFace ? 'Checking Face...' : 'Save Face Enrollment'}
                  </button>
                </>
              )}

              {status === 'success' && (
                <button
                  onClick={() => {
                    handleReset();
                    setSelectedGuard(null);
                  }}
                  className="btn-secondary flex items-center gap-2"
                >
                  <RefreshCw className="h-4 w-4" /> Enroll Another Guard
                </button>
              )}
            </div>

            {cameraError && (
              <div className="flex items-center gap-2 text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-xl p-3">
                <AlertTriangle className="h-4 w-4 shrink-0" /> {cameraError}
              </div>
            )}
          </div>

          {/* Enrolled guards grid */}
          <div className="card-spot p-5 space-y-3">
            <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Recently Enrolled Guards
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {guards.filter(g => g.faceVerified).length === 0 && (
                <div className="col-span-3 text-xs text-slate-500 text-center py-4">No guards enrolled yet</div>
              )}
              {guards.filter(g => g.faceVerified).map(g => (
                <div key={g.id} className="flex items-center gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3">
                  <GuardAvatar photo={g.photo} name={g.name} size="h-8 w-8" />
                  <div>
                    <div className="text-xs font-bold text-white">{g.name}</div>
                    <div className="text-[10px] text-emerald-400 flex items-center gap-1">
                      <ShieldCheck className="h-2.5 w-2.5" /> Enrolled
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}

import * as faceapi from 'face-api.js';

const MODEL_URL = 'https://justadudewhohacks.github.io/face-api.js/models';
let modelsLoaded = false;
let loadPromise = null;

async function loadModels() {
  if (modelsLoaded) return;
  if (!loadPromise) {
    loadPromise = Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
      faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
    ]).then(() => {
      modelsLoaded = true;
    });
  }

  await loadPromise;
}

function dataUrlToBlob(dataUrl) {
  const [header, base64] = dataUrl.split(',');
  if (!header || !base64) return null;

  const mime = header.match(/:(.*?);/)?.[1] || 'image/jpeg';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  return new Blob([bytes], { type: mime });
}

async function createImageFromDataUrl(dataUrl) {
  const blob = dataUrlToBlob(dataUrl);
  if (!blob) throw new Error('Invalid data URL');

  const objectUrl = URL.createObjectURL(blob);
  const img = await faceapi.fetchImage(objectUrl);
  URL.revokeObjectURL(objectUrl);
  return img;
}

export function hasFaceApiConfig() {
  return true;
}

export async function verifyFaceWithApi(candidateDataUrl, referenceImageUrl) {
  try {
    await loadModels();

    const candidateImg = await createImageFromDataUrl(candidateDataUrl);
    const referenceImg = await createImageFromDataUrl(referenceImageUrl);

    const candidateDetection = await faceapi
      .detectSingleFace(candidateImg, new faceapi.TinyFaceDetectorOptions())
      .withFaceLandmarks()
      .withFaceDescriptor();

    const referenceDetection = await faceapi
      .detectSingleFace(referenceImg, new faceapi.TinyFaceDetectorOptions())
      .withFaceLandmarks()
      .withFaceDescriptor();

    if (!candidateDetection || !referenceDetection) {
      return { success: false, score: 0, reason: 'No face detected in one of the images' };
    }

    const distance = faceapi.euclideanDistance(candidateDetection.descriptor, referenceDetection.descriptor);
    const score = Math.max(0, 1 - distance / 0.6);
    const success = score >= 0.72;

    return {
      success,
      score: Number(score.toFixed(3)),
      reason: success ? 'Face matched' : 'Face does not match',
    };
  } catch (error) {
    console.warn('Local face-api.js verification failed:', error);
    return null;
  }
}

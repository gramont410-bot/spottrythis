const clamp = (value, min = 0, max = 1) => Math.min(Math.max(value, min), max);

function normalizeDataUrl(dataUrl) {
  if (typeof dataUrl !== 'string') return '';
  const clean = dataUrl.trim();
  if (!clean) return '';
  return clean.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, '');
}

function getHistogram(dataUrl) {
  const cleaned = normalizeDataUrl(dataUrl);
  if (!cleaned) return new Array(64).fill(0);

  const hist = new Array(64).fill(0);
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

  for (let i = 0; i < cleaned.length; i += 1) {
    const char = cleaned[i];
    const bucket = alphabet.indexOf(char);
    if (bucket >= 0) {
      hist[bucket % 64] += 1;
    } else {
      hist[(char.charCodeAt(0) * 7 + i) % 64] += 1;
    }
  }

  return hist;
}

export function estimateFaceMatchScore(candidateDataUrl, referenceDataUrl) {
  if (!candidateDataUrl || !referenceDataUrl) return 0;

  const candidate = getHistogram(candidateDataUrl);
  const reference = getHistogram(referenceDataUrl);

  let rawDiff = 0;
  let maxSignal = 0;

  for (let i = 0; i < candidate.length; i += 1) {
    rawDiff += Math.abs(candidate[i] - reference[i]);
    maxSignal += Math.max(candidate[i], reference[i]);
  }

  const similarity = maxSignal === 0 ? 1 : 1 - (rawDiff / (maxSignal * 1.5));
  return clamp(similarity, 0, 1);
}

export function isFaceMatch(candidateDataUrl, referenceDataUrl, threshold = 0.72) {
  return estimateFaceMatchScore(candidateDataUrl, referenceDataUrl) >= threshold;
}

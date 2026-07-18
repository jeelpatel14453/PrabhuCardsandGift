const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

const CONTENT_TYPES = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
};

let client;
let cachedUrl;
let cachedKey;
let cachedBucket;

/** Strip trailing slashes and accidental /rest/v1 API suffixes. */
function normalizeSupabaseUrl(raw) {
  let url = String(raw || '').trim();
  if (!url) return '';
  url = url.replace(/\/+$/, '');
  url = url.replace(/\/rest\/v1$/i, '');
  return url.replace(/\/+$/, '');
}

function readConfig() {
  const url = normalizeSupabaseUrl(process.env.SUPABASE_URL);
  const serviceKey = String(process.env.SUPABASE_SERVICE_KEY || '').trim();
  const bucket = String(process.env.SUPABASE_BUCKET || '').trim();
  return { url, serviceKey, bucket };
}

function getConfigError() {
  const { url, serviceKey, bucket } = readConfig();
  const missing = [];
  if (!url) missing.push('SUPABASE_URL');
  if (!serviceKey) missing.push('SUPABASE_SERVICE_KEY');
  if (!bucket) missing.push('SUPABASE_BUCKET');
  if (missing.length) {
    return `Missing required environment variable(s): ${missing.join(', ')}.`;
  }
  if (!/^https:\/\//i.test(url)) {
    return 'SUPABASE_URL must be your project URL (https://<project-ref>.supabase.co).';
  }
  try {
    // Validate URL parsing early so createClient does not fail obscurely.
    void new URL(url);
  } catch {
    return 'SUPABASE_URL is not a valid URL.';
  }
  return null;
}

function getClient() {
  const configError = getConfigError();
  if (configError) {
    throw new Error(configError);
  }

  const { url, serviceKey, bucket } = readConfig();
  if (!client || cachedUrl !== url || cachedKey !== serviceKey || cachedBucket !== bucket) {
    client = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    cachedUrl = url;
    cachedKey = serviceKey;
    cachedBucket = bucket;
  }
  return client;
}

function getBucketName() {
  return readConfig().bucket || null;
}

function getPublicUrl(objectPath) {
  const bucket = getBucketName();
  const { data } = getClient().storage.from(bucket).getPublicUrl(objectPath);
  if (!data?.publicUrl) {
    throw new Error('Supabase did not return a public URL for the uploaded image.');
  }
  return data.publicUrl;
}

function getObjectPathFromPublicUrl(url) {
  if (!url || typeof url !== 'string') return null;

  const { url: supabaseUrl, bucket } = readConfig();
  if (!supabaseUrl || !bucket) return null;

  try {
    const parsed = new URL(url);
    const expectedHost = new URL(supabaseUrl).host;
    if (parsed.host !== expectedHost) return null;

    const marker = `/storage/v1/object/public/${bucket}/`;
    const idx = parsed.pathname.indexOf(marker);
    if (idx === -1) return null;

    const objectPath = decodeURIComponent(parsed.pathname.slice(idx + marker.length));
    if (!objectPath || objectPath.includes('..')) return null;
    return objectPath;
  } catch {
    return null;
  }
}

function isOurBucketPublicUrl(url) {
  return Boolean(getObjectPathFromPublicUrl(url));
}

async function uploadImageBuffer(buffer, ext) {
  const safeExt = String(ext || '').toLowerCase();
  const contentType = CONTENT_TYPES[safeExt];
  if (!contentType) {
    throw new Error('Unsupported image format. Use JPG, PNG, WebP, or GIF.');
  }
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new Error('Invalid image data. Please try again.');
  }

  const bucket = getBucketName();
  const objectPath = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}.${
    safeExt === 'jpeg' ? 'jpg' : safeExt
  }`;

  const { error } = await getClient().storage.from(bucket).upload(objectPath, buffer, {
    contentType,
    upsert: false,
    cacheControl: '3600',
  });

  if (error) {
    const err = new Error(error.message || 'Failed to upload image to Supabase Storage.');
    err.code = 'SUPABASE_UPLOAD_FAILED';
    throw err;
  }

  return getPublicUrl(objectPath);
}

async function deleteImageIfInBucket(url) {
  if (getConfigError()) return false;

  const objectPath = getObjectPathFromPublicUrl(url);
  if (!objectPath) return false;

  const bucket = getBucketName();
  const { error } = await getClient().storage.from(bucket).remove([objectPath]);
  if (error) {
    console.warn(`Failed to delete old Supabase image (${objectPath}):`, error.message);
    return false;
  }
  return true;
}

module.exports = {
  uploadImageBuffer,
  deleteImageIfInBucket,
  getObjectPathFromPublicUrl,
  isOurBucketPublicUrl,
  getBucketName,
  getConfigError,
  normalizeSupabaseUrl,
};

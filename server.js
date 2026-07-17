const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const Database = require('better-sqlite3');
const { v2: cloudinary } = require('cloudinary');

const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 8080;
const DB_PATH = path.join(__dirname, 'data', 'prabhu.db');
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ADMIN_EMAIL = 'admin@gmail.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const SESSION_SECRET =
  process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const loginAttempts = new Map();
const CLOUDINARY_FOLDER = 'prabhu-cards';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

const SPORT_ORDER = ['football', 'baseball', 'basketball', 'soccer', 'pokemon', 'magic'];
const SPORT_LABELS = {
  football: 'Football Cards',
  baseball: 'Baseball Cards',
  basketball: 'Basketball Cards',
  soccer: 'Soccer Cards',
  pokemon: 'Pokémon',
  magic: 'Magic: The Gathering',
};
const SPORT_BADGES = {
  football: { label: 'Sports', classes: 'bg-blue-100 text-brand-blue' },
  baseball: { label: 'Sports', classes: 'bg-red-100 text-brand-red' },
  basketball: { label: 'Sports', classes: 'bg-orange-100 text-brand-orange' },
  soccer: { label: 'Sports', classes: 'bg-green-100 text-green-700' },
  pokemon: { label: 'Collectibles', classes: 'bg-yellow-100 text-yellow-700' },
  magic: { label: 'Collectibles', classes: 'bg-purple-100 text-purple-700' },
};

const DEPARTMENTS = [
  { value: 'trading-cards:football', label: 'Trading Cards — Football' },
  { value: 'trading-cards:baseball', label: 'Trading Cards — Baseball' },
  { value: 'trading-cards:basketball', label: 'Trading Cards — Basketball' },
  { value: 'trading-cards:soccer', label: 'Trading Cards — Soccer' },
  { value: 'trading-cards:pokemon', label: 'Trading Cards — Pokémon' },
  { value: 'trading-cards:magic', label: 'Trading Cards — Magic' },
  { value: 'willow-tree', label: 'Willow Tree Figurines' },
  { value: 'gifts', label: 'Gifts' },
  { value: 'balloons', label: 'Balloons' },
];

const SITE_IMAGE_SLOTS = {
  'home.hero': {
    label: 'Homepage — Hero Banner',
    default: 'https://images.unsplash.com/photo-1513885535751-8b9238bd345a?w=1920&q=80',
  },
  'home.category.trading-cards': {
    label: 'Homepage — Trading Cards',
    default: 'https://images.unsplash.com/photo-1626684291173-2a0a6502d40b?w=600&q=80',
  },
  'home.category.greeting-cards': {
    label: 'Homepage — Greeting Cards',
    default: 'https://images.unsplash.com/photo-1513885535751-8b9238bd345a?w=600&q=80',
  },
  'home.category.holiday-cards': {
    label: 'Homepage — Holiday Cards',
    default: 'https://images.unsplash.com/photo-1512389142860-9c449e58a814?w=600&q=80',
  },
  'home.category.gifts': {
    label: 'Homepage — Gifts',
    default: 'https://images.unsplash.com/photo-1549465220-1a0b9238b345a?w=600&q=80',
  },
  'home.category.willow-tree': {
    label: 'Homepage — Willow Tree',
    default: 'https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=600&q=80',
  },
  'home.category.balloons': {
    label: 'Homepage — Balloons',
    default: 'https://images.unsplash.com/photo-1530103862676-de8c9debad1d?w=600&q=80',
  },
  'home.category.cigars': {
    label: 'Homepage — Cigars',
    default: 'https://images.unsplash.com/photo-1609521263047-f8f205293bb4?w=600&q=80',
  },
  'trading-cards.hero': {
    label: 'Trading Cards Page — Hero',
    default: 'https://images.unsplash.com/photo-1626684291173-2a0a6502d40b?w=1920&q=80',
  },
  'gifts-balloons.hero': {
    label: 'Gifts & Balloons Page — Hero',
    default: 'https://images.unsplash.com/photo-1549465220-1a0b9238b345a?w=1920&q=80',
  },
  'greeting-cards.hero': {
    label: 'Greeting Cards Page — Hero',
    default: 'https://images.unsplash.com/photo-1513885535751-8b9238bd345a?w=1920&q=80',
  },
  'greeting-cards.birthday': {
    label: 'Greeting Cards — Birthday',
    default: 'https://images.unsplash.com/photo-1530103862676-de8c9debad1d?w=600&q=80',
  },
  'greeting-cards.anniversary': {
    label: 'Greeting Cards — Anniversary',
    default: 'https://images.unsplash.com/photo-1519741497674-611481863552?w=600&q=80',
  },
  'greeting-cards.wedding': {
    label: 'Greeting Cards — Wedding',
    default: 'https://images.unsplash.com/photo-1519225421980-715cb0215aed?w=600&q=80',
  },
  'greeting-cards.baby': {
    label: 'Greeting Cards — Baby',
    default: 'https://images.unsplash.com/photo-1515488042361-ee00e725b9fa?w=600&q=80',
  },
  'greeting-cards.sympathy': {
    label: 'Greeting Cards — Sympathy',
    default: 'https://images.unsplash.com/photo-1490750967868-88ea4486cfe7?w=600&q=80',
  },
  'greeting-cards.graduation': {
    label: 'Greeting Cards — Graduation',
    default: 'https://images.unsplash.com/photo-1523050854058-8df90110c9f1?w=600&q=80',
  },
  'greeting-cards.thank-you': {
    label: 'Greeting Cards — Thank You',
    default: 'https://images.unsplash.com/photo-1549465220-1a0b9238b345a?w=600&q=80',
  },
  'greeting-cards.get-well': {
    label: 'Greeting Cards — Get Well',
    default: 'https://images.unsplash.com/photo-1576092768241-dec231879fc3?w=600&q=80',
  },
  'greeting-cards.congratulations': {
    label: 'Greeting Cards — Congratulations',
    default: 'https://images.unsplash.com/photo-1464349153735-7db50ed83c46?w=600&q=80',
  },
  'greeting-cards.christmas': {
    label: 'Holiday Cards — Christmas',
    default: 'https://images.unsplash.com/photo-1576919226508-f7c0c8d8a3b2?w=600&q=80',
  },
  'greeting-cards.valentines': {
    label: 'Holiday Cards — Valentine\'s Day',
    default: 'https://images.unsplash.com/photo-1518199266791-5375a83190b7?w=600&q=80',
  },
  'greeting-cards.easter': {
    label: 'Holiday Cards — Easter',
    default: 'https://images.unsplash.com/photo-1490750967868-88ea4486cfe7?w=600&q=80',
  },
  'greeting-cards.mothers-day': {
    label: 'Holiday Cards — Mother\'s Day',
    default: 'https://images.unsplash.com/photo-1522673607200-164d1b6ce486?w=600&q=80',
  },
  'greeting-cards.fathers-day': {
    label: 'Holiday Cards — Father\'s Day',
    default: 'https://images.unsplash.com/photo-1566577739112-5180d4bf7900?w=600&q=80',
  },
  'greeting-cards.halloween': {
    label: 'Holiday Cards — Halloween',
    default: 'https://images.unsplash.com/photo-1509557844550-b7860d3b2b0a?w=600&q=80',
  },
  'greeting-cards.thanksgiving': {
    label: 'Holiday Cards — Thanksgiving',
    default: 'https://images.unsplash.com/photo-1472396961693-142e6e26973d?w=600&q=80',
  },
  'greeting-cards.hanukkah': {
    label: 'Holiday Cards — Hanukkah',
    default: 'https://images.unsplash.com/photo-1605100804763-247f67b3557e?w=600&q=80',
  },
  'greeting-cards.new-year': {
    label: 'Holiday Cards — New Year',
    default: 'https://images.unsplash.com/photo-1467810563316-b5476525c0f9?w=600&q=80',
  },
  'cigars.hero': {
    label: 'Cigars Page — Hero',
    default: 'https://images.unsplash.com/photo-1609521263047-f8f205293bb4?w=1920&q=80',
  },
  'cigars.premium': {
    label: 'Cigars Page — Premium Cigars',
    default: 'https://images.unsplash.com/photo-1609521263047-f8f205293bb4?w=800&q=80',
  },
  'cigars.brands': {
    label: 'Cigars Page — Popular Brands',
    default: 'https://images.unsplash.com/photo-1590846089830-d9d01064faeb?w=800&q=80',
  },
  'cigars.cigarettes': {
    label: 'Cigars Page — Cigarettes',
    default: 'https://images.unsplash.com/photo-1585659722983-3b062a1a0714?w=800&q=80',
  },
  'cigars.accessories': {
    label: 'Cigars Page — Accessories',
    default: 'https://images.unsplash.com/photo-1622489402410-b8344474caa2?w=800&q=80',
  },
};

function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      email TEXT NOT NULL,
      password TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS inventory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      image_url TEXT,
      subcategory TEXT NOT NULL,
      sport_type TEXT,
      price REAL,
      in_stock INTEGER DEFAULT 1,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS contact_submissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT,
      message TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS site_images (
      key TEXT PRIMARY KEY,
      image_url TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  const columns = db.prepare('PRAGMA table_info(inventory)').all();
  if (columns.length && !columns.some((col) => col.name === 'subcategory')) {
    db.exec('ALTER TABLE inventory ADD COLUMN subcategory TEXT');
  }
  if (columns.length && !columns.some((col) => col.name === 'sport_type')) {
    db.exec('ALTER TABLE inventory ADD COLUMN sport_type TEXT');
  }
  if (columns.length && !columns.some((col) => col.name === 'price')) {
    db.exec('ALTER TABLE inventory ADD COLUMN price REAL');
  }

  db.prepare("DELETE FROM inventory WHERE LOWER(name) LIKE '%coffee mug%'").run();

  const settingsCount = db.prepare('SELECT COUNT(*) AS count FROM settings').get().count;
  if (settingsCount === 0) {
    // Never hardcode a password in source — set ADMIN_PASSWORD in the environment (e.g. Render).
    const initialPassword =
      ADMIN_PASSWORD || crypto.randomBytes(24).toString('base64url');
    if (!ADMIN_PASSWORD) {
      console.warn(
        'ADMIN_PASSWORD is not set. Generated a one-time admin password for first boot:',
        initialPassword
      );
    }
    const hash = bcrypt.hashSync(initialPassword, 10);
    db.prepare('INSERT INTO settings (id, email, password) VALUES (1, ?, ?)').run(
      ADMIN_EMAIL,
      hash
    );
  } else {
    // Keep existing installs on the current admin email
    db.prepare(
      "UPDATE settings SET email = ? WHERE id = 1 AND LOWER(email) = 'admin@prabhustore.com'"
    ).run(ADMIN_EMAIL);

    // If ADMIN_PASSWORD is set, treat it as the source of truth (useful to reset on Render).
    if (ADMIN_PASSWORD) {
      const hash = bcrypt.hashSync(ADMIN_PASSWORD, 10);
      db.prepare('UPDATE settings SET password = ? WHERE id = 1').run(hash);
    }
  }

  const inventoryCount = db.prepare('SELECT COUNT(*) AS count FROM inventory').get().count;
  if (inventoryCount === 0) {
    seedInventory();
  }
}

function parsePrice(value) {
  if (value === undefined || value === null || String(value).trim() === '') {
    return { ok: true, price: null };
  }
  const cleaned = String(value).trim().replace(/[$,\s]/g, '');
  const price = Number.parseFloat(cleaned);
  if (!Number.isFinite(price) || price < 0) {
    return { ok: false, price: null };
  }
  return { ok: true, price: Math.round(price * 100) / 100 };
}

function formatPrice(price) {
  if (price === undefined || price === null || Number.isNaN(Number(price))) {
    return null;
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(Number(price));
}

function seedInventory() {
  const now = new Date().toISOString();
  const insert = db.prepare(`
    INSERT INTO inventory (name, description, image_url, subcategory, sport_type, price, in_stock, created_at)
    VALUES (?, ?, ?, ?, ?, NULL, 1, ?)
  `);

  const items = [
    [
      'Football Cards',
      "Browse football cards from today's stars, rookies, legendary players, hobby boxes, booster packs, and collectible singles.",
      'https://images.unsplash.com/photo-1566577739112-5180d4bf7900?w=800&q=80',
      'trading-cards',
      'football',
    ],
    [
      'Baseball Cards',
      'Explore baseball cards featuring current stars, Hall of Famers, rookies, sealed boxes, packs, and collectibles.',
      'https://images.unsplash.com/photo-1568602471122-7832951cc4c5?w=800&q=80',
      'trading-cards',
      'baseball',
    ],
    [
      'Basketball Cards',
      'Discover basketball trading cards, rookie cards, premium hobby boxes, autographed cards, and special edition releases.',
      'https://images.unsplash.com/photo-1546519638-68e109498ffc?w=800&q=80',
      'trading-cards',
      'basketball',
    ],
    [
      'Soccer Cards',
      'Find soccer trading cards from top leagues, international tournaments, superstar players, and collectible sets.',
      'https://images.unsplash.com/photo-1431324155629-1a6deb1dec8d?w=800&q=80',
      'trading-cards',
      'soccer',
    ],
    [
      'Pokémon',
      'Browse Pokémon booster packs, Elite Trainer Boxes, tins, sleeves, accessories, and collectible cards.',
      'https://images.unsplash.com/photo-1613771404721-1f92d799e049?w=800&q=80',
      'trading-cards',
      'pokemon',
    ],
    [
      'Magic: The Gathering',
      'Explore Magic booster packs, Commander decks, collector boosters, accessories, and more.',
      'https://images.unsplash.com/photo-1606166188505-aa7e997bb861?w=800&q=80',
      'trading-cards',
      'magic',
    ],
    [
      'Willow Tree Figurines',
      "Hand-painted sculptures that express love, closeness, healing, courage, and life's quiet meaningful moments.",
      'https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=600&q=80',
      'willow-tree',
      null,
    ],
    [
      'Home Décor',
      'Decorative accents, frames, and seasonal pieces to brighten any room and make a house feel like home.',
      'https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?w=600&q=80',
      'gifts',
      null,
    ],
    [
      'Keepsakes',
      'Memorable treasures and sentimental gifts designed to be cherished for years to come.',
      'https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?w=600&q=80',
      'gifts',
      null,
    ],
    [
      'Birthday Balloons',
      'Vibrant balloons in every color and theme to make any birthday party extra special and memorable.',
      'https://images.unsplash.com/photo-1464349153735-7db50ed83c46?w=600&q=80',
      'balloons',
      null,
    ],
    [
      'Balloon Bouquets',
      'Custom balloon bouquets crafted in-store for any occasion. Choose your colors, themes, and sizes.',
      'https://images.unsplash.com/photo-1530103862676-de8c9debad1d?w=800&q=80',
      'balloons',
      null,
    ],
  ];

  for (const item of items) {
    insert.run(...item, now);
  }
}

function parseDepartment(value) {
  if (!value) return null;
  if (value.includes(':')) {
    const [subcategory, sportType] = value.split(':');
    return { subcategory, sportType };
  }
  return { subcategory: value, sportType: null };
}

function getSettings() {
  return db.prepare('SELECT email, password FROM settings WHERE id = 1').get();
}

function getInventory() {
  return db
    .prepare(
      `SELECT id, name, description, image_url, subcategory, sport_type, price, in_stock, created_at
       FROM inventory
       ORDER BY subcategory, sport_type, name`
    )
    .all()
    .map((row) => ({ ...row, image_url: sanitizeImageUrl(row.image_url) }));
}

function getContactSubmissions() {
  return db
    .prepare(
      `SELECT id, name, email, phone, message, created_at
       FROM contact_submissions
       ORDER BY created_at DESC`
    )
    .all();
}

function getTradingCardGroups() {
  const rows = db
    .prepare(
      `SELECT id, name, description, image_url, sport_type, price
       FROM inventory
       WHERE subcategory = 'trading-cards' AND in_stock = 1
       ORDER BY name`
    )
    .all()
    .map((row) => ({ ...row, image_url: sanitizeImageUrl(row.image_url) }));

  const grouped = {};
  for (const row of rows) {
    const key = row.sport_type || 'other';
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(row);
  }

  return SPORT_ORDER.filter((key) => grouped[key]?.length).map((key) => ({
    key,
    label: SPORT_LABELS[key] || key,
    badge: SPORT_BADGES[key] || { label: 'Collectibles', classes: 'bg-slate-100 text-slate-700' },
    items: grouped[key],
  }));
}

function getTradingCardById(id) {
  const row = db
    .prepare(
      `SELECT id, name, description, image_url, subcategory, sport_type, price, in_stock, created_at
       FROM inventory
       WHERE id = ? AND subcategory = 'trading-cards' AND in_stock = 1`
    )
    .get(id);
  if (!row) return null;
  return { ...row, image_url: sanitizeImageUrl(row.image_url) };
}

function getGiftsBalloonsInventory() {
  const mapRows = (rows) =>
    rows.map((row) => ({ ...row, image_url: sanitizeImageUrl(row.image_url) }));

  return {
    willowTree: mapRows(
      db
        .prepare(
          `SELECT id, name, description, image_url
           FROM inventory
           WHERE subcategory = 'willow-tree' AND in_stock = 1
           ORDER BY name`
        )
        .all()
    ),
    gifts: mapRows(
      db
        .prepare(
          `SELECT id, name, description, image_url
           FROM inventory
           WHERE subcategory = 'gifts' AND in_stock = 1
           ORDER BY name`
        )
        .all()
    ),
    balloons: mapRows(
      db
        .prepare(
          `SELECT id, name, description, image_url
           FROM inventory
           WHERE subcategory = 'balloons' AND in_stock = 1
           ORDER BY name`
        )
        .all()
    ),
  };
}

function requireAdmin(req, res, next) {
  if (req.session && req.session.adminAuthenticated) {
    return next();
  }
  return res.redirect('/admin/login');
}

/** Prefer ADMIN_PASSWORD env var; only fall back to DB hash when env is unset. */
function verifyAdminPassword(plainPassword) {
  const provided = String(plainPassword || '');
  const envPassword = process.env.ADMIN_PASSWORD;

  if (envPassword) {
    const expectedBuf = Buffer.from(envPassword, 'utf8');
    const providedBuf = Buffer.from(provided, 'utf8');
    if (expectedBuf.length !== providedBuf.length) {
      return false;
    }
    return crypto.timingSafeEqual(expectedBuf, providedBuf);
  }
  const settings = getSettings();
  return Boolean(settings && bcrypt.compareSync(provided, settings.password));
}

function getClientIp(req) {
  return (
    (req.headers['x-forwarded-for'] || '').toString().split(',')[0].trim() ||
    req.socket.remoteAddress ||
    'unknown'
  );
}

function isLoginRateLimited(ip) {
  const entry = loginAttempts.get(ip);
  if (!entry) return false;
  if (Date.now() > entry.resetAt) {
    loginAttempts.delete(ip);
    return false;
  }
  return entry.count >= LOGIN_MAX_ATTEMPTS;
}

function recordFailedLogin(ip) {
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (!entry || now > entry.resetAt) {
    loginAttempts.set(ip, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
    return;
  }
  entry.count += 1;
}

function clearLoginAttempts(ip) {
  loginAttempts.delete(ip);
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

function setFlash(req, type, message) {
  req.session.flash = { type, message };
}

function consumeFlash(req) {
  const flash = req.session.flash;
  delete req.session.flash;
  return flash;
}

function redirectWithSession(req, res, url) {
  req.session.save((err) => {
    if (err) {
      console.error('Session save failed:', err.message);
    }
    res.redirect(url);
  });
}

function isLocalUploadUrl(url) {
  if (!url || typeof url !== 'string') return false;
  return url.startsWith('/uploads/') || url.startsWith('uploads/');
}

function isCloudinaryUrl(url) {
  if (!url || typeof url !== 'string') return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && parsed.hostname.includes('res.cloudinary.com');
  } catch {
    return false;
  }
}

function sanitizeImageUrl(url) {
  if (!url || isLocalUploadUrl(url)) return null;
  return url;
}

function isCloudinaryConfigured() {
  return Boolean(
    process.env.CLOUDINARY_CLOUD_NAME &&
      process.env.CLOUDINARY_API_KEY &&
      process.env.CLOUDINARY_API_SECRET
  );
}

function extractCloudinaryPublicId(url) {
  if (!url || typeof url !== 'string') return null;
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.includes('res.cloudinary.com')) return null;
    const parts = parsed.pathname.split('/').filter(Boolean);
    const uploadIdx = parts.indexOf('upload');
    if (uploadIdx === -1) return null;

    let rest = parts.slice(uploadIdx + 1);
    // Skip optional transformation segments (contain commas) and version (v123).
    while (rest.length && (rest[0].includes(',') || /^v\d+$/.test(rest[0]))) {
      rest = rest.slice(1);
    }
    if (!rest.length) return null;

    const withExt = rest.join('/');
    return withExt.replace(/\.[^/.]+$/, '');
  } catch {
    return null;
  }
}

async function uploadImageToCloudinary(dataUrl) {
  if (!isCloudinaryConfigured()) {
    throw new Error(
      'Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET.'
    );
  }

  const matches = String(dataUrl).match(/^data:image\/(\w+);base64,(.+)$/);
  if (!matches) {
    throw new Error('Invalid image data. Please try again.');
  }

  const ext = matches[1] === 'jpeg' ? 'jpg' : matches[1].toLowerCase();
  if (!['jpg', 'png', 'webp', 'gif'].includes(ext)) {
    throw new Error('Unsupported image format. Use JPG, PNG, WebP, or GIF.');
  }

  const buffer = Buffer.from(matches[2], 'base64');
  if (buffer.length > MAX_IMAGE_BYTES) {
    throw new Error('Image is too large. Maximum size is 5 MB.');
  }

  const result = await cloudinary.uploader.upload(dataUrl, {
    folder: CLOUDINARY_FOLDER,
    resource_type: 'image',
    overwrite: false,
  });

  return {
    url: result.secure_url,
    public_id: result.public_id,
  };
}

async function deleteCloudinaryImage(imageUrl) {
  const publicId = extractCloudinaryPublicId(imageUrl);
  if (!publicId || !isCloudinaryConfigured()) return;

  try {
    await cloudinary.uploader.destroy(publicId, { resource_type: 'image' });
  } catch (err) {
    console.warn('Cloudinary delete failed:', err.message || err);
  }
}

async function migrateLocalFileToCloudinary(localUrl) {
  if (!isLocalUploadUrl(localUrl) || !isCloudinaryConfigured()) return null;

  const relative = localUrl.replace(/^\//, '');
  const filePath = path.join(__dirname, relative);
  if (!fs.existsSync(filePath)) return null;

  try {
    const result = await cloudinary.uploader.upload(filePath, {
      folder: CLOUDINARY_FOLDER,
      resource_type: 'image',
      overwrite: false,
    });
    return result.secure_url;
  } catch (err) {
    console.warn(`Failed to migrate ${localUrl} to Cloudinary:`, err.message || err);
    return null;
  }
}

/** Move any leftover /uploads DB references to Cloudinary (or clear them). */
async function migrateLocalUploadsToCloudinary() {
  const localInventory = db
    .prepare(
      `SELECT id, image_url FROM inventory
       WHERE image_url LIKE '/uploads/%' OR image_url LIKE 'uploads/%'`
    )
    .all();
  const localSiteImages = db
    .prepare(
      `SELECT key, image_url FROM site_images
       WHERE image_url LIKE '/uploads/%' OR image_url LIKE 'uploads/%'`
    )
    .all();

  if (!localInventory.length && !localSiteImages.length) return;

  console.log(
    `Migrating ${localInventory.length + localSiteImages.length} local /uploads image reference(s) off the filesystem...`
  );

  for (const row of localInventory) {
    const cloudUrl = await migrateLocalFileToCloudinary(row.image_url);
    db.prepare('UPDATE inventory SET image_url = ? WHERE id = ?').run(cloudUrl, row.id);
  }

  for (const row of localSiteImages) {
    const cloudUrl = await migrateLocalFileToCloudinary(row.image_url);
    if (cloudUrl) {
      db.prepare(
        'UPDATE site_images SET image_url = ?, updated_at = ? WHERE key = ?'
      ).run(cloudUrl, new Date().toISOString(), row.key);
    } else {
      // Fall back to SITE_IMAGE_SLOTS defaults by removing the local override.
      db.prepare('DELETE FROM site_images WHERE key = ?').run(row.key);
    }
  }
}

function getSiteImage(key) {
  const slot = SITE_IMAGE_SLOTS[key];
  if (!slot) return '';
  const row = db.prepare('SELECT image_url FROM site_images WHERE key = ?').get(key);
  const url = sanitizeImageUrl(row?.image_url);
  return url || slot.default;
}

function getSiteImagesForAdmin() {
  return Object.entries(SITE_IMAGE_SLOTS).map(([key, slot]) => ({
    key,
    label: slot.label,
    imageUrl: getSiteImage(key),
  }));
}

initDatabase();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.disable('x-powered-by');
app.use(express.json({ limit: '8mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(
  session({
    name: 'prabhu.sid',
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 8 * 60 * 60 * 1000,
    },
  })
);

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  if (req.path.startsWith('/admin')) {
    res.setHeader('Cache-Control', 'no-store');
  }
  next();
});

app.use((req, res, next) => {
  res.locals.flash = consumeFlash(req);
  res.locals.siteImage = (key) => getSiteImage(key);
  res.locals.formatPrice = formatPrice;
  next();
});

app.get('/', (req, res) => {
  res.render('home');
});

app.get('/greeting-cards', (req, res) => {
  res.render('greeting-cards');
});

app.get('/trading-cards', (req, res) => {
  res.render('trading-cards', {
    cardGroups: getTradingCardGroups(),
    sportLabels: SPORT_LABELS,
  });
});

app.get('/trading-cards/:id', (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) {
    return res.status(404).render('trading-card-detail', {
      card: null,
      sportLabels: SPORT_LABELS,
      sportBadges: SPORT_BADGES,
    });
  }

  const card = getTradingCardById(id);
  if (!card) {
    return res.status(404).render('trading-card-detail', {
      card: null,
      sportLabels: SPORT_LABELS,
      sportBadges: SPORT_BADGES,
    });
  }

  res.render('trading-card-detail', {
    card,
    sportLabels: SPORT_LABELS,
    sportBadges: SPORT_BADGES,
  });
});

app.get('/gifts-balloons', (req, res) => {
  res.render('gifts-balloons', {
    inventory: getGiftsBalloonsInventory(),
  });
});

app.get('/contact', (req, res) => {
  res.render('contact', { activePage: 'contact' });
});

app.get('/cigars', (req, res) => {
  res.render('cigars', { activePage: 'cigars' });
});

app.get('/index.html', (req, res) => res.redirect(301, '/'));
app.get('/greeting-cards.html', (req, res) => res.redirect(301, '/greeting-cards'));
app.get('/trading-cards.html', (req, res) => res.redirect(301, '/trading-cards'));
app.get('/contact.html', (req, res) => res.redirect(301, '/contact'));
app.get('/cigars.html', (req, res) => res.redirect(301, '/cigars'));
app.get('/gifts.html', (req, res) => res.redirect(301, '/gifts-balloons'));
app.get('/balloons.html', (req, res) => res.redirect(301, '/gifts-balloons#balloons'));
app.get('/holiday-cards.html', (req, res) => res.redirect(301, '/greeting-cards#seasonal-holiday'));

app.use('/css', express.static(path.join(__dirname, 'css')));
app.use('/js', express.static(path.join(__dirname, 'js')));

app.post('/api/contact', (req, res) => {
  const name = (req.body.name || '').trim();
  const email = (req.body.email || '').trim();
  const phone = (req.body.phone || '').trim();
  const message = (req.body.message || '').trim();

  if (!name || !email || !message) {
    return res.status(400).json({ error: 'Name, email, and message are required.' });
  }
  if (!email.includes('@')) {
    return res.status(400).json({ error: 'Please enter a valid email address.' });
  }

  const createdAt = new Date().toISOString();
  const result = db
    .prepare(
      `INSERT INTO contact_submissions (name, email, phone, message, created_at)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(name, email, phone, message, createdAt);

  return res.status(201).json({
    success: true,
    id: result.lastInsertRowid,
    message: 'Thank you! We received your message.',
  });
});

app.get('/admin/login', (req, res) => {
  if (req.session.adminAuthenticated) {
    return res.redirect('/admin');
  }
  res.render('admin-login', { error: null, email: '' });
});

app.post('/admin/login', (req, res) => {
  const ip = getClientIp(req);
  if (isLoginRateLimited(ip)) {
    return res.status(429).render('admin-login', {
      error: 'Too many failed login attempts. Please wait 15 minutes and try again.',
      email: req.body.email || '',
    });
  }

  const email = (req.body.email || '').trim().toLowerCase();
  const password = req.body.password || '';
  const settings = getSettings();
  const expectedEmail = (process.env.ADMIN_EMAIL || (settings && settings.email) || '').toLowerCase();
  const emailOk = email === expectedEmail;
  // process.env.ADMIN_PASSWORD completely overrides the DB/settings password when set
  const passwordOk = verifyAdminPassword(password);

  if (!emailOk || !passwordOk) {
    recordFailedLogin(ip);
    return res.status(401).render('admin-login', {
      error: 'Invalid email or password. Please try again.',
      email: req.body.email || '',
    });
  }

  clearLoginAttempts(ip);
  req.session.regenerate((err) => {
    if (err) {
      return res.status(500).render('admin-login', {
        error: 'Unable to start a secure session. Please try again.',
        email: req.body.email || '',
      });
    }
    req.session.adminAuthenticated = true;
    req.session.adminEmail = settings.email;
    setFlash(req, 'success', 'Welcome back! You are signed in.');
    return redirectWithSession(req, res, '/admin');
  });
});

app.use('/admin', (req, res, next) => {
  if (req.path === '/login') {
    return next();
  }
  return requireAdmin(req, res, next);
});

app.post('/admin/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/admin/login');
  });
});

app.get('/admin', (req, res) => {
  const settings = getSettings();
  res.render('admin', {
    adminEmail: settings.email,
    inventory: getInventory(),
    contacts: getContactSubmissions(),
    departments: DEPARTMENTS,
    sportLabels: SPORT_LABELS,
    siteImages: getSiteImagesForAdmin(),
    activeTab: req.query.tab || 'credentials',
  });
});

app.post('/admin/api/upload-image', async (req, res) => {
  try {
    const image = req.body.image;
    if (!image) {
      return res.status(400).json({ error: 'No image provided.' });
    }
    const uploaded = await uploadImageToCloudinary(image);
    return res.json({
      success: true,
      url: uploaded.url,
      public_id: uploaded.public_id,
    });
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Upload failed.' });
  }
});

app.post('/admin/site-images/:key', async (req, res) => {
  const key = req.params.key;
  if (!SITE_IMAGE_SLOTS[key]) {
    setFlash(req, 'error', 'Invalid photo slot selected.');
    return res.redirect('/admin?tab=photos');
  }

  const imageUrl = (req.body.image_url || '').trim();
  if (!imageUrl) {
    setFlash(req, 'error', 'Please take or upload a photo first.');
    return res.redirect('/admin?tab=photos');
  }
  if (!isCloudinaryUrl(imageUrl)) {
    setFlash(req, 'error', 'Images must be uploaded through Cloudinary. Please take or upload a new photo.');
    return res.redirect('/admin?tab=photos');
  }

  const existing = db.prepare('SELECT image_url FROM site_images WHERE key = ?').get(key);
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO site_images (key, image_url, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET image_url = excluded.image_url, updated_at = excluded.updated_at`
  ).run(key, imageUrl, now);

  if (existing?.image_url && existing.image_url !== imageUrl) {
    await deleteCloudinaryImage(existing.image_url);
  }

  setFlash(req, 'success', `Photo updated for "${SITE_IMAGE_SLOTS[key].label}".`);
  return res.redirect('/admin?tab=photos');
});

app.post('/admin/inventory/image/:id', async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) {
    setFlash(req, 'error', 'Invalid product selected.');
    return res.redirect('/admin?tab=inventory');
  }

  const item = db.prepare('SELECT name, image_url FROM inventory WHERE id = ?').get(id);
  if (!item) {
    setFlash(req, 'error', 'Product not found.');
    return res.redirect('/admin?tab=inventory');
  }

  const imageUrl = (req.body.image_url || '').trim();
  if (!imageUrl) {
    setFlash(req, 'error', 'Please take or upload a photo first.');
    return res.redirect('/admin?tab=inventory');
  }
  if (!isCloudinaryUrl(imageUrl)) {
    setFlash(req, 'error', 'Images must be uploaded through Cloudinary. Please take or upload a new photo.');
    return res.redirect('/admin?tab=inventory');
  }

  db.prepare('UPDATE inventory SET image_url = ? WHERE id = ?').run(imageUrl, id);

  if (item.image_url && item.image_url !== imageUrl) {
    await deleteCloudinaryImage(item.image_url);
  }

  setFlash(req, 'success', `Photo updated for "${item.name}".`);
  return res.redirect('/admin?tab=inventory');
});

app.post('/admin/settings/email', (req, res) => {
  const newEmail = (req.body.email || '').trim().toLowerCase();
  const currentPassword = req.body.current_password || '';

  if (!isValidEmail(newEmail)) {
    setFlash(req, 'error', 'Please enter a valid email address.');
    return redirectWithSession(req, res, '/admin?tab=credentials');
  }

  const settings = getSettings();
  if (!settings || !verifyAdminPassword(currentPassword)) {
    setFlash(req, 'error', 'Current password is incorrect. Email was not updated.');
    return redirectWithSession(req, res, '/admin?tab=credentials');
  }

  db.prepare('UPDATE settings SET email = ? WHERE id = 1').run(newEmail);
  const saved = getSettings();
  req.session.adminEmail = saved.email;
  setFlash(req, 'success', `Admin email saved as ${saved.email}. Use this email next time you sign in.`);
  return redirectWithSession(req, res, '/admin?tab=credentials');
});

app.post('/admin/settings/password', (req, res) => {
  const currentPassword = req.body.current_password || '';
  const newPassword = req.body.new_password || '';
  const confirmPassword = req.body.confirm_password || '';

  if (newPassword.length < 8) {
    setFlash(req, 'error', 'New password must be at least 8 characters.');
    return redirectWithSession(req, res, '/admin?tab=credentials');
  }
  if (newPassword !== confirmPassword) {
    setFlash(req, 'error', 'New password and confirmation do not match.');
    return redirectWithSession(req, res, '/admin?tab=credentials');
  }

  const settings = getSettings();
  if (!settings || !verifyAdminPassword(currentPassword)) {
    setFlash(req, 'error', 'Current password is incorrect. Password was not changed.');
    return redirectWithSession(req, res, '/admin?tab=credentials');
  }

  if (ADMIN_PASSWORD) {
    setFlash(
      req,
      'error',
      'Password is controlled by the ADMIN_PASSWORD environment variable. Update it in your host settings (e.g. Render) instead.'
    );
    return redirectWithSession(req, res, '/admin?tab=credentials');
  }

  const hash = bcrypt.hashSync(newPassword, 10);
  db.prepare('UPDATE settings SET password = ? WHERE id = 1').run(hash);
  setFlash(
    req,
    'success',
    'Password updated successfully. Use your new password next time you sign in.'
  );
  return redirectWithSession(req, res, '/admin?tab=credentials');
});

app.post('/admin/inventory/add', (req, res) => {
  const name = (req.body.name || '').trim();
  const description = (req.body.description || '').trim();
  const imageUrl = (req.body.image_url || '').trim();
  const departmentValue = (req.body.department || '').trim();
  const isKnownDepartment = DEPARTMENTS.some((dept) => dept.value === departmentValue);
  const department = isKnownDepartment ? parseDepartment(departmentValue) : null;
  const parsedPrice = parsePrice(req.body.price);

  if (!name || !department) {
    setFlash(req, 'error', 'Product name and a valid department are required.');
    return res.redirect('/admin?tab=inventory');
  }
  if (!parsedPrice.ok) {
    setFlash(req, 'error', 'Please enter a valid price (for example 12.99), or leave it blank.');
    return res.redirect('/admin?tab=inventory');
  }
  if (imageUrl && !isCloudinaryUrl(imageUrl)) {
    setFlash(req, 'error', 'Images must be uploaded through Cloudinary. Please take or upload a new photo.');
    return res.redirect('/admin?tab=inventory');
  }

  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO inventory (name, description, image_url, subcategory, sport_type, price, in_stock, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 1, ?)`
  ).run(
    name,
    description,
    imageUrl || null,
    department.subcategory,
    department.sportType,
    parsedPrice.price,
    now
  );

  const deptLabel =
    DEPARTMENTS.find((dept) => dept.value === departmentValue)?.label || department.subcategory;
  setFlash(req, 'success', `"${name}" added to ${deptLabel}.`);
  return res.redirect('/admin?tab=inventory');
});

app.post('/admin/inventory/delete/:id', async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) {
    setFlash(req, 'error', 'Invalid product selected for deletion.');
    return res.redirect('/admin?tab=inventory');
  }

  const item = db.prepare('SELECT name, image_url FROM inventory WHERE id = ?').get(id);
  if (!item) {
    setFlash(req, 'error', 'Product not found.');
    return res.redirect('/admin?tab=inventory');
  }

  db.prepare('DELETE FROM inventory WHERE id = ?').run(id);
  if (item.image_url) {
    await deleteCloudinaryImage(item.image_url);
  }
  setFlash(req, 'success', `"${item.name}" removed from inventory.`);
  return res.redirect('/admin?tab=inventory');
});

async function startServer() {
  try {
    await migrateLocalUploadsToCloudinary();
  } catch (err) {
    console.warn('Local upload migration skipped:', err.message || err);
  }

  app.listen(PORT, () => {
    console.log(`Prabhu Cards & Gifts running at http://localhost:${PORT}`);
    console.log(`Admin dashboard: http://localhost:${PORT}/admin`);
    if (!ADMIN_PASSWORD) {
      console.warn('ADMIN_PASSWORD env var is not set. Set it to control the admin login password.');
    }
    if (!isCloudinaryConfigured()) {
      console.warn(
        'Cloudinary env vars are not set. Image uploads will fail until CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET are configured.'
      );
    }
  });
}

startServer();

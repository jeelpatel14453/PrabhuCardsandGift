require('dotenv').config();

const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const {
  query,
  queryOne,
  queryAll,
  connectAndMigrate,
  getDatabaseUrl,
} = require('./db');
const {
  uploadImageBuffer,
  deleteImageIfInBucket,
  getBucketName,
  getConfigError,
} = require('./supabase-storage');

const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 8080;
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'admin@gmail.com').trim().toLowerCase();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const SESSION_SECRET =
  process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const loginAttempts = new Map();

const SPORT_ORDER = [
  'football',
  'baseball',
  'basketball',
  'hockey',
  'soccer',
  'pokemon',
  'magic',
];
const SPORT_LABELS = {
  football: 'Football Cards',
  baseball: 'Baseball Cards',
  basketball: 'Basketball Cards',
  hockey: 'Hockey Trading Cards',
  soccer: 'Soccer Cards',
  pokemon: 'Pokémon',
  magic: 'Magic: The Gathering',
};
const SPORT_BADGES = {
  football: { label: 'Sports', classes: 'bg-blue-100 text-brand-blue' },
  baseball: { label: 'Sports', classes: 'bg-red-100 text-brand-red' },
  basketball: { label: 'Sports', classes: 'bg-orange-100 text-brand-orange' },
  hockey: { label: 'Sports', classes: 'bg-cyan-100 text-cyan-700' },
  soccer: { label: 'Sports', classes: 'bg-green-100 text-green-700' },
  pokemon: { label: 'Collectibles', classes: 'bg-yellow-100 text-yellow-700' },
  magic: { label: 'Collectibles', classes: 'bg-purple-100 text-purple-700' },
};

const DEPARTMENTS = [
  { value: 'trading-cards:football', label: 'Trading Cards — Football' },
  { value: 'trading-cards:baseball', label: 'Trading Cards — Baseball' },
  { value: 'trading-cards:basketball', label: 'Trading Cards — Basketball' },
  { value: 'trading-cards:hockey', label: 'Trading Cards — Hockey' },
  { value: 'trading-cards:soccer', label: 'Trading Cards — Soccer' },
  { value: 'trading-cards:pokemon', label: 'Trading Cards — Pokémon' },
  { value: 'trading-cards:magic', label: 'Trading Cards — Magic' },
  { value: 'willow-tree', label: 'Willow Tree Figurines' },
  { value: 'gifts', label: 'Gifts' },
  { value: 'balloons', label: 'Balloons' },
];

const DEFAULT_STORE_HOURS = {
  weekday_days: 'Monday – Saturday',
  weekday_open: '7:30 AM',
  weekday_close: '9:00 PM',
  sunday_days: 'Sunday',
  sunday_open: '7:30 AM',
  sunday_close: '9:00 PM',
};

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
  'home.category.lottery': {
    label: 'Homepage — Lottery',
    default: 'https://images.unsplash.com/photo-1518133910546-b6c2fb7d79e3?w=600&q=80',
  },
  'lottery.hero': {
    label: 'Lottery Page — Hero',
    default: 'https://images.unsplash.com/photo-1518133910546-b6c2fb7d79e3?w=1920&q=80',
  },
};

function publicErrorMessage(err, fallback) {
  if (process.env.NODE_ENV === 'production') return fallback;
  return err?.message || fallback;
}

async function initDatabase() {
  await connectAndMigrate();

  await query("DELETE FROM inventory WHERE LOWER(name) LIKE '%coffee mug%'");

  const settings = await queryOne('SELECT email FROM settings WHERE id = 1');
  if (!settings) {
    const initialPassword = ADMIN_PASSWORD || crypto.randomBytes(24).toString('base64url');
    if (!ADMIN_PASSWORD) {
      console.warn(
        'ADMIN_PASSWORD is not set. Generated a one-time admin password for first boot:',
        initialPassword
      );
    }
    const hash = bcrypt.hashSync(initialPassword, 10);
    await query(
      `INSERT INTO settings (id, email, password) VALUES (1, $1, $2)
       ON CONFLICT (id) DO NOTHING`,
      [ADMIN_EMAIL, hash]
    );
  } else {
    await query(
      `UPDATE settings
       SET email = $1
       WHERE id = 1 AND LOWER(email) = 'admin@prabhustore.com'`,
      [ADMIN_EMAIL]
    );

    if (ADMIN_PASSWORD) {
      const hash = bcrypt.hashSync(ADMIN_PASSWORD, 10);
      await query('UPDATE settings SET password = $1 WHERE id = 1', [hash]);
    }
  }

  const inventoryCount = await queryOne('SELECT COUNT(*)::int AS count FROM inventory');
  if ((inventoryCount?.count || 0) === 0) {
    await seedInventory();
  }

  // Ensure Hockey exists on already-seeded databases (migration also seeds; this is a backup).
  const hockeyCount = await queryOne(
    `SELECT COUNT(*)::int AS count FROM inventory
     WHERE subcategory = 'trading-cards' AND sport_type = 'hockey'`
  );
  if ((hockeyCount?.count || 0) === 0) {
    await query(
      `INSERT INTO inventory
         (name, description, image_url, subcategory, sport_type, price, in_stock, sort_order, created_at)
       VALUES ($1, $2, $3, 'trading-cards', 'hockey', NULL, TRUE, 0, $4::timestamptz)`,
      [
        'Hockey Cards',
        'Browse hockey trading cards featuring NHL stars, rookies, hobby boxes, packs, and collectible singles.',
        'https://images.unsplash.com/photo-1515703407324-5f753afd8be8?w=800&q=80',
        new Date().toISOString(),
      ]
    );
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

async function seedInventory() {
  const now = new Date().toISOString();
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
      'Hockey Cards',
      'Browse hockey trading cards featuring NHL stars, rookies, hobby boxes, packs, and collectible singles.',
      'https://images.unsplash.com/photo-1515703407324-5f753afd8be8?w=800&q=80',
      'trading-cards',
      'hockey',
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

  for (const [name, description, imageUrl, subcategory, sportType] of items) {
    await query(
      `INSERT INTO inventory
         (name, description, image_url, subcategory, sport_type, price, in_stock, sort_order, created_at)
       VALUES ($1, $2, $3, $4, $5, NULL, TRUE, 0, $6::timestamptz)`,
      [name, description, imageUrl, subcategory, sportType, now]
    );
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

async function getSettings() {
  return queryOne(
    `SELECT email, password,
            weekday_days, weekday_open, weekday_close,
            sunday_days, sunday_open, sunday_close
     FROM settings WHERE id = 1`
  );
}

function normalizeStoreHours(settings) {
  return {
    weekday_days: settings?.weekday_days || DEFAULT_STORE_HOURS.weekday_days,
    weekday_open: settings?.weekday_open || DEFAULT_STORE_HOURS.weekday_open,
    weekday_close: settings?.weekday_close || DEFAULT_STORE_HOURS.weekday_close,
    sunday_days: settings?.sunday_days || DEFAULT_STORE_HOURS.sunday_days,
    sunday_open: settings?.sunday_open || DEFAULT_STORE_HOURS.sunday_open,
    sunday_close: settings?.sunday_close || DEFAULT_STORE_HOURS.sunday_close,
  };
}

async function getStoreHours() {
  const settings = await getSettings();
  return normalizeStoreHours(settings);
}

async function getLotteryPage() {
  return queryOne(
    `SELECT id, visible, title, subtitle, description, disclaimer, hero_image_url, updated_at
     FROM lottery_page WHERE id = 1`
  );
}

async function getLotterySections({ visibleOnly = false } = {}) {
  const sql = visibleOnly
    ? `SELECT id, title, description, image_url, sort_order, visible, created_at
       FROM lottery_sections WHERE visible = TRUE
       ORDER BY sort_order ASC, id ASC`
    : `SELECT id, title, description, image_url, sort_order, visible, created_at
       FROM lottery_sections
       ORDER BY sort_order ASC, id ASC`;
  return queryAll(sql);
}

async function getInventory() {
  return queryAll(
    `SELECT id, name, description, image_url, subcategory, sport_type, price, in_stock, sort_order, created_at
     FROM inventory
     ORDER BY subcategory, sport_type, sort_order ASC, name`
  );
}

async function getContactSubmissions() {
  return queryAll(
    `SELECT id, name, email, phone, message, created_at
     FROM contact_submissions
     ORDER BY created_at DESC`
  );
}

async function getTradingCardGroups() {
  const rows = await queryAll(
    `SELECT id, name, description, image_url, sport_type, price, sort_order
     FROM inventory
     WHERE subcategory = 'trading-cards' AND in_stock = TRUE
     ORDER BY sort_order ASC, name`
  );

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

async function getTradingCardById(id) {
  return queryOne(
    `SELECT id, name, description, image_url, subcategory, sport_type, price, in_stock, created_at
     FROM inventory
     WHERE id = $1 AND subcategory = 'trading-cards' AND in_stock = TRUE`,
    [id]
  );
}

async function getGiftsBalloonsInventory() {
  const [willowTree, gifts, balloons] = await Promise.all([
    queryAll(
      `SELECT id, name, description, image_url
       FROM inventory
       WHERE subcategory = 'willow-tree' AND in_stock = TRUE
       ORDER BY name`
    ),
    queryAll(
      `SELECT id, name, description, image_url
       FROM inventory
       WHERE subcategory = 'gifts' AND in_stock = TRUE
       ORDER BY name`
    ),
    queryAll(
      `SELECT id, name, description, image_url
       FROM inventory
       WHERE subcategory = 'balloons' AND in_stock = TRUE
       ORDER BY name`
    ),
  ]);
  return { willowTree, gifts, balloons };
}

function requireAdmin(req, res, next) {
  if (req.session && req.session.adminAuthenticated) {
    return next();
  }
  const wantsJson =
    req.path.startsWith('/api/') ||
    (req.headers.accept || '').includes('application/json') ||
    req.xhr;
  if (wantsJson) {
    return res.status(401).json({ error: 'Authentication required.' });
  }
  return res.redirect('/admin/login');
}

function isSafeImageUrl(url) {
  if (!url) return true;
  if (url.startsWith('/uploads/')) {
    return !url.includes('..');
  }
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

async function verifyAdminPassword(plainPassword) {
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
  const settings = await getSettings();
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

async function saveBase64Image(dataUrl) {
  const configError = getConfigError();
  if (configError) {
    const err = new Error(configError);
    err.code = 'SUPABASE_CONFIG';
    throw err;
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
  if (!buffer.length) {
    throw new Error('Invalid image data. Please try again.');
  }
  if (buffer.length > MAX_IMAGE_BYTES) {
    throw new Error('Image is too large. Maximum size is 5 MB.');
  }

  return uploadImageBuffer(buffer, ext);
}

function resolveSiteImage(key, siteImageMap) {
  const slot = SITE_IMAGE_SLOTS[key];
  if (!slot) return '';
  const row = siteImageMap.get(key);
  const url = row?.image_url || slot.default;
  if (row?.updated_at && url) {
    const sep = url.includes('?') ? '&' : '?';
    return `${url}${sep}v=${new Date(row.updated_at).getTime()}`;
  }
  return url;
}

function getSiteImagesForAdmin(siteImageMap) {
  return Object.entries(SITE_IMAGE_SLOTS).map(([key, slot]) => ({
    key,
    label: slot.label,
    imageUrl: resolveSiteImage(key, siteImageMap),
  }));
}

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

app.use(async (req, res, next) => {
  try {
    res.locals.flash = consumeFlash(req);
    res.locals.formatPrice = formatPrice;
    const [imageRows, storeHours, lotteryPage] = await Promise.all([
      queryAll('SELECT key, image_url, updated_at FROM site_images'),
      getStoreHours(),
      getLotteryPage(),
    ]);
    const siteImageMap = new Map(imageRows.map((row) => [row.key, row]));
    res.locals.siteImage = (key) => resolveSiteImage(key, siteImageMap);
    res.locals.siteImageMap = siteImageMap;
    res.locals.storeHours = storeHours;
    res.locals.lotteryVisible = Boolean(lotteryPage?.visible);
    next();
  } catch (err) {
    next(err);
  }
});

app.get('/', (req, res) => {
  res.render('home');
});

app.get('/greeting-cards', (req, res) => {
  res.render('greeting-cards');
});

app.get('/trading-cards', async (req, res, next) => {
  try {
    res.render('trading-cards', {
      cardGroups: await getTradingCardGroups(),
      sportLabels: SPORT_LABELS,
    });
  } catch (err) {
    next(err);
  }
});

app.get('/trading-cards/:id', async (req, res, next) => {
  try {
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) {
      return res.status(404).render('trading-card-detail', {
        card: null,
        sportLabels: SPORT_LABELS,
        sportBadges: SPORT_BADGES,
      });
    }

    const card = await getTradingCardById(id);
    if (!card) {
      return res.status(404).render('trading-card-detail', {
        card: null,
        sportLabels: SPORT_LABELS,
        sportBadges: SPORT_BADGES,
      });
    }

    return res.render('trading-card-detail', {
      card,
      sportLabels: SPORT_LABELS,
      sportBadges: SPORT_BADGES,
    });
  } catch (err) {
    return next(err);
  }
});

app.get('/gifts-balloons', async (req, res, next) => {
  try {
    res.render('gifts-balloons', {
      inventory: await getGiftsBalloonsInventory(),
    });
  } catch (err) {
    next(err);
  }
});

app.get('/contact', async (req, res, next) => {
  try {
    res.render('contact', {
      activePage: 'contact',
      storeHours: res.locals.storeHours || (await getStoreHours()),
    });
  } catch (err) {
    next(err);
  }
});

app.get('/cigars', (req, res) => {
  res.render('cigars', { activePage: 'cigars' });
});

app.get('/lottery', async (req, res, next) => {
  try {
    const page = await getLotteryPage();
    if (!page || !page.visible) {
      return res.status(404).send('Lottery page is currently unavailable.');
    }
    const sections = await getLotterySections({ visibleOnly: true });
    const heroUrl =
      page.hero_image_url || resolveSiteImage('lottery.hero', res.locals.siteImageMap || new Map());
    return res.render('lottery', {
      activePage: 'lottery',
      lottery: page,
      lotterySections: sections,
      heroImageUrl: heroUrl,
    });
  } catch (err) {
    return next(err);
  }
});

app.get('/index.html', (req, res) => res.redirect(301, '/'));
app.get('/greeting-cards.html', (req, res) => res.redirect(301, '/greeting-cards'));
app.get('/trading-cards.html', (req, res) => res.redirect(301, '/trading-cards'));
app.get('/contact.html', (req, res) => res.redirect(301, '/contact'));
app.get('/cigars.html', (req, res) => res.redirect(301, '/cigars'));
app.get('/lottery.html', (req, res) => res.redirect(301, '/lottery'));
app.get('/gifts.html', (req, res) => res.redirect(301, '/gifts-balloons'));
app.get('/balloons.html', (req, res) => res.redirect(301, '/gifts-balloons#balloons'));
app.get('/holiday-cards.html', (req, res) => res.redirect(301, '/greeting-cards#seasonal-holiday'));

app.use('/css', express.static(path.join(__dirname, 'css')));
app.use('/js', express.static(path.join(__dirname, 'js')));
// Google Search Console (and other) root-level verification files
app.use(express.static(path.join(__dirname, 'public'), { index: false }));
if (fs.existsSync(UPLOADS_DIR)) {
  app.use('/uploads', express.static(UPLOADS_DIR));
}

app.post('/api/contact', async (req, res) => {
  try {
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
    const row = await queryOne(
      `INSERT INTO contact_submissions (name, email, phone, message, created_at)
       VALUES ($1, $2, $3, $4, $5::timestamptz)
       RETURNING id`,
      [name, email, phone, message, createdAt]
    );

    return res.status(201).json({
      success: true,
      id: row.id,
      message: 'Thank you! We received your message.',
    });
  } catch (err) {
    console.error('Contact submission failed:', err.message);
    return res.status(500).json({
      error: publicErrorMessage(err, 'Unable to save your message. Please try again.'),
    });
  }
});

app.get('/admin/login', (req, res) => {
  if (req.session.adminAuthenticated) {
    return res.redirect('/admin');
  }
  res.render('admin-login', { error: null, email: '' });
});

app.post('/admin/login', async (req, res) => {
  try {
    const ip = getClientIp(req);
    if (isLoginRateLimited(ip)) {
      return res.status(429).render('admin-login', {
        error: 'Too many failed login attempts. Please wait 15 minutes and try again.',
        email: req.body.email || '',
      });
    }

    const email = (req.body.email || '').trim().toLowerCase();
    const password = req.body.password || '';
    const settings = await getSettings();
    const expectedEmail = (
      process.env.ADMIN_EMAIL ||
      (settings && settings.email) ||
      ''
    ).toLowerCase();
    const emailOk = email === expectedEmail;
    const passwordOk = await verifyAdminPassword(password);

    if (!emailOk || !passwordOk) {
      recordFailedLogin(ip);
      return res.status(401).render('admin-login', {
        error: 'Invalid email or password. Please try again.',
        email: req.body.email || '',
      });
    }

    clearLoginAttempts(ip);
    return req.session.regenerate((err) => {
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
  } catch (err) {
    console.error('Admin login failed:', err.message);
    return res.status(500).render('admin-login', {
      error: 'Unable to sign in right now. Please try again.',
      email: req.body.email || '',
    });
  }
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

app.get('/admin', async (req, res, next) => {
  try {
    const settings = await getSettings();
    const [inventory, contacts, lotteryPage, lotterySections] = await Promise.all([
      getInventory(),
      getContactSubmissions(),
      getLotteryPage(),
      getLotterySections(),
    ]);
    res.render('admin', {
      adminEmail: settings?.email || ADMIN_EMAIL,
      inventory,
      contacts,
      departments: DEPARTMENTS,
      sportLabels: SPORT_LABELS,
      siteImages: getSiteImagesForAdmin(res.locals.siteImageMap || new Map()),
      storeHours: normalizeStoreHours(settings),
      lotteryPage,
      lotterySections,
      activeTab: req.query.tab || 'credentials',
      editItemId: req.query.edit ? Number.parseInt(req.query.edit, 10) : null,
    });
  } catch (err) {
    next(err);
  }
});

app.post('/admin/api/upload-image', async (req, res) => {
  try {
    const image = req.body.image;
    if (!image) {
      return res.status(400).json({ error: 'No image provided.' });
    }
    const url = await saveBase64Image(image);
    if (!url || !isSafeImageUrl(url)) {
      return res.status(502).json({ error: 'Upload succeeded but returned an invalid image URL.' });
    }
    return res.json({ success: true, url });
  } catch (err) {
    console.error('Image upload failed:', err.message);
    if (err.code === 'SUPABASE_CONFIG') {
      return res.status(503).json({ error: err.message });
    }
    if (err.code === 'SUPABASE_UPLOAD_FAILED') {
      return res.status(502).json({ error: err.message || 'Storage upload failed.' });
    }
    return res.status(400).json({ error: err.message || 'Upload failed.' });
  }
});

app.post('/admin/site-images/:key', async (req, res) => {
  try {
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
    if (!isSafeImageUrl(imageUrl)) {
      setFlash(req, 'error', 'Invalid image URL. Please upload the photo again.');
      return res.redirect('/admin?tab=photos');
    }

    const previous = await queryOne('SELECT image_url FROM site_images WHERE key = $1', [key]);
    const previousUrl = previous?.image_url || '';
    const now = new Date().toISOString();
    const saved = await queryOne(
      `INSERT INTO site_images (key, image_url, updated_at) VALUES ($1, $2, $3::timestamptz)
       ON CONFLICT (key) DO UPDATE SET
         image_url = EXCLUDED.image_url,
         updated_at = EXCLUDED.updated_at
       RETURNING key, image_url`,
      [key, imageUrl, now]
    );

    if (!saved?.image_url) {
      setFlash(req, 'error', 'Photo was not saved to the database.');
      return res.redirect('/admin?tab=photos');
    }

    if (previousUrl && previousUrl !== imageUrl) {
      await deleteImageIfInBucket(previousUrl);
    }

    setFlash(req, 'success', `Photo updated for "${SITE_IMAGE_SLOTS[key].label}" and verified in the database.`);
    return res.redirect('/admin?tab=photos');
  } catch (err) {
    console.error('Site image update failed:', err.message);
    setFlash(req, 'error', 'Could not update photo. Please try again.');
    return res.redirect('/admin?tab=photos');
  }
});

app.post('/admin/inventory/image/:id', async (req, res) => {
  try {
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) {
      setFlash(req, 'error', 'Invalid product selected.');
      return res.redirect('/admin?tab=inventory');
    }

    const item = await queryOne('SELECT name, image_url FROM inventory WHERE id = $1', [id]);
    if (!item) {
      setFlash(req, 'error', 'Product not found.');
      return res.redirect('/admin?tab=inventory');
    }

    const imageUrl = (req.body.image_url || '').trim();
    if (!imageUrl) {
      setFlash(req, 'error', 'Please take or upload a photo first.');
      return res.redirect('/admin?tab=inventory');
    }
    if (!isSafeImageUrl(imageUrl)) {
      setFlash(req, 'error', 'Invalid image URL. Please upload the photo again.');
      return res.redirect('/admin?tab=inventory');
    }

    const previousUrl = item.image_url || '';
    const saved = await queryOne(
      `UPDATE inventory SET image_url = $1 WHERE id = $2
       RETURNING id, name, image_url`,
      [imageUrl, id]
    );

    if (!saved?.image_url) {
      setFlash(req, 'error', 'Photo was not saved to the database.');
      return res.redirect('/admin?tab=inventory');
    }

    if (previousUrl && previousUrl !== imageUrl) {
      await deleteImageIfInBucket(previousUrl);
    }

    setFlash(req, 'success', `Photo updated for "${saved.name}" and verified in the database.`);
    return res.redirect('/admin?tab=inventory');
  } catch (err) {
    console.error('Inventory image update failed:', err.message);
    setFlash(req, 'error', 'Could not update product photo. Please try again.');
    return res.redirect('/admin?tab=inventory');
  }
});

app.post('/admin/settings/email', async (req, res) => {
  try {
    const newEmail = (req.body.email || '').trim().toLowerCase();
    const currentPassword = req.body.current_password || '';

    if (!isValidEmail(newEmail)) {
      setFlash(req, 'error', 'Please enter a valid email address.');
      return redirectWithSession(req, res, '/admin?tab=credentials');
    }

    const settings = await getSettings();
    if (!settings || !(await verifyAdminPassword(currentPassword))) {
      setFlash(req, 'error', 'Current password is incorrect. Email was not updated.');
      return redirectWithSession(req, res, '/admin?tab=credentials');
    }

    await query('UPDATE settings SET email = $1 WHERE id = 1', [newEmail]);
    const saved = await getSettings();
    req.session.adminEmail = saved.email;
    setFlash(req, 'success', `Admin email saved as ${saved.email}. Use this email next time you sign in.`);
    return redirectWithSession(req, res, '/admin?tab=credentials');
  } catch (err) {
    console.error('Admin email update failed:', err.message);
    setFlash(req, 'error', 'Could not update email. Please try again.');
    return redirectWithSession(req, res, '/admin?tab=credentials');
  }
});

app.post('/admin/settings/password', async (req, res) => {
  try {
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

    const settings = await getSettings();
    if (!settings || !(await verifyAdminPassword(currentPassword))) {
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
    await query('UPDATE settings SET password = $1 WHERE id = 1', [hash]);
    setFlash(
      req,
      'success',
      'Password updated successfully. Use your new password next time you sign in.'
    );
    return redirectWithSession(req, res, '/admin?tab=credentials');
  } catch (err) {
    console.error('Admin password update failed:', err.message);
    setFlash(req, 'error', 'Could not update password. Please try again.');
    return redirectWithSession(req, res, '/admin?tab=credentials');
  }
});

app.post('/admin/inventory/add', async (req, res) => {
  try {
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
    if (imageUrl && !isSafeImageUrl(imageUrl)) {
      setFlash(req, 'error', 'Invalid image URL. Please upload the photo again.');
      return res.redirect('/admin?tab=inventory');
    }

    const maxSort = await queryOne(
      `SELECT COALESCE(MAX(sort_order), -1)::int AS max
       FROM inventory
       WHERE subcategory = $1 AND COALESCE(sport_type, '') = COALESCE($2, '')`,
      [department.subcategory, department.sportType]
    );
    const sortOrder = (maxSort?.max ?? -1) + 1;
    const now = new Date().toISOString();
    const saved = await queryOne(
      `INSERT INTO inventory
         (name, description, image_url, subcategory, sport_type, price, in_stock, sort_order, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, TRUE, $7, $8::timestamptz)
       RETURNING id, name, subcategory, sport_type`,
      [
        name,
        description,
        imageUrl || null,
        department.subcategory,
        department.sportType,
        parsedPrice.price,
        sortOrder,
        now,
      ]
    );

    if (!saved) {
      setFlash(req, 'error', 'Product was not saved. Please try again.');
      return res.redirect('/admin?tab=inventory');
    }

    const deptLabel =
      DEPARTMENTS.find((dept) => dept.value === departmentValue)?.label || department.subcategory;
    setFlash(req, 'success', `"${saved.name}" added to ${deptLabel} and saved to the database.`);
    return res.redirect('/admin?tab=inventory');
  } catch (err) {
    console.error('Inventory add failed:', err.message);
    setFlash(req, 'error', 'Could not add product. Please try again.');
    return res.redirect('/admin?tab=inventory');
  }
});

app.post('/admin/inventory/edit/:id', async (req, res) => {
  try {
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) {
      setFlash(req, 'error', 'Invalid product selected.');
      return res.redirect('/admin?tab=inventory');
    }

    const name = (req.body.name || '').trim();
    const description = (req.body.description || '').trim();
    const imageUrl = (req.body.image_url || '').trim();
    const departmentValue = (req.body.department || '').trim();
    const isKnownDepartment = DEPARTMENTS.some((dept) => dept.value === departmentValue);
    const department = isKnownDepartment ? parseDepartment(departmentValue) : null;
    const parsedPrice = parsePrice(req.body.price);

    if (!name || !department) {
      setFlash(req, 'error', 'Product name and a valid department are required.');
      return res.redirect(`/admin?tab=inventory&edit=${id}`);
    }
    if (!parsedPrice.ok) {
      setFlash(req, 'error', 'Please enter a valid price (for example 12.99), or leave it blank.');
      return res.redirect(`/admin?tab=inventory&edit=${id}`);
    }
    if (imageUrl && !isSafeImageUrl(imageUrl)) {
      setFlash(req, 'error', 'Invalid image URL. Please upload the photo again.');
      return res.redirect(`/admin?tab=inventory&edit=${id}`);
    }

    const existing = await queryOne('SELECT id, image_url FROM inventory WHERE id = $1', [id]);
    if (!existing) {
      setFlash(req, 'error', 'Product not found.');
      return res.redirect('/admin?tab=inventory');
    }

    const saved = await queryOne(
      `UPDATE inventory
       SET name = $1,
           description = $2,
           image_url = $3,
           subcategory = $4,
           sport_type = $5,
           price = $6
       WHERE id = $7
       RETURNING id, name, subcategory, sport_type, price, in_stock`,
      [
        name,
        description,
        imageUrl || null,
        department.subcategory,
        department.sportType,
        parsedPrice.price,
        id,
      ]
    );

    if (!saved) {
      setFlash(req, 'error', 'Could not save product changes.');
      return res.redirect(`/admin?tab=inventory&edit=${id}`);
    }

    if (existing.image_url && imageUrl && existing.image_url !== imageUrl) {
      await deleteImageIfInBucket(existing.image_url);
    }

    setFlash(req, 'success', `"${saved.name}" updated and verified in the database.`);
    return res.redirect('/admin?tab=inventory');
  } catch (err) {
    console.error('Inventory edit failed:', err.message);
    setFlash(req, 'error', 'Could not update product. Please try again.');
    return res.redirect('/admin?tab=inventory');
  }
});

app.post('/admin/inventory/toggle/:id', async (req, res) => {
  try {
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) {
      setFlash(req, 'error', 'Invalid product selected.');
      return res.redirect('/admin?tab=inventory');
    }

    const saved = await queryOne(
      `UPDATE inventory
       SET in_stock = NOT in_stock
       WHERE id = $1
       RETURNING id, name, in_stock`,
      [id]
    );

    if (!saved) {
      setFlash(req, 'error', 'Product not found.');
      return res.redirect('/admin?tab=inventory');
    }

    setFlash(
      req,
      'success',
      saved.in_stock
        ? `"${saved.name}" is now visible on the storefront.`
        : `"${saved.name}" is now hidden from the storefront.`
    );
    return res.redirect('/admin?tab=inventory');
  } catch (err) {
    console.error('Inventory toggle failed:', err.message);
    setFlash(req, 'error', 'Could not update product visibility. Please try again.');
    return res.redirect('/admin?tab=inventory');
  }
});

app.post('/admin/inventory/reorder/:id', async (req, res) => {
  try {
    const id = Number.parseInt(req.params.id, 10);
    const direction = String(req.body.direction || '').toLowerCase();
    if (!Number.isInteger(id) || !['up', 'down'].includes(direction)) {
      setFlash(req, 'error', 'Invalid reorder request.');
      return res.redirect('/admin?tab=inventory');
    }

    const current = await queryOne(
      `SELECT id, name, subcategory, sport_type, sort_order
       FROM inventory WHERE id = $1`,
      [id]
    );
    if (!current) {
      setFlash(req, 'error', 'Product not found.');
      return res.redirect('/admin?tab=inventory');
    }

    const neighbor = await queryOne(
      direction === 'up'
        ? `SELECT id, sort_order FROM inventory
           WHERE subcategory = $1
             AND COALESCE(sport_type, '') = COALESCE($2, '')
             AND (sort_order < $3 OR (sort_order = $3 AND id < $4))
           ORDER BY sort_order DESC, id DESC
           LIMIT 1`
        : `SELECT id, sort_order FROM inventory
           WHERE subcategory = $1
             AND COALESCE(sport_type, '') = COALESCE($2, '')
             AND (sort_order > $3 OR (sort_order = $3 AND id > $4))
           ORDER BY sort_order ASC, id ASC
           LIMIT 1`,
      [current.subcategory, current.sport_type, current.sort_order, current.id]
    );

    if (!neighbor) {
      setFlash(req, 'error', `"${current.name}" is already at the ${direction === 'up' ? 'top' : 'bottom'}.`);
      return res.redirect('/admin?tab=inventory');
    }

    await query('UPDATE inventory SET sort_order = $1 WHERE id = $2', [
      neighbor.sort_order,
      current.id,
    ]);
    await query('UPDATE inventory SET sort_order = $1 WHERE id = $2', [
      current.sort_order,
      neighbor.id,
    ]);

    const verified = await queryOne(
      'SELECT id, name, sort_order FROM inventory WHERE id = $1',
      [current.id]
    );
    setFlash(
      req,
      'success',
      `"${verified.name}" reorder saved (sort order ${verified.sort_order}).`
    );
    return res.redirect('/admin?tab=inventory');
  } catch (err) {
    console.error('Inventory reorder failed:', err.message);
    setFlash(req, 'error', 'Could not reorder product. Please try again.');
    return res.redirect('/admin?tab=inventory');
  }
});

app.post('/admin/inventory/delete/:id', async (req, res) => {
  try {
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) {
      setFlash(req, 'error', 'Invalid product selected for deletion.');
      return res.redirect('/admin?tab=inventory');
    }

    const item = await queryOne('SELECT name, image_url FROM inventory WHERE id = $1', [id]);
    if (!item) {
      setFlash(req, 'error', 'Product not found.');
      return res.redirect('/admin?tab=inventory');
    }

    const deleted = await queryOne(
      'DELETE FROM inventory WHERE id = $1 RETURNING id, name',
      [id]
    );

    if (!deleted) {
      setFlash(req, 'error', 'Product could not be deleted.');
      return res.redirect('/admin?tab=inventory');
    }

    if (item.image_url) {
      await deleteImageIfInBucket(item.image_url);
    }

    setFlash(req, 'success', `"${deleted.name}" removed from inventory.`);
    return res.redirect('/admin?tab=inventory');
  } catch (err) {
    console.error('Inventory delete failed:', err.message);
    setFlash(req, 'error', 'Could not delete product. Please try again.');
    return res.redirect('/admin?tab=inventory');
  }
});

app.post('/admin/settings/hours', async (req, res) => {
  try {
    const weekdayDays = (req.body.weekday_days || '').trim() || DEFAULT_STORE_HOURS.weekday_days;
    const weekdayOpen = (req.body.weekday_open || '').trim() || DEFAULT_STORE_HOURS.weekday_open;
    const weekdayClose = (req.body.weekday_close || '').trim() || DEFAULT_STORE_HOURS.weekday_close;
    const sundayDays = (req.body.sunday_days || '').trim() || DEFAULT_STORE_HOURS.sunday_days;
    const sundayOpen = (req.body.sunday_open || '').trim() || DEFAULT_STORE_HOURS.sunday_open;
    const sundayClose = (req.body.sunday_close || '').trim() || DEFAULT_STORE_HOURS.sunday_close;

    await query(
      `UPDATE settings
       SET weekday_days = $1,
           weekday_open = $2,
           weekday_close = $3,
           sunday_days = $4,
           sunday_open = $5,
           sunday_close = $6
       WHERE id = 1`,
      [weekdayDays, weekdayOpen, weekdayClose, sundayDays, sundayOpen, sundayClose]
    );

    const saved = await getStoreHours();
    setFlash(
      req,
      'success',
      `Store hours saved: ${saved.weekday_days} ${saved.weekday_open} – ${saved.weekday_close}; ${saved.sunday_days} ${saved.sunday_open} – ${saved.sunday_close}.`
    );
    return redirectWithSession(req, res, '/admin?tab=credentials');
  } catch (err) {
    console.error('Store hours update failed:', err.message);
    setFlash(req, 'error', 'Could not save store hours. Please try again.');
    return redirectWithSession(req, res, '/admin?tab=credentials');
  }
});

app.post('/admin/lottery/page', async (req, res) => {
  try {
    const title = (req.body.title || '').trim() || 'Lottery';
    const subtitle = (req.body.subtitle || '').trim();
    const description = (req.body.description || '').trim();
    const disclaimer = (req.body.disclaimer || '').trim();
    const heroImageUrl = (req.body.hero_image_url || '').trim();
    const visible = req.body.visible === 'on' || req.body.visible === 'true' || req.body.visible === '1';

    if (heroImageUrl && !isSafeImageUrl(heroImageUrl)) {
      setFlash(req, 'error', 'Invalid hero image URL. Please upload the photo again.');
      return res.redirect('/admin?tab=lottery');
    }

    const previous = await getLotteryPage();
    const now = new Date().toISOString();
    const saved = await queryOne(
      `INSERT INTO lottery_page
         (id, visible, title, subtitle, description, disclaimer, hero_image_url, updated_at)
       VALUES (1, $1, $2, $3, $4, $5, $6, $7::timestamptz)
       ON CONFLICT (id) DO UPDATE SET
         visible = EXCLUDED.visible,
         title = EXCLUDED.title,
         subtitle = EXCLUDED.subtitle,
         description = EXCLUDED.description,
         disclaimer = EXCLUDED.disclaimer,
         hero_image_url = EXCLUDED.hero_image_url,
         updated_at = EXCLUDED.updated_at
       RETURNING id, visible, title, hero_image_url`,
      [visible, title, subtitle, description, disclaimer, heroImageUrl || null, now]
    );

    if (!saved) {
      setFlash(req, 'error', 'Lottery page was not saved.');
      return res.redirect('/admin?tab=lottery');
    }

    if (
      previous?.hero_image_url &&
      heroImageUrl &&
      previous.hero_image_url !== heroImageUrl
    ) {
      await deleteImageIfInBucket(previous.hero_image_url);
    }

    setFlash(
      req,
      'success',
      `Lottery page "${saved.title}" saved (${saved.visible ? 'visible' : 'hidden'}).`
    );
    return res.redirect('/admin?tab=lottery');
  } catch (err) {
    console.error('Lottery page update failed:', err.message);
    setFlash(req, 'error', 'Could not save Lottery page. Please try again.');
    return res.redirect('/admin?tab=lottery');
  }
});

app.post('/admin/lottery/sections/add', async (req, res) => {
  try {
    const title = (req.body.title || '').trim();
    const description = (req.body.description || '').trim();
    const imageUrl = (req.body.image_url || '').trim();

    if (!title) {
      setFlash(req, 'error', 'Section title is required.');
      return res.redirect('/admin?tab=lottery');
    }
    if (imageUrl && !isSafeImageUrl(imageUrl)) {
      setFlash(req, 'error', 'Invalid image URL. Please upload the photo again.');
      return res.redirect('/admin?tab=lottery');
    }

    const maxSort = await queryOne(
      'SELECT COALESCE(MAX(sort_order), -1)::int AS max FROM lottery_sections'
    );
    const saved = await queryOne(
      `INSERT INTO lottery_sections (title, description, image_url, sort_order, visible, created_at)
       VALUES ($1, $2, $3, $4, TRUE, $5::timestamptz)
       RETURNING id, title`,
      [title, description, imageUrl || null, (maxSort?.max ?? -1) + 1, new Date().toISOString()]
    );

    if (!saved) {
      setFlash(req, 'error', 'Section was not saved.');
      return res.redirect('/admin?tab=lottery');
    }

    setFlash(req, 'success', `Lottery section "${saved.title}" added and saved.`);
    return res.redirect('/admin?tab=lottery');
  } catch (err) {
    console.error('Lottery section add failed:', err.message);
    setFlash(req, 'error', 'Could not add Lottery section. Please try again.');
    return res.redirect('/admin?tab=lottery');
  }
});

app.post('/admin/lottery/sections/edit/:id', async (req, res) => {
  try {
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) {
      setFlash(req, 'error', 'Invalid section selected.');
      return res.redirect('/admin?tab=lottery');
    }

    const title = (req.body.title || '').trim();
    const description = (req.body.description || '').trim();
    const imageUrl = (req.body.image_url || '').trim();

    if (!title) {
      setFlash(req, 'error', 'Section title is required.');
      return res.redirect('/admin?tab=lottery');
    }
    if (imageUrl && !isSafeImageUrl(imageUrl)) {
      setFlash(req, 'error', 'Invalid image URL. Please upload the photo again.');
      return res.redirect('/admin?tab=lottery');
    }

    const existing = await queryOne(
      'SELECT id, image_url FROM lottery_sections WHERE id = $1',
      [id]
    );
    if (!existing) {
      setFlash(req, 'error', 'Section not found.');
      return res.redirect('/admin?tab=lottery');
    }

    const saved = await queryOne(
      `UPDATE lottery_sections
       SET title = $1, description = $2, image_url = $3
       WHERE id = $4
       RETURNING id, title`,
      [title, description, imageUrl || null, id]
    );

    if (!saved) {
      setFlash(req, 'error', 'Section could not be updated.');
      return res.redirect('/admin?tab=lottery');
    }

    if (existing.image_url && imageUrl && existing.image_url !== imageUrl) {
      await deleteImageIfInBucket(existing.image_url);
    }

    setFlash(req, 'success', `Lottery section "${saved.title}" updated and verified.`);
    return res.redirect('/admin?tab=lottery');
  } catch (err) {
    console.error('Lottery section edit failed:', err.message);
    setFlash(req, 'error', 'Could not update Lottery section. Please try again.');
    return res.redirect('/admin?tab=lottery');
  }
});

app.post('/admin/lottery/sections/toggle/:id', async (req, res) => {
  try {
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) {
      setFlash(req, 'error', 'Invalid section selected.');
      return res.redirect('/admin?tab=lottery');
    }

    const saved = await queryOne(
      `UPDATE lottery_sections
       SET visible = NOT visible
       WHERE id = $1
       RETURNING id, title, visible`,
      [id]
    );

    if (!saved) {
      setFlash(req, 'error', 'Section not found.');
      return res.redirect('/admin?tab=lottery');
    }

    setFlash(
      req,
      'success',
      saved.visible
        ? `"${saved.title}" is now visible on the Lottery page.`
        : `"${saved.title}" is now hidden on the Lottery page.`
    );
    return res.redirect('/admin?tab=lottery');
  } catch (err) {
    console.error('Lottery section toggle failed:', err.message);
    setFlash(req, 'error', 'Could not update section visibility.');
    return res.redirect('/admin?tab=lottery');
  }
});

app.post('/admin/lottery/sections/reorder/:id', async (req, res) => {
  try {
    const id = Number.parseInt(req.params.id, 10);
    const direction = String(req.body.direction || '').toLowerCase();
    if (!Number.isInteger(id) || !['up', 'down'].includes(direction)) {
      setFlash(req, 'error', 'Invalid reorder request.');
      return res.redirect('/admin?tab=lottery');
    }

    const current = await queryOne(
      'SELECT id, title, sort_order FROM lottery_sections WHERE id = $1',
      [id]
    );
    if (!current) {
      setFlash(req, 'error', 'Section not found.');
      return res.redirect('/admin?tab=lottery');
    }

    const neighbor = await queryOne(
      direction === 'up'
        ? `SELECT id, sort_order FROM lottery_sections
           WHERE sort_order < $1 OR (sort_order = $1 AND id < $2)
           ORDER BY sort_order DESC, id DESC LIMIT 1`
        : `SELECT id, sort_order FROM lottery_sections
           WHERE sort_order > $1 OR (sort_order = $1 AND id > $2)
           ORDER BY sort_order ASC, id ASC LIMIT 1`,
      [current.sort_order, current.id]
    );

    if (!neighbor) {
      setFlash(req, 'error', `"${current.title}" is already at the ${direction === 'up' ? 'top' : 'bottom'}.`);
      return res.redirect('/admin?tab=lottery');
    }

    await query('UPDATE lottery_sections SET sort_order = $1 WHERE id = $2', [
      neighbor.sort_order,
      current.id,
    ]);
    await query('UPDATE lottery_sections SET sort_order = $1 WHERE id = $2', [
      current.sort_order,
      neighbor.id,
    ]);

    const verified = await queryOne(
      'SELECT title, sort_order FROM lottery_sections WHERE id = $1',
      [current.id]
    );
    setFlash(req, 'success', `"${verified.title}" reorder saved.`);
    return res.redirect('/admin?tab=lottery');
  } catch (err) {
    console.error('Lottery section reorder failed:', err.message);
    setFlash(req, 'error', 'Could not reorder section.');
    return res.redirect('/admin?tab=lottery');
  }
});

app.post('/admin/lottery/sections/delete/:id', async (req, res) => {
  try {
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) {
      setFlash(req, 'error', 'Invalid section selected.');
      return res.redirect('/admin?tab=lottery');
    }

    const item = await queryOne(
      'SELECT title, image_url FROM lottery_sections WHERE id = $1',
      [id]
    );
    if (!item) {
      setFlash(req, 'error', 'Section not found.');
      return res.redirect('/admin?tab=lottery');
    }

    const deleted = await queryOne(
      'DELETE FROM lottery_sections WHERE id = $1 RETURNING id, title',
      [id]
    );
    if (!deleted) {
      setFlash(req, 'error', 'Section could not be deleted.');
      return res.redirect('/admin?tab=lottery');
    }

    if (item.image_url) {
      await deleteImageIfInBucket(item.image_url);
    }

    setFlash(req, 'success', `"${deleted.title}" removed from Lottery page.`);
    return res.redirect('/admin?tab=lottery');
  } catch (err) {
    console.error('Lottery section delete failed:', err.message);
    setFlash(req, 'error', 'Could not delete section.');
    return res.redirect('/admin?tab=lottery');
  }
});

app.use((err, req, res, _next) => {
  console.error('Unhandled error:', err.message);
  if (res.headersSent) return;
  const message = publicErrorMessage(err, 'Something went wrong. Please try again.');
  if (req.path.startsWith('/api/') || (req.headers.accept || '').includes('application/json')) {
    return res.status(500).json({ error: message });
  }
  return res.status(500).send(message);
});

async function start() {
  if (!getDatabaseUrl()) {
    console.error(
      'DATABASE_URL is required. Set it to your Supabase PostgreSQL connection string before starting the server.'
    );
    process.exit(1);
  }

  try {
    await initDatabase();
  } catch (err) {
    console.error('Failed to initialize PostgreSQL:', err.message);
    process.exit(1);
  }

  app.listen(PORT, () => {
    console.log(`Prabhu Cards & Gifts running at http://localhost:${PORT}`);
    console.log(`Admin dashboard: http://localhost:${PORT}/admin`);
    console.log('PostgreSQL: connected');
    const supabaseConfigError = getConfigError();
    if (supabaseConfigError) {
      const message = `Supabase Storage not configured: ${supabaseConfigError}`;
      if (process.env.NODE_ENV === 'production') {
        console.error(message);
      } else {
        console.warn(message);
      }
    } else {
      console.log(`Supabase Storage bucket: ${getBucketName()}`);
    }
    if (!ADMIN_PASSWORD) {
      console.warn('ADMIN_PASSWORD env var is not set. Set it to control the admin login password.');
    }
    if (!process.env.SESSION_SECRET) {
      console.warn(
        'SESSION_SECRET is not set. Sessions will not persist across restarts. Set SESSION_SECRET in your host environment.'
      );
    }
  });
}

start();

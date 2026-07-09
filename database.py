"""SQLite database setup and helpers for Prabhu Cards & Gifts."""

import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path

DB_PATH = Path(__file__).parent / "data" / "prabhu.db"

CATEGORIES = [
    ("trading-cards", "Trading Cards", "Sports, Pokémon, Magic & more collectibles."),
    ("greeting-cards", "Greeting Cards", "Birthday, wedding, sympathy & every occasion."),
    ("holiday-cards", "Holiday Cards", "Christmas, Valentine's, Easter & seasonal favorites."),
    ("gifts", "Gifts", "Figurines, mugs, décor, keepsakes & more."),
    ("balloons", "Balloons", "Birthday, graduation, baby shower & bouquets."),
    ("cigars", "Cigars & Cigarettes", "Premium cigars, popular brands & accessories."),
]

PRODUCTS = [
    ("Football Cards", "trading-cards", "Browse football cards from today's stars, rookies, and hobby boxes.", "https://images.unsplash.com/photo-1566577739112-5180d4bf7900?w=600&q=80"),
    ("Baseball Cards", "trading-cards", "Explore baseball cards featuring current stars, Hall of Famers, and rookies.", "https://images.unsplash.com/photo-1568602471122-7832951cc4c5?w=600&q=80"),
    ("Basketball Cards", "trading-cards", "Discover basketball trading cards, rookie cards, and premium hobby boxes.", "https://images.unsplash.com/photo-1546519638-68e109498ffc?w=600&q=80"),
    ("Soccer Cards", "trading-cards", "Find soccer trading cards from top leagues and international tournaments.", "https://images.unsplash.com/photo-1431324155629-1a6deb1dec8d?w=600&q=80"),
    ("Pokémon", "trading-cards", "Browse Pokémon booster packs, Elite Trainer Boxes, tins, and accessories.", "https://images.unsplash.com/photo-1613771404721-1f92d799e049?w=600&q=80"),
    ("Magic: The Gathering", "trading-cards", "Explore Magic booster packs, Commander decks, and collector boosters.", "https://images.unsplash.com/photo-1606166188505-aa7e997bb861?w=600&q=80"),
    ("Birthday Cards", "greeting-cards", "Fun, heartfelt, and milestone birthday cards for all ages.", "https://images.unsplash.com/photo-1530103862676-de8c9debad1d?w=600&q=80"),
    ("Anniversary Cards", "greeting-cards", "Celebrate years of love with elegant anniversary cards.", "https://images.unsplash.com/photo-1519741497674-611481863552?w=600&q=80"),
    ("Wedding Cards", "greeting-cards", "Beautiful cards to congratulate the happy couple.", "https://images.unsplash.com/photo-1519225421980-715cb0215aed?w=600&q=80"),
    ("Willow Tree Figurines", "gifts", "Hand-painted sculptures that express love, closeness, and healing.", "https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=600&q=80"),
    ("Coffee Mugs", "gifts", "Fun, inspirational mugs perfect for any coffee lover.", "https://images.unsplash.com/photo-1514228742587-6b1558fcca6d?w=600&q=80"),
    ("Home Décor", "gifts", "Decorative accents to brighten any room.", "https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?w=600&q=80"),
    ("Birthday Balloons", "balloons", "Vibrant balloons to make any birthday party extra special.", "https://images.unsplash.com/photo-1464349153735-7db50ed83c46?w=600&q=80"),
    ("Balloon Bouquets", "balloons", "Custom balloon bouquets crafted in-store for any occasion.", "https://images.unsplash.com/photo-1530103862676-de8c9debad1d?w=600&q=80"),
    ("Premium Cigars", "cigars", "Hand-selected premium cigars from top manufacturers.", "https://images.unsplash.com/photo-1609521263047-f8f205293bb4?w=600&q=80"),
    ("Cigar Accessories", "cigars", "Cutters, lighters, humidors, and other essentials.", "https://images.unsplash.com/photo-1622489402410-b8344474caa2?w=600&q=80"),
]


@contextmanager
def get_db():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db():
    with get_db() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS contacts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                email TEXT NOT NULL,
                phone TEXT,
                message TEXT NOT NULL,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS categories (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                slug TEXT UNIQUE NOT NULL,
                name TEXT NOT NULL,
                description TEXT
            );

            CREATE TABLE IF NOT EXISTS products (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                category_slug TEXT NOT NULL,
                description TEXT,
                image_url TEXT,
                in_stock INTEGER DEFAULT 1,
                created_at TEXT NOT NULL,
                FOREIGN KEY (category_slug) REFERENCES categories(slug)
            );
            """
        )

        for slug, name, description in CATEGORIES:
            conn.execute(
                """
                INSERT OR IGNORE INTO categories (slug, name, description)
                VALUES (?, ?, ?)
                """,
                (slug, name, description),
            )

        now = datetime.now(timezone.utc).isoformat()
        for name, category_slug, description, image_url in PRODUCTS:
            exists = conn.execute(
                "SELECT 1 FROM products WHERE name = ? AND category_slug = ?",
                (name, category_slug),
            ).fetchone()
            if not exists:
                conn.execute(
                    """
                    INSERT INTO products (name, category_slug, description, image_url, in_stock, created_at)
                    VALUES (?, ?, ?, ?, 1, ?)
                    """,
                    (name, category_slug, description, image_url, now),
                )


def save_contact(name, email, phone, message):
    created_at = datetime.now(timezone.utc).isoformat()
    with get_db() as conn:
        cursor = conn.execute(
            """
            INSERT INTO contacts (name, email, phone, message, created_at)
            VALUES (?, ?, ?, ?, ?)
            """,
            (name.strip(), email.strip(), (phone or "").strip(), message.strip(), created_at),
        )
        return cursor.lastrowid


def get_contacts(limit=50):
    with get_db() as conn:
        rows = conn.execute(
            """
            SELECT id, name, email, phone, message, created_at
            FROM contacts
            ORDER BY created_at DESC
            LIMIT ?
            """,
            (limit,),
        ).fetchall()
        return [dict(row) for row in rows]


def get_categories():
    with get_db() as conn:
        rows = conn.execute(
            "SELECT slug, name, description FROM categories ORDER BY name"
        ).fetchall()
        return [dict(row) for row in rows]


def get_products(category_slug=None):
    with get_db() as conn:
        if category_slug:
            rows = conn.execute(
                """
                SELECT id, name, category_slug, description, image_url, in_stock
                FROM products
                WHERE category_slug = ?
                ORDER BY name
                """,
                (category_slug,),
            ).fetchall()
        else:
            rows = conn.execute(
                """
                SELECT id, name, category_slug, description, image_url, in_stock
                FROM products
                ORDER BY category_slug, name
                """
            ).fetchall()
        return [dict(row) for row in rows]

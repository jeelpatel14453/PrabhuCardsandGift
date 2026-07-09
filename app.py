"""Flask server for Prabhu Cards & Gifts — serves the site and database API."""

from flask import Flask, jsonify, request, send_from_directory

import database as db

app = Flask(__name__, static_folder=".", static_url_path="")


@app.route("/")
def index():
    return send_from_directory(".", "index.html")


@app.route("/<path:filename>")
def static_files(filename):
    return send_from_directory(".", filename)


@app.route("/api/health")
def health():
    return jsonify({"status": "ok", "database": str(db.DB_PATH.name)})


@app.route("/api/contact", methods=["POST"])
def create_contact():
    data = request.get_json(silent=True) or {}

    name = (data.get("name") or "").strip()
    email = (data.get("email") or "").strip()
    phone = (data.get("phone") or "").strip()
    message = (data.get("message") or "").strip()

    if not name or not email or not message:
        return jsonify({"error": "Name, email, and message are required."}), 400

    if "@" not in email:
        return jsonify({"error": "Please enter a valid email address."}), 400

    contact_id = db.save_contact(name, email, phone, message)
    return jsonify({"success": True, "id": contact_id, "message": "Thank you! We received your message."}), 201


@app.route("/api/contacts")
def list_contacts():
    return jsonify(db.get_contacts())


@app.route("/api/categories")
def list_categories():
    return jsonify(db.get_categories())


@app.route("/api/products")
def list_products():
    category = request.args.get("category")
    return jsonify(db.get_products(category_slug=category))


if __name__ == "__main__":
    db.init_db()
    print("Database initialized at:", db.DB_PATH)
    print("Open http://localhost:8080 in your browser")
    app.run(host="0.0.0.0", port=8080, debug=True)

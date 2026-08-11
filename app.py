import os
from datetime import datetime, timezone

from flask import Flask, render_template, request, redirect, url_for, session, jsonify, flash
from flask_socketio import SocketIO, emit, join_room
from werkzeug.security import generate_password_hash, check_password_hash
from werkzeug.utils import secure_filename
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_PUBLISHABLE_KEY = os.getenv("SUPABASE_PUBLISHABLE_KEY")

if not SUPABASE_URL or not SUPABASE_PUBLISHABLE_KEY:
    raise RuntimeError("Missing SUPABASE_URL or SUPABASE_PUBLISHABLE_KEY in .env")

supabase = create_client(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)

app = Flask(__name__)
app.secret_key = os.getenv("SECRET_KEY", "change-this-secret-key")
app.config["MAX_CONTENT_LENGTH"] = 50 * 1024 * 1024

socketio = SocketIO(app, cors_allowed_origins="*")

FILES_BUCKET = "chat-files"
VOICE_BUCKET = "voice-notes"

ALLOWED_EXTENSIONS = {
    "txt","pdf","doc","docx","xls","xlsx","ppt","pptx","zip","rar","7z",
    "png","jpg","jpeg","gif","webp","svg",
    "mp3","wav","ogg","m4a","webm",
    "mp4","avi","mov","mkv","csv","json"
}

def now_iso():
    return datetime.now(timezone.utc).isoformat()

def allowed_file(filename):
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS

def public_url(bucket, path):
    return supabase.storage.from_(bucket).get_public_url(path)

@app.route("/")
def index():
    if "user_id" not in session:
        return redirect(url_for("login"))
    return render_template("chat.html",
                           username=session["username"],
                           user_id=session["user_id"])

@app.route("/register", methods=["GET", "POST"])
def register():
    if request.method == "POST":
        username = request.form.get("username", "").strip()
        email = request.form.get("email", "").strip().lower()
        password = request.form.get("password", "")

        if not username or not email or not password:
            flash("All fields are required.")
            return redirect(url_for("register"))

        if len(password) < 6:
            flash("Password must contain at least 6 characters.")
            return redirect(url_for("register"))

        try:
            e = supabase.table("users").select("id").eq("email", email).limit(1).execute()
            u = supabase.table("users").select("id").eq("username", username).limit(1).execute()

            if e.data:
                flash("Email already exists.")
                return redirect(url_for("register"))
            if u.data:
                flash("Username already exists.")
                return redirect(url_for("register"))

            supabase.table("users").insert({
                "username": username,
                "email": email,
                "password_hash": generate_password_hash(password),
                "created_at": now_iso()
            }).execute()

            return redirect(url_for("login"))

        except Exception as ex:
            print("REGISTER ERROR:", ex)
            flash("Registration failed. Check the terminal.")
            return redirect(url_for("register"))

    return render_template("register.html")

@app.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "POST":
        email = request.form.get("email", "").strip().lower()
        password = request.form.get("password", "")

        try:
            r = supabase.table("users").select("*").eq("email", email).limit(1).execute()

            if not r.data or not check_password_hash(r.data[0]["password_hash"], password):
                flash("Invalid email or password.")
                return redirect(url_for("login"))

            user = r.data[0]
            session["user_id"] = user["id"]
            session["username"] = user["username"]
            return redirect(url_for("index"))

        except Exception as ex:
            print("LOGIN ERROR:", ex)
            flash("Login failed. Check the terminal.")
            return redirect(url_for("login"))

    return render_template("login.html")

@app.route("/logout")
def logout():
    session.clear()
    return redirect(url_for("login"))

@app.route("/api/users")
def users():
    if "user_id" not in session:
        return jsonify({"error": "Unauthorized"}), 401

    try:
        r = (supabase.table("users")
             .select("id, username")
             .neq("id", session["user_id"])
             .order("username")
             .execute())
        return jsonify(r.data or [])
    except Exception as ex:
        print("USERS ERROR:", ex)
        return jsonify({"error": "Could not load users"}), 500

@app.route("/api/messages/<int:user_id>")
def messages(user_id):
    if "user_id" not in session:
        return jsonify({"error": "Unauthorized"}), 401

    me = session["user_id"]

    try:
        sent = (supabase.table("messages")
                .select("id,sender_id,receiver_id,message,message_type,file_name,file_path,created_at")
                .eq("sender_id", me).eq("receiver_id", user_id).order("id").execute())

        received = (supabase.table("messages")
                    .select("id,sender_id,receiver_id,message,message_type,file_name,file_path,created_at")
                    .eq("sender_id", user_id).eq("receiver_id", me).order("id").execute())

        rows = (sent.data or []) + (received.data or [])
        rows.sort(key=lambda x: x["id"])

        for row in rows:
            row["sender_name"] = session["username"] if row["sender_id"] == me else "User"
            if row.get("file_path"):
                bucket = VOICE_BUCKET if row["message_type"] == "voice" else FILES_BUCKET
                row["file_url"] = public_url(bucket, row["file_path"])

        # Add names for messages from the other user.
        other = next((x for x in rows if x["sender_id"] != me), None)
        if other:
            u = supabase.table("users").select("username").eq("id", other["sender_id"]).limit(1).execute()
            if u.data:
                for row in rows:
                    if row["sender_id"] == other["sender_id"]:
                        row["sender_name"] = u.data[0]["username"]

        return jsonify(rows)

    except Exception as ex:
        print("MESSAGES ERROR:", ex)
        return jsonify({"error": "Could not load messages"}), 500

@app.route("/upload", methods=["POST"])
def upload():
    if "user_id" not in session:
        return jsonify({"error": "Unauthorized"}), 401

    receiver_id = request.form.get("receiver_id", type=int)
    file = request.files.get("file")
    message_type = request.form.get("message_type", "file")

    if not receiver_id or not file or not file.filename:
        return jsonify({"error": "Receiver and file are required"}), 400

    if not allowed_file(file.filename):
        return jsonify({"error": "File type is not supported"}), 400

    receiver = supabase.table("users").select("id").eq("id", receiver_id).limit(1).execute()
    if not receiver.data:
        return jsonify({"error": "Receiver does not exist"}), 404

    original_name = secure_filename(file.filename)
    if not original_name:
        return jsonify({"error": "Invalid filename"}), 400

    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S%f")
    path = f"user_{session['user_id']}/{timestamp}_{original_name}"
    bucket = VOICE_BUCKET if message_type == "voice" else FILES_BUCKET

    try:
        supabase.storage.from_(bucket).upload(
            path=path,
            file=file.read(),
            file_options={
                "content-type": file.mimetype or "application/octet-stream",
                "cache-control": "3600",
                "upsert": "false"
            }
        )

        r = (supabase.table("messages")
             .insert({
                 "sender_id": session["user_id"],
                 "receiver_id": receiver_id,
                 "message": original_name,
                 "message_type": message_type,
                 "file_name": original_name,
                 "file_path": path,
                 "created_at": now_iso()
             })
             .select("*").execute())

        if not r.data:
            return jsonify({"error": "File uploaded but message was not saved"}), 500

        msg = r.data[0]
        msg["sender_name"] = session["username"]
        msg["file_url"] = public_url(bucket, path)

        socketio.emit("new_message", msg, room=f"user_{receiver_id}")
        socketio.emit("new_message", msg, room=f"user_{session['user_id']}")

        return jsonify(msg)

    except Exception as ex:
        print("UPLOAD ERROR:", ex)
        return jsonify({"error": "Upload failed. Check Storage bucket and policies."}), 500

@app.route("/uploads/<path:filename>")
def uploaded_file(filename):
    if "/" not in filename:
        return jsonify({"error": "Invalid file path"}), 400

    bucket, path = filename.split("/", 1)

    if bucket not in (FILES_BUCKET, VOICE_BUCKET):
        return jsonify({"error": "Invalid bucket"}), 400

    return redirect(public_url(bucket, path))

@socketio.on("connect")
def connected():
    if "user_id" in session:
        join_room(f"user_{session['user_id']}")
        emit("presence", {"user_id": session["user_id"], "online": True}, broadcast=True)

@socketio.on("disconnect")
def disconnected():
    if "user_id" in session:
        emit("presence", {"user_id": session["user_id"], "online": False}, broadcast=True)

@socketio.on("send_message")
def send_message(data):
    if "user_id" not in session:
        return

    try:
        receiver_id = int(data["receiver_id"])
        text = data.get("message", "").strip()
        if not text:
            return

        r = (supabase.table("messages")
             .insert({
                 "sender_id": session["user_id"],
                 "receiver_id": receiver_id,
                 "message": text,
                 "message_type": "text",
                 "created_at": now_iso()
             })
             .select("*").execute())

        if not r.data:
            return

        msg = r.data[0]
        msg["sender_name"] = session["username"]

        socketio.emit("new_message", msg, room=f"user_{receiver_id}")
        socketio.emit("new_message", msg, room=f"user_{session['user_id']}")

    except Exception as ex:
        print("SEND MESSAGE ERROR:", ex)

if __name__ == "__main__":
    print("Starting Chat App...")
    print("Supabase:", SUPABASE_URL)
    print("Open: http://127.0.0.1:5000")
    socketio.run(app, host="0.0.0.0", port=5000, debug=True)

# Simple Multi-User Chat App

A free local chat application built with Flask, SQLite, Flask-SocketIO and vanilla HTML/CSS/JavaScript.

## Features

- User registration and login
- One-to-one real-time text messaging
- Voice note recording and playback
- File sharing
- Images, documents, audio, video and common archive formats
- Local file storage
- Online/offline presence
- Responsive interface

## Run

### 1. Create virtual environment

Windows:
```bash
python -m venv venv
venv\Scripts\activate
```

### 2. Install packages

```bash
pip install -r requirements.txt
```

### 3. Start

```bash
python app.py
```

Open:

http://127.0.0.1:5000

Create two accounts in two browser windows to test chat.

## Notes

This is a learning/development version. Before production use, add stronger validation, CSRF protection, rate limiting, antivirus/file scanning, secure cloud storage, HTTPS and production-grade authentication.

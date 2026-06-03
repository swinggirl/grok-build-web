const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const path = require('path');

const sessionStore = new SQLiteStore({
  db: 'sessions.db',
  dir: path.join(__dirname, 'data'),
  table: 'sessions'
});

const sessionMiddleware = session({
  store: sessionStore,
  secret: process.env.SESSION_SECRET || 'change-this-to-a-long-random-string',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 1000 * 60 * 60 * 24 * 30, // 30 days
    httpOnly: true,
    secure: false, // Set to true if using HTTPS (Cloudflare Tunnel)
    sameSite: 'lax'
  }
});

module.exports = sessionMiddleware;
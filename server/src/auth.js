// auth.js
// ---------------------------------------------------------------------------
// Login module: email + password registration/login.
// Passwords are hashed with bcrypt (never stored in plain text). On success we
// issue a JWT the client sends back as `Authorization: Bearer <token>`.
// requireAuth() is the middleware that protects every other route.
// ---------------------------------------------------------------------------

import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import db from './db.js';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const TOKEN_TTL = '7d';

export function signToken(user) {
  return jwt.sign({ id: user.id, email: user.email, name: user.name }, JWT_SECRET, {
    expiresIn: TOKEN_TTL,
  });
}

// Express middleware: rejects the request unless a valid token is present.
export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export function register({ name, email, password }) {
  if (!name || !email || !password) throw new Error('Name, email and password are required');
  if (password.length < 6) throw new Error('Password must be at least 6 characters');

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
  if (existing) throw new Error('An account with this email already exists');

  const hash = bcrypt.hashSync(password, 10);
  const info = db
    .prepare('INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)')
    .run(name.trim(), email.toLowerCase().trim(), hash);
  const user = { id: info.lastInsertRowid, name: name.trim(), email: email.toLowerCase() };
  return { user, token: signToken(user) };
}

export function login({ email, password }) {
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get((email || '').toLowerCase());
  if (!user || !bcrypt.compareSync(password || '', user.password_hash)) {
    throw new Error('Invalid email or password');
  }
  const safe = { id: user.id, name: user.name, email: user.email };
  return { user: safe, token: signToken(safe) };
}

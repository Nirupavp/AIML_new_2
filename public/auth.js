/**
 * auth.js — Local-only login gate (email or phone).
 *
 * IMPORTANT / HONEST LIMITATION:
 * There is no backend, so there is no real SMS or email delivery, and this
 * is NOT secure authentication — anyone can read the "sent" code straight
 * off the screen. It exists to (a) give every user a stable identity to
 * scope their dashboard/history to, and (b) mimic the intended UX so it's
 * trivial to swap in real OTP delivery (Firebase Auth, Supabase, a small
 * Node server, etc.) later without changing the rest of the app.
 *
 * Session state:
 *   localStorage.motioniq_users          -> [{id, type, value, displayName}]
 *   localStorage.motioniq_current_user   -> id of logged-in user
 */
"use strict";

window.Auth = (function () {
  const USERS_KEY = "motioniq_users";
  const CURRENT_KEY = "motioniq_current_user";
  let _pendingCode = null;
  let _pendingIdentifier = null;

  function getUsers() {
    try { return JSON.parse(localStorage.getItem(USERS_KEY) || "[]"); }
    catch { return []; }
  }
  function saveUsers(list) {
    localStorage.setItem(USERS_KEY, JSON.stringify(list));
  }

  function currentUser() {
    const id = localStorage.getItem(CURRENT_KEY);
    if (!id) return null;
    return getUsers().find(u => u.id === id) || null;
  }

  function isEmail(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v); }
  function isPhone(v) { return /^\+?[0-9\s\-]{7,15}$/.test(v); }

  function sendCode(identifier) {
    identifier = (identifier || "").trim();
    if (!identifier) return { ok: false, error: "Enter an email or phone number." };
    if (!isEmail(identifier) && !isPhone(identifier)) {
      return { ok: false, error: "Enter a valid email address or phone number." };
    }
    _pendingIdentifier = identifier;
    _pendingCode = String(Math.floor(100000 + Math.random() * 900000));
    return { ok: true, code: _pendingCode, identifier, type: isEmail(identifier) ? "email" : "phone" };
  }

  function verifyCode(code) {
    if (!_pendingIdentifier) return { ok: false, error: "Request a code first." };
    if (String(code).trim() !== _pendingCode) return { ok: false, error: "Incorrect code — try again." };

    const users = getUsers();
    let user = users.find(u => u.value === _pendingIdentifier);
    if (!user) {
      user = {
        id: "u_" + Date.now().toString(36),
        type: isEmail(_pendingIdentifier) ? "email" : "phone",
        value: _pendingIdentifier,
        displayName: _pendingIdentifier.split("@")[0],
        createdAt: new Date().toISOString(),
      };
      users.push(user);
      saveUsers(users);
    }
    localStorage.setItem(CURRENT_KEY, user.id);
    _pendingCode = null;
    _pendingIdentifier = null;
    return { ok: true, user };
  }

  function logout() {
    localStorage.removeItem(CURRENT_KEY);
  }

  return { currentUser, sendCode, verifyCode, logout, isEmail, isPhone };
})();

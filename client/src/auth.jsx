// auth.jsx — global auth state via React context.
// Holds the current user, exposes login/register/logout, and restores the
// session from the saved token on first load.

import { createContext, useContext, useEffect, useState } from 'react';
import { api, setToken, getToken } from './api.js';

const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  // On load, if we have a token, ask the server who we are.
  useEffect(() => {
    if (!getToken()) return setReady(true);
    api.get('/api/me')
      .then((r) => setUser(r.user))
      .catch(() => setToken(null))
      .finally(() => setReady(true));
  }, []);

  const finish = ({ user, token }) => { setToken(token); setUser(user); return user; };

  const value = {
    user,
    ready,
    login: (email, password) => api.post('/api/auth/login', { email, password }).then(finish),
    register: (name, email, password) => api.post('/api/auth/register', { name, email, password }).then(finish),
    logout: () => { setToken(null); setUser(null); },
  };
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

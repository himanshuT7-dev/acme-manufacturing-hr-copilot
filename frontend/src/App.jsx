import React, { useState, useEffect } from 'react';
import Login from './pages/Login';
import Workspace from './pages/Workspace';

export default function App() {
  const [user, setUser] = useState(() => {
    try {
      const savedUser = localStorage.getItem('acme_user');
      return savedUser ? JSON.parse(savedUser) : null;
    } catch {
      return null;
    }
  });

  const [token, setToken] = useState(() => {
    try {
      return localStorage.getItem('acme_token') || null;
    } catch {
      return null;
    }
  });

  const handleLoginSuccess = (newUser, newToken) => {
    setUser(newUser);
    setToken(newToken);
    try {
      localStorage.setItem('acme_user', JSON.stringify(newUser));
      localStorage.setItem('acme_token', newToken);
    } catch (err) {
      console.warn('Could not save auth to localStorage:', err);
    }
  };

  const handleSignOut = () => {
    setUser(null);
    setToken(null);
    try {
      localStorage.removeItem('acme_user');
      localStorage.removeItem('acme_token');
    } catch (err) {
      console.warn('Could not clear auth from localStorage:', err);
    }
  };

  if (!user || !token) {
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  return <Workspace key={user.employee_id} user={user} token={token} onSignOut={handleSignOut} onSwitchUser={handleLoginSuccess} />;
}

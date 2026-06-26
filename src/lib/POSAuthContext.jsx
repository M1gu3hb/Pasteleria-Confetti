import React, { createContext, useContext, useState, useEffect } from 'react';

const POSAuthContext = createContext(null);

export function POSAuthProvider({ children }) {
  const [posUser, setPosUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const saved = sessionStorage.getItem('posUser');
    if (saved) {
      try { setPosUser(JSON.parse(saved)); } catch {}
    }
    setIsLoading(false);
  }, []);

  const login = (user) => {
    setPosUser(user);
    sessionStorage.setItem('posUser', JSON.stringify(user));
  };

  const logout = () => {
    setPosUser(null);
    sessionStorage.removeItem('posUser');
  };

  return (
    <POSAuthContext.Provider value={{ posUser, login, logout, isLoading }}>
      {children}
    </POSAuthContext.Provider>
  );
}

export function usePOSAuth() {
  const ctx = useContext(POSAuthContext);
  if (!ctx) throw new Error('usePOSAuth must be used within POSAuthProvider');
  return ctx;
}
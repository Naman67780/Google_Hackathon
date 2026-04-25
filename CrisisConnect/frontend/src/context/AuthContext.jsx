import React, { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [staff, setStaff] = useState(null);       // { name, email, token }
  const [loading, setLoading] = useState(true);

  // Rehydrate from localStorage on first load
  useEffect(() => {
    const saved = localStorage.getItem('crisisconnect_staff');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Quick server-side verification to reject expired tokens
        fetch('http://localhost:5001/api/staff/me', {
          headers: { Authorization: `Bearer ${parsed.token}` },
        })
          .then(r => r.ok ? setStaff(parsed) : logout())
          .catch(() => setStaff(parsed))   // if offline, trust local storage
          .finally(() => setLoading(false));
      } catch {
        setLoading(false);
      }
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (email, password) => {
    const res = await fetch('http://localhost:5001/api/staff/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Login failed');
    const staffData = { name: data.name, email: data.email, token: data.token };
    setStaff(staffData);
    localStorage.setItem('crisisconnect_staff', JSON.stringify(staffData));
    return staffData;
  };

  const logout = () => {
    setStaff(null);
    localStorage.removeItem('crisisconnect_staff');
  };

  return (
    <AuthContext.Provider value={{ staff, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);

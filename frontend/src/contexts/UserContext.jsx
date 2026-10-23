import React, { createContext, useContext, useState, useEffect } from "react";
import api, { updateProfile } from "../services/api";
import { connectSocket, disconnectSocket, getSocket } from "../services/socket";
import { queryClient } from "../providers/QueryProvider";

const ctx = createContext();
export const useUser = () => useContext(ctx);

// Chrome extension ID to sync auth into (see chrome-extension/public/manifest.json's
// "externally_connectable" and the background service worker's onMessageExternal
// listener). Left unset, this is a silent no-op — the extension just keeps its own
// separate Google sign-in.
const EXTENSION_ID = import.meta.env.VITE_EXTENSION_ID;

function sendToExtension(message) {
  const chromeRuntime = window.chrome?.runtime;
  if (!EXTENSION_ID || !chromeRuntime?.sendMessage) return;
  try {
    chromeRuntime.sendMessage(EXTENSION_ID, message, () => {
      void chromeRuntime.lastError; // extension not installed / no listener — ignore
    });
  } catch {
    // chrome.runtime unavailable in this context — ignore
  }
}

export function UserProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);

  // Load a saved session, or open a local one while Google sign-in is not configured.
  useEffect(() => {
    const storedToken = localStorage.getItem("accessToken");
    const storedUser = localStorage.getItem("user");

    if (storedToken && storedUser && storedUser !== "undefined") {
      setToken(storedToken);
      try {
        setUser(JSON.parse(storedUser));
      } catch {
        localStorage.removeItem("user");
        localStorage.removeItem("accessToken");
      }
      setLoading(false);
      return;
    }

    if (import.meta.env.VITE_GOOGLE_CLIENT_ID) {
      setLoading(false);
      return;
    }

    api.post("/auth/local")
      .then((data) => {
        setToken(data.token);
        setUser(data.user);
        localStorage.setItem("accessToken", data.token);
        localStorage.setItem("user", JSON.stringify(data.user));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Push auth state to the Chrome extension (if installed) so users don't have to sign
  // in twice — mirrors this context's token/user into chrome.storage.local via a message
  // the extension's background service worker listens for.
  useEffect(() => {
    if (loading) return; // wait for the initial localStorage read to finish
    if (token && user) {
      sendToExtension({
        type: 'SET_AUTH',
        payload: { authToken: token, apiUrl: import.meta.env.VITE_API_URL || 'http://localhost:4000/api', user },
      });
    } else if (!token) {
      sendToExtension({ type: 'CLEAR_AUTH' });
    }
  }, [token, user, loading]);

  // Connect socket when we have a token, disconnect on logout
  useEffect(() => {
    if (!token) return;
    const socket = connectSocket(token);

    socket.on('task:created', () => queryClient.invalidateQueries({ queryKey: ['tasks'] }));
    socket.on('task:updated', () => queryClient.invalidateQueries({ queryKey: ['tasks'] }));
    socket.on('tasks:refetch', () => queryClient.invalidateQueries({ queryKey: ['tasks'] }));
    socket.on('habit:created', () => queryClient.invalidateQueries({ queryKey: ['habits'] }));
    socket.on('habit:updated', () => queryClient.invalidateQueries({ queryKey: ['habits'] }));
    socket.on('habit:deleted', () => queryClient.invalidateQueries({ queryKey: ['habits'] }));

    return () => {
      disconnectSocket();
    };
  }, [token]);

  // Save token whenever it changes
  function saveToken(t) {
    setToken(t);
    localStorage.setItem("accessToken", t);
  }

  // Save user whenever it changes
  function saveUser(u) {
    setUser(u);
    if (u) {
      localStorage.setItem("user", JSON.stringify(u));
    } else {
      localStorage.removeItem("user");
    }
  }

  // Update user profile via API and sync local state
  async function updateUser(data) {
    const updated = await updateProfile(data);
    saveUser({ ...user, ...updated });
    return updated;
  }

  return (
    <ctx.Provider value={{ user, setUser: saveUser, updateUser, token, setToken: saveToken, loading }}>
      {children}
    </ctx.Provider>
  );
}


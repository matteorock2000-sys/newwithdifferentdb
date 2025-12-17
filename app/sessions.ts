import { createCookieSessionStorage } from "@remix-run/node";
import type { AdventureScenario } from "~/types";

type SessionData = {
  // Limit messages to last 50 to prevent cookie overflow
  messages?: { role: 'user' | 'model'; text: string }[]; 
  party: { type: 'Human' | 'AI' | 'None'; characterId: string | null; isReady: boolean }[];
  // Use server-side cache IDs instead of storing large objects
  scenarioCacheId?: string; 
  characterCacheId?: string;
  mapCacheId?: string | null;
  userId?: string;
  // Remove currentScenario from session to reduce size - fetch from cache when needed
};

type SessionFlashData = {
  error: string;
};

const { getSession, commitSession, destroySession } =
  createCookieSessionStorage<SessionData, SessionFlashData>({
    cookie: {
      name: "__session",
      httpOnly: true,
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: "/",
      sameSite: "lax",
      secrets: [process.env.SESSION_SECRET || "s3cr3t"], // Use environment variable for secret
      secure: process.env.NODE_ENV === "production",
    },
  });

// Helper function to safely add messages with size limit
export function addMessageToSession(session: any, message: { role: 'user' | 'model'; text: string }) {
  const messages = session.get("messages") || [];
  const newMessages = [...messages, message];
  
  // Limit to last 20 messages to prevent cookie overflow
  if (newMessages.length > 20) {
    newMessages.splice(0, newMessages.length - 20);
  }
  
  session.set("messages", newMessages);
}

// Helper function to clean up session data to prevent cookie overflow
export function cleanupSession(session: any) {
  // Remove any large objects that shouldn't be in session
  const data = session.data || {};
  
  // Remove currentScenario if it exists (should use cache ID instead)
  if (data.currentScenario) {
    delete data.currentScenario;
  }
  
  // Limit messages array
  if (data.messages && data.messages.length > 10) {
    data.messages = data.messages.slice(-10);
  }
  
  // Clear the session and set cleaned data
  Object.keys(data).forEach(key => session.unset(key));
  Object.keys(data).forEach(key => session.set(key, data[key]));
  
  // Return the session object
  return session;
}

export { getSession, commitSession, destroySession };

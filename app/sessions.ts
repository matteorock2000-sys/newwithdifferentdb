import { createCookieSessionStorage } from "@remix-run/node";
import type { AdventureScenario } from "~/types";

type SessionData = {
  messages?: { role: 'user' | 'model'; text: string }[]; // Made optional
  party: { type: 'Human' | 'AI' | 'None'; characterId: string | null; isReady: boolean }[];
  // Removed scenario data to avoid cookie overflow
  // Instead, we use a cache ID to retrieve data on the server
  scenarioCacheId?: string; 
  characterCacheId?: string; // <-- ID for server-side character cache
  currentScenario?: AdventureScenario; // Made optional
  mapCacheId?: string | null; // Made optional
  // lastImportRequest?: string; // <-- REMOVED: Storing this caused cookie overflow
  userId?: string; // <-- Store the authenticated user ID
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

export { getSession, commitSession, destroySession };

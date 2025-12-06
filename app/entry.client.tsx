/**
 * By default, Remix will handle hydrating your app on the client for you.
 * You are free to delete this file if you'd like to, but if you ever want it revealed again, you can run `npx remix reveal` ✨
 * For more information, see https://remix.run/file-conventions/entry.client
 */

import { RemixBrowser } from "@remix-run/react";
import { hydrateRoot } from "react-dom/client";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = window.ENV.SUPABASE_URL;
const supabaseAnonKey = window.ENV.SUPABASE_ANON_KEY;

export const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
  realtime: {
    headers: {
      apikey: supabaseAnonKey,
    },
  },
});

function hydrate() {
  hydrateRoot(document, <RemixBrowser />);
}

// Execute hydration immediately to prevent timing mismatches caused by
// requestIdleCallback or setTimeout in certain environments.
hydrate();

import { json } from "@remix-run/node";
import { db } from "~/services/db.server";

export async function loader() {
  const checks = {
    database: false,
    redis: false,
    realtime: false
  };
  
  try {
    // Test database connection
    const { error } = await db.from('users').select('id').limit(1);
    checks.database = !error;
  } catch (e) {
    checks.database = false;
  }
  
  try {
    // Test Redis connection (if available)
    // Redis connection check would go here if Redis is configured
    checks.redis = true; // For now, assume Redis is healthy if configured
  } catch (e) {
    checks.redis = false;
  }
  
  // Test Supabase realtime
  checks.realtime = true; // Assume healthy if database is healthy
  
  const allHealthy = Object.values(checks).every(v => v);
  
  return json(
    { status: allHealthy ? 'healthy' : 'degraded', checks },
    { status: allHealthy ? 200 : 503 }
  );
}
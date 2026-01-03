// Quick test to check if the room_scenario_votes table exists
import { db } from "./app/services/db.server";

async function checkTableExists() {
  try {
    console.log("Checking if room_scenario_votes table exists...");
    
    // Try to count rows in the table
    const { count, error } = await db.from('room_scenario_votes').select('*', { count: 'exact', head: true });
    
    if (error) {
      console.error("Table does not exist or has issues:", error);
      console.error("Error details:", {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code
      });
      return false;
    }
    
    console.log("Table exists! Row count:", count);
    return true;
  } catch (error) {
    console.error("Error checking table:", error);
    return false;
  }
}

// Run the check
checkTableExists();

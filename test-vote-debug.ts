// Test script to debug vote casting issues
import { db } from "./app/services/db.server";

async function testDatabaseConnection() {
  try {
    console.log("Testing database connection...");
    
    // Test a simple query
    const { data, error } = await db.from('room_scenario_votes').select('*').limit(1);
    
    if (error) {
      console.error("Database connection failed:", error);
      return false;
    }
    
    console.log("Database connection successful");
    console.log("Sample data:", data);
    return true;
  } catch (error) {
    console.error("Database test failed:", error);
    return false;
  }
}

async function testTableStructure() {
  try {
    console.log("Testing table structure...");
    
    // Check if the table exists and has the right columns
    const { data, error } = await db.rpc('information_schema.columns', {
      table_name: 'room_scenario_votes'
    });
    
    if (error) {
      console.error("Table structure check failed:", error);
      return false;
    }
    
    console.log("Table structure:", data);
    return true;
  } catch (error) {
    console.error("Table structure test failed:", error);
    return false;
  }
}

// Run tests
testDatabaseConnection().then(success => {
  if (success) {
    testTableStructure();
  }
});

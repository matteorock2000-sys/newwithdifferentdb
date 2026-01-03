// Test script to check database connection and table existence
import { db } from "./app/services/db.server";

async function testDatabase() {
  try {
    console.log("Testing database connection...");
    
    // Test basic connection
    const { data: rooms, error: roomsError } = await db.from('rooms').select('*').limit(1);
    
    if (roomsError) {
      console.error("Rooms table query failed:", roomsError);
      return false;
    }
    
    console.log("Rooms table query successful, sample data:", rooms?.[0]);
    
    // Test room_scenario_votes table
    const { data: votes, error: votesError } = await db.from('room_scenario_votes').select('*').limit(1);
    
    if (votesError) {
      console.error("room_scenario_votes table query failed:", votesError);
      return false;
    }
    
    console.log("room_scenario_votes table query successful, sample data:", votes?.[0]);
    
    // Test insertion
    const testVote = {
      room_code: 'TEST',
      user_id: '00000000-0000-0000-0000-000000000000',
      slot_index: 0,
      scenario_id: 'TEST_SCENARIO',
      character_id: 'TEST_CHARACTER',
      vote_type: 'scenario'
    };
    
    const { data: insertData, error: insertError } = await db
      .from('room_scenario_votes')
      .insert(testVote)
      .select()
      .single();
    
    if (insertError) {
      console.error("Insert test failed:", insertError);
      return false;
    }
    
    console.log("Insert test successful:", insertData);
    
    // Clean up test data
    await db.from('room_scenario_votes').delete().eq('id', insertData.id);
    console.log("Test data cleaned up");
    
    return true;
  } catch (error) {
    console.error("Database test failed:", error);
    return false;
  }
}

testDatabase().then(success => {
  if (success) {
    console.log("✅ Database connection and operations working!");
  } else {
    console.log("❌ Database issues detected");
  }
});

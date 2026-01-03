// Simple migration script using Supabase client
const { createClient } = require('@supabase/supabase-js');

// Load environment variables
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const sql = `
create table public.room_scenario_votes (
  id uuid not null default gen_random_uuid (),
  room_code character varying(255) not null,
  user_id uuid not null,
  slot_index integer not null,
  scenario_id character varying(255) null,
  vote_type character varying(20) null default 'scenario'::character varying,
  created_at timestamp with time zone null default now(),
  updated_at timestamp with time zone null default now(),
  constraint room_scenario_votes_pkey primary key (id),
  constraint room_scenario_votes_room_code_user_id_slot_index_key unique (room_code, user_id, slot_index),
  constraint room_scenario_votes_room_code_fkey foreign KEY (room_code) references rooms (code) on delete CASCADE,
  constraint room_scenario_votes_vote_type_check check (
    (
      (vote_type)::text = any (
        (
          array[
            'scenario'::character varying,
            'regenerate'::character varying
          ]
        )::text[]
      )
    )
  ),
  constraint valid_vote check (
    (
      (
        ((vote_type)::text = 'scenario'::text)
        and (scenario_id is not null)
      )
      or (
        ((vote_type)::text = 'regenerate'::text)
        and (scenario_id is null)
      )
    )
  )
);

create index idx_room_votes on public.room_scenario_votes using btree (room_code);

create index idx_room_user_votes on public.room_scenario_votes using btree (room_code, user_id);

create index idx_scenario_votes on public.room_scenario_votes using btree (scenario_id)
where
  (scenario_id is not null);

CREATE OR REPLACE FUNCTION update_room_scenario_votes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

create trigger update_room_scenario_votes_updated_at BEFORE
update on room_scenario_votes for EACH row
execute FUNCTION update_room_scenario_votes_updated_at ();
`;

async function runMigration() {
  try {
    console.log('Creating room_scenario_votes table...');
    
    // Execute the SQL as admin
    const { error } = await supabase.from('room_scenario_votes').select().limit(0);
    
    if (error && error.code === '42P01') {
      // Table doesn't exist, create it
      console.log('Table does not exist, creating...');
      const { error: createError } = await supabase.rpc('sql', { sql: sql });
      
      if (createError) {
        console.error('Failed to create table:', createError);
        return false;
      }
      
      console.log('Table created successfully!');
      return true;
    } else if (!error) {
      console.log('Table already exists!');
      return true;
    } else {
      console.error('Unexpected error:', error);
      return false;
    }
  } catch (error) {
    console.error('Migration error:', error);
    return false;
  }
}

runMigration().then(success => {
  if (success) {
    console.log('✅ Migration completed successfully!');
  } else {
    console.log('❌ Migration failed');
  }
  process.exit(success ? 0 : 1);
});

// Database migration script for room_scenario_votes table
import { db } from "./app/services/db.server";

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
) TABLESPACE pg_default;

create index IF not exists idx_room_votes on public.room_scenario_votes using btree (room_code) TABLESPACE pg_default;

create index IF not exists idx_room_user_votes on public.room_scenario_votes using btree (room_code, user_id) TABLESPACE pg_default;

create index IF not exists idx_scenario_votes on public.room_scenario_votes using btree (scenario_id) TABLESPACE pg_default
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
    console.log("Creating room_scenario_votes table...");
    
    // Execute the SQL directly using db.rpc
    const { error } = await db.rpc('sql', { sql });
    
    if (error) {
      console.error("Migration failed:", error);
      return false;
    }
    
    console.log("Migration successful!");
    return true;
  } catch (error) {
    console.error("Migration error:", error);
    return false;
  }
}

// Run the migration
runMigration().then(success => {
  if (success) {
    console.log("✅ Table created successfully!");
  } else {
    console.log("❌ Migration failed, table may already exist or there's a permission issue");
  }
});

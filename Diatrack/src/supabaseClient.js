import { createClient } from "@supabase/supabase-js";

// Initialize your Supabase client
const supabase = createClient(
  "https://ejsslvawocdxaojmzvep.supabase.co", // Replace with your Supabase URL
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVqc3NsdmF3b2NkeGFvam16dmVwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjEwNTcxNjIsImV4cCI6MjA3NjYzMzE2Mn0.Sr4M9WSxnbPYxop5rUO6KHQshTDhBea6V1hvVb18jGM" // Replace with your Supabase anon key
);

export default supabase;
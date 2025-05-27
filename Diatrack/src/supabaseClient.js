import { createClient } from "@supabase/supabase-js";

// Initialize your Supabase client
const supabase = createClient(
  "https://wvpjwsectrwohraolniu.supabase.co", // Replace with your Supabase URL
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind2cGp3c2VjdHJ3b2hyYW9sbml1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDM2MDgzNjQsImV4cCI6MjA1OTE4NDM2NH0.4DAp0jYwzqdPkjeGbvCl-KkhvQh_wBKKU_RvjQY0urU" // Replace with your Supabase anon key
);

export default supabase;
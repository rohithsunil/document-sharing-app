import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://orovhiegqjjovuapywtr.supabase.co";
const supabaseAnonKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9yb3ZoaWVncWpqb3Z1YXB5d3RyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzQ0MjE5MjcsImV4cCI6MjA0OTk5NzkyN30.hp5L74TVv5FbaU-M4G-RJiKFaD3gj98V9OCoD39Tvg4";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

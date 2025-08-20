// supabase-config.js
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

const supabaseUrl = 'https://toviekzgoxwumanyxkvv.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRvdmlla3pnb3h3dW1hbnl4a3Z2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU1MzIxNzUsImV4cCI6MjA3MTEwODE3NX0.eDgM2Bu7UsL3YMdFqVNruNCyiJvqsao44Noba1LfjdY';

// Create and export the Supabase client
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

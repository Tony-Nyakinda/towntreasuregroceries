// supabase-config.js
// This file initializes and exports the Supabase client for frontend use.
// It uses global variables provided by the Canvas environment for security.

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

// The Supabase URL and anonymous key are provided by the Canvas environment.
// Fallback to a default if they are not defined.
const supabaseUrl = typeof __supabase_url !== 'undefined' ? __supabase_url : 'https://toviekzgoxwumanyxkvv.supabase.co';
const supabaseAnonKey = typeof __supabase_anon_key !== 'undefined' ? __supabase_anon_key : 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRvdmlla3pnb3h3dW1hbnl4a3Z2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU1MzIxNzUsImV4cCI6MjA3MTEwODE3NX0.eDgM2Bu7UsL3YMdFqVNruNCyiJvqsao44Noba1LfjdY';

// Create a single Supabase client for the application.
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

console.log('Supabase client initialized.');

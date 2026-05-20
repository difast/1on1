import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://gxhmgwfgbouuvmdnswel.supabase.co'
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd4aG1nd2ZnYm91dXZtZG5zd2VsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxMTUyNzUsImV4cCI6MjA5NDY5MTI3NX0.ADHb8aVrzfZR4hO5n2S-0AgfKOgDcvb2zp9MfgFyqaU'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

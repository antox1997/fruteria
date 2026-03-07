import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://ldaavqvuitlsooufachf.supabase.co'
const supabaseAnonKey = 'sb_publishable_4jP5rEb2wZ6oTVuM4jU6Zw_KTegCPDx'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

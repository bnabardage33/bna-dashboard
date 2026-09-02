import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({path: '.env.local'})
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

async function test() {
  const { data, error } = await supabase.from('avancements_chantier').select('*').limit(1)
  if (data && data.length > 0) {
    console.log(Object.keys(data[0]))
  } else {
    console.log("No data or error:", error)
    // insert a dummy and delete or just select without limit to see if empty
  }
}
test()

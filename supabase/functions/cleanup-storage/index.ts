import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SERVICE_ROLE_KEY')!
)

Deno.serve(async (req) => {
  try {
    // 🔐 Protect endpoint
    const authHeader = req.headers.get('authorization')
    if (authHeader !== `Bearer ${Deno.env.get('SERVICE_ROLE_KEY')}`) {
      return new Response('Unauthorized', { status: 401 })
    }

    const { files, bucket = 'flyers' } = await req.json()

    if (!files || !Array.isArray(files)) {
      return new Response(JSON.stringify({ error: 'Invalid file list' }), { status: 400 })
    }

    const chunkSize = 50
    const results = []

    for (let i = 0; i < files.length; i += chunkSize) {
      const chunk = files.slice(i, i + chunkSize)

      console.log(`Deleting chunk ${i / chunkSize + 1} from bucket ${bucket}`)

      const { error } = await supabase
        .storage
        .from(bucket)
        .remove(chunk)

      results.push({
        count: chunk.length,
        success: !error,
        error: error?.message || null
      })
    }

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { 'Content-Type': 'application/json' }
    })

  } catch (err) {
    return new Response(JSON.stringify({ 
      error: err instanceof Error ? err.message : 'Unknown error' 
    }), { status: 500 })
  }
})
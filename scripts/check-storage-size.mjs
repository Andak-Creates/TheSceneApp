import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://kxjwssyacuxvtlvszgse.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt4andzc3lhY3V4dnRsdnN6Z3NlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2Nzg4MzE2NiwiZXhwIjoyMDgzNDU5MTY2fQ.S7N3QXVwgPqtQQlIJTYItpkKt6Rj0dgyiAFjmrnMKF8';

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function checkAllBuckets() {
  const { data: buckets, error: bucketError } = await supabase.storage.listBuckets();
  if (bucketError) {
    console.error('Error fetching buckets:', bucketError.message);
    return;
  }

  let grandTotalSize = 0;
  let grandTotalFiles = 0;

  console.log(`Found ${buckets.length} buckets: ${buckets.map(b => b.name).join(', ')}`);

  for (const bucketInfo of buckets) {
    const bucket = bucketInfo.name;
    let totalSize = 0;
    let fileCount = 0;

    async function scan(folder = '') {
      const { data, error } = await supabase.storage.from(bucket).list(folder, {
        limit: 1000,
        offset: 0,
        sortBy: { column: 'name', order: 'asc' }
      });

      if (error) {
        console.error(`Error scanning folder ${folder} in ${bucket}:`, error.message);
        return;
      }

      for (const item of data) {
        if (!item.id) { // Folder
          await scan(folder ? `${folder}/${item.name}` : item.name);
        } else {
          totalSize += item.metadata.size || 0;
          fileCount++;
        }
      }
    }

    await scan();
    grandTotalSize += totalSize;
    grandTotalFiles += fileCount;

    console.log(`\n- Bucket: ${bucket}`);
    console.log(`  Files: ${fileCount}`);
    console.log(`  Space: ${(totalSize / (1024 * 1024)).toFixed(2)} MB`);
  }

  console.log('\n--- GRAND TOTAL USAGE ---');
  console.log(`Total Buckets: ${buckets.length}`);
  console.log(`Total Files:   ${grandTotalFiles}`);
  console.log(`Total Space:   ${(grandTotalSize / (1024 * 1024)).toFixed(2)} MB`);
  console.log(`               ~ ${(grandTotalSize / (1024 * 1024 * 1024)).toFixed(2)} GB`);
}

checkAllBuckets();


import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://kxjwssyacuxvtlvszgse.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt4andzc3lhY3V4dnRsdnN6Z3NlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2Nzg4MzE2NiwiZXhwIjoyMDgzNDU5MTY2fQ.S7N3QXVwgPqtQQlIJTYItpkKt6Rj0dgyiAFjmrnMKF8';

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const filesToCheck = [
  'party-media/da192472-b455-4df5-b892-4ea0db3fe379/video_1774556576975.mp4',
  'party-media/da192472-b455-4df5-b892-4ea0db3fe379/video_1774556541978.mp4',
  'party-media/bd4fd5bb-e469-4b57-a31e-d7f085aa07cb/video_1772579692079.mp4',
  'party-media/da192472-b455-4df5-b892-4ea0db3fe379/video_1774052943383.mp4',
  'party-media/c6fd8786-e58e-4800-9f37-8c4604ebc986/video_1772496712452.mp4',
  'party-media/bd4fd5bb-e469-4b57-a31e-d7f085aa07cb/image_1772721940975.heic',
  'party-media/93e36f1a-e6ec-4ba3-8ab3-f67d1d073ea7/thumb_1774710270327.jpg',
  'party-media/bd4fd5bb-e469-4b57-a31e-d7f085aa07cb/image_1772184556962.heic',
  'party-media/2134fe60-8697-42c2-846a-dfd5ad928f07/1774105552954.mp4',
  'party-media/2134fe60-8697-42c2-846a-dfd5ad928f07/1774105574807.mp4',
  'party-media/bd4fd5bb-e469-4b57-a31e-d7f085aa07cb/image_1772721939842.webp',
  'party-media/bd4fd5bb-e469-4b57-a31e-d7f085aa07cb/image_1772661222868.webp',
  'party-media/c6fd8786-e58e-4800-9f37-8c4604ebc986/image_1772496721078.jpg',
  'party-media/2134fe60-8697-42c2-846a-dfd5ad928f07/1774105472198.jpg',
  'party-media/da192472-b455-4df5-b892-4ea0db3fe379/video_1774110010027.mp4',
  'party-media/93e36f1a-e6ec-4ba3-8ab3-f67d1d073ea7/image_1774109554096.png',
  'party-media/ed502208-c3ab-49bc-bda2-1c39e2368cf0/1774045914632.jpg',
  'party-media/bd4fd5bb-e469-4b57-a31e-d7f085aa07cb/image_1773142391203.jpg',
  'party-media/c2b81089-7ce2-4753-abfb-0ccff553c851/thumb_1774558812927.jpg',
  'party-media/93e36f1a-e6ec-4ba3-8ab3-f67d1d073ea7/image_1774109124447.webp',
  'party-media/61df28d7-4279-4f3f-80d6-ea82ee2e99bd/video_1772931023607.mp4',
  'party-media/bd4fd5bb-e469-4b57-a31e-d7f085aa07cb/video_1772184559038.mp4',
  'party-media/da192472-b455-4df5-b892-4ea0db3fe379/image_1774558944949.jpg',
  'party-media/bd4fd5bb-e469-4b57-a31e-d7f085aa07cb/video_1772721942322.mp4',
  'party-media/93e36f1a-e6ec-4ba3-8ab3-f67d1d073ea7/thumb_1774109557499.jpg',
  'bd4fd5bb-e469-4b57-a31e-d7f085aa07cb/bd4fd5bb-e469-4b57-a31e-d7f085aa07cb-1769562503046.png',
  'party-media/d3ef3817-20ee-48ec-ba67-f6d642da2e06/1773141995280.jpg',
  'party-media/da192472-b455-4df5-b892-4ea0db3fe379/thumb_1774558944477.jpg',
  'party-media/da192472-b455-4df5-b892-4ea0db3fe379/image_1774052949639.jpg',
  'party-media/b9c8c961-035a-4c02-b532-94a14f6a849f/image_1772927714839.png',
  'party-media/ae2a5293-ddf2-4775-bd04-eafd8a90fd42/image_1773959362772.png',
  'party-media/e6de5f09-0d1e-4f17-968d-d7981b890252/image_1773415829045.jpg',
  'party-media/c2b81089-7ce2-4753-abfb-0ccff553c851/1774558822826.jpg',
  'party-media/da192472-b455-4df5-b892-4ea0db3fe379/thumb_1774110014142.jpg',
  'party-media/da192472-b455-4df5-b892-4ea0db3fe379/image_1774052948987.jpg',
  'party-media/da192472-b455-4df5-b892-4ea0db3fe379/image_1773799827768.png',
  'party-media/da192472-b455-4df5-b892-4ea0db3fe379/video_1773513594674.mov',
  'party-media/0424603e-05f4-4dfc-91c5-9eee264f8b84/image_1773414056210.jpg',
  'party-media/bd4fd5bb-e469-4b57-a31e-d7f085aa07cb/image_1772579688752.jpg',
  'party-media/93e36f1a-e6ec-4ba3-8ab3-f67d1d073ea7/thumb_1774109123948.jpg',
  'party-media/bd4fd5bb-e469-4b57-a31e-d7f085aa07cb/image_1772661224321.jpg',
  'party-media/da192472-b455-4df5-b892-4ea0db3fe379/image_1774110008704.jpg',
  'party-media/74a056b1-4272-4221-b5f6-94d16a6abb46/image_1772902787605.jpg',
  'party-media/bd4fd5bb-e469-4b57-a31e-d7f085aa07cb/image_1773142389236.jpg',
  'party-media/bd4fd5bb-e469-4b57-a31e-d7f085aa07cb/video_1772661225785.mp4',
  'party-media/93e36f1a-e6ec-4ba3-8ab3-f67d1d073ea7/video_1774109554831.mp4',
  'party-media/0424603e-05f4-4dfc-91c5-9eee264f8b84/image_1773414054959.jpg',
  'party-media/bd4fd5bb-e469-4b57-a31e-d7f085aa07cb/image_1772184558454.jpg',
  'party-media/79dcb135-c1a4-42e2-a732-075f96824745/image_1771711815281.jpg',
  'party-media/da192472-b455-4df5-b892-4ea0db3fe379/video_1773768644385.mp4',
  'party-media/93e36f1a-e6ec-4ba3-8ab3-f67d1d073ea7/image_1773799904709.jpeg',
  'party-media/93e36f1a-e6ec-4ba3-8ab3-f67d1d073ea7/image_1773799944694.jpeg',
  'bd4fd5bb-e469-4b57-a31e-d7f085aa07cb/bd4fd5bb-e469-4b57-a31e-d7f085aa07cb-1769986378384.png',
  'party-media/61df28d7-4279-4f3f-80d6-ea82ee2e99bd/image_1772931021840.png',
  'party-media/da192472-b455-4df5-b892-4ea0db3fe379/image_1773538642952.jpg',
  'party-media/da192472-b455-4df5-b892-4ea0db3fe379/video_1774558941714.mp4',
  'party-media/b82ffbdd-5c7d-4a0a-be18-9fc17b1b8d8d/image_1774873808366.jpg',
  'e0438a63-3a3b-4967-945a-7273bd052fce/e0438a63-3a3b-4967-945a-7273bd052fce-1769288395693.jpg',
  'party-media/93e36f1a-e6ec-4ba3-8ab3-f67d1d073ea7/video_1774109120728.mp4',
  'party-media/2134fe60-8697-42c2-846a-dfd5ad928f07/1774105589829.mp4',
  'party-media/55419452-f8fb-4f3b-8e80-2fd7605f5361/1773538083480.jpg',
  'party-media/c6fd8786-e58e-4800-9f37-8c4604ebc986/image_1772496710006.jpg',
  'party-media/c6fd8786-e58e-4800-9f37-8c4604ebc986/image_1772496719434.jpg',
  'bd4fd5bb-e469-4b57-a31e-d7f085aa07cb/bd4fd5bb-e469-4b57-a31e-d7f085aa07cb-1769870142651.jpg',
  'bd4fd5bb-e469-4b57-a31e-d7f085aa07cb/bd4fd5bb-e469-4b57-a31e-d7f085aa07cb-1769212536987.jpg',
  'bd4fd5bb-e469-4b57-a31e-d7f085aa07cb/bd4fd5bb-e469-4b57-a31e-d7f085aa07cb-1769211594095.jpg',
  'bd4fd5bb-e469-4b57-a31e-d7f085aa07cb/bd4fd5bb-e469-4b57-a31e-d7f085aa07cb-1769215030229.jpg',
  'party-media/c7f9e36e-83ca-411d-811f-92eab6d82f54/image_1773008995492.jpg',
  'party-media/c7f9e36e-83ca-411d-811f-92eab6d82f54/image_1772987626683.jpg',
  'party-media/c7f9e36e-83ca-411d-811f-92eab6d82f54/image_1772987673964.jpg',
  'party-media/bd4fd5bb-e469-4b57-a31e-d7f085aa07cb/video_1772721945935.mp4',
  'bd4fd5bb-e469-4b57-a31e-d7f085aa07cb/bd4fd5bb-e469-4b57-a31e-d7f085aa07cb-1770089643397.png',
  'party-media/c2b81089-7ce2-4753-abfb-0ccff553c851/1774558810688.mp4',
  'party-media/bd4fd5bb-e469-4b57-a31e-d7f085aa07cb/image_1772579690633.jpg',
  '59fa0738-f892-488c-bf76-f463cb1ac1c2/59fa0738-f892-488c-bf76-f463cb1ac1c2-1769613342101.jpg',
  'party-media/2134fe60-8697-42c2-846a-dfd5ad928f07/1774045862417.jpg',
  'party-media/79dcb135-c1a4-42e2-a732-075f96824745/video_1771711817447.mp4',
  'party-media/61df28d7-4279-4f3f-80d6-ea82ee2e99bd/image_1772931022603.jpg',
  'bd4fd5bb-e469-4b57-a31e-d7f085aa07cb/bd4fd5bb-e469-4b57-a31e-d7f085aa07cb-1769559580066.jpg',
  'party-media/da192472-b455-4df5-b892-4ea0db3fe379/thumb_1774556549415.jpg',
  'party-media/da192472-b455-4df5-b892-4ea0db3fe379/thumb_1774556583385.jpg',
  'party-media/da192472-b455-4df5-b892-4ea0db3fe379/image_1773768643393.jpg',
  'party-media/93e36f1a-e6ec-4ba3-8ab3-f67d1d073ea7/video_1774710268732.mp4',
  'party-media/c7f9e36e-83ca-411d-811f-92eab6d82f54/image_1772987675368.jpg',
  'party-media/c7f9e36e-83ca-411d-811f-92eab6d82f54/image_1772987628465.jpg',
  'party-media/2134fe60-8697-42c2-846a-dfd5ad928f07/1774105338712.mov',
  'verification/c6fd8786-e58e-4800-9f37-8c4604ebc986/id_1772496258496.jpg',
  'verification/b9c8c961-035a-4c02-b532-94a14f6a849f/id_1772926583395.jpg',
  'verification/c7f9e36e-83ca-411d-811f-92eab6d82f54/id_1772987210535.jpg',
  'verification/61df28d7-4279-4f3f-80d6-ea82ee2e99bd/id_1772818028301.jpg',
  '.emptyFolderPlaceholder',
  'verification/74a056b1-4272-4221-b5f6-94d16a6abb46/id_1772900773342.jpg'
];

async function runAudit() {
  console.log('--- Starting Storage Audit ---');
  
  // 1. Fetch all URL references from DB
  const [
    { data: parties },
    { data: partyMedia },
    { data: hostProfiles },
    { data: profiles },
    { data: hostVerifications }
  ] = await Promise.all([
    supabase.from('parties').select('flyer_url'),
    supabase.from('party_media').select('media_url, thumbnail_url'),
    supabase.from('host_profiles').select('avatar_url'),
    supabase.from('profiles').select('avatar_url'),
    supabase.from('host_verifications').select('id_image_url')
  ]);

  const dbUrls = new Set([
    ...(parties || []).map(p => p.flyer_url),
    ...(partyMedia || []).map(m => m.media_url),
    ...(partyMedia || []).map(m => m.thumbnail_url),
    ...(hostProfiles || []).map(h => h.avatar_url),
    ...(profiles || []).map(p => p.avatar_url),
    ...(hostVerifications || []).map(v => v.id_image_url)
  ].filter(Boolean));

  console.log(`Found ${dbUrls.size} unique media references in database.`);

  const orphans = [];
  const active = [];

  // 2. Cross-reference
  for (const filePath of filesToCheck) {
    if (filePath === '.emptyFolderPlaceholder') {
      orphans.push(filePath);
      continue;
    }

    let found = false;
    for (const url of dbUrls) {
      if (url.includes(filePath)) {
        found = true;
        break;
      }
    }

    if (found) {
      active.push(filePath);
    } else {
      orphans.push(filePath);
    }
  }

  // 3. Output results
  console.log('\n--- AUDIT RESULTS ---');
  console.log(`Checked: ${filesToCheck.length} files`);
  console.log(`Orphans confirmed: ${orphans.length}`);
  console.log(`Active files found: ${active.length}`);

  if (active.length > 0) {
    console.log('\n⚠️ WARNING: The following files ARE referenced in the database:');
    active.forEach(f => console.log(` - ${f}`));
  }

  if (orphans.length > 0) {
    console.log('\n✅ OK TO DELETE (Orphans):');
    console.log(JSON.stringify(orphans, null, 2));
  }
}

runAudit();

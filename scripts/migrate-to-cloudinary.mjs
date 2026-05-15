import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

// Ensure all required variables are present
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SERVICE_ROLE || process.env.SUPABASE_SERVICE_ROLE_KEY;
const cloudName = process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME;
const uploadPreset = process.env.EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase credentials. Make sure EXPO_PUBLIC_SUPABASE_URL and SERVICE_ROLE are in your .env file.");
  process.exit(1);
}

if (!cloudName || !uploadPreset) {
  console.error("Missing Cloudinary credentials. Make sure EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME and EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET are in your .env file.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function unsignedCloudinaryUpload(fileUrl, folder) {
  const url = `https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`;
  
  const formData = new FormData();
  formData.append('file', fileUrl);
  formData.append('upload_preset', uploadPreset);
  if (folder) {
    formData.append('folder', folder);
  }

  const response = await fetch(url, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(`Cloudinary upload failed: ${err.error?.message || response.statusText}`);
  }

  return response.json();
}

async function migratePartyFlyers() {
  console.log("\n🔄 Starting migration: Party Flyers...");
  const { data: parties, error } = await supabase
    .from('parties')
    .select('id, flyer_url')
    .like('flyer_url', '%supabase.co%');

  if (error) {
    console.error("Error fetching parties:", error);
    return;
  }

  console.log(`Found ${parties.length} party flyers to migrate.`);
  
  for (const party of parties) {
    try {
      console.log(`Uploading flyer for party ${party.id}...`);
      const uploadResult = await unsignedCloudinaryUpload(party.flyer_url, `parties/${party.id}`);
      
      const { error: updateError } = await supabase
        .from('parties')
        .update({ flyer_url: uploadResult.secure_url })
        .eq('id', party.id);

      if (updateError) throw updateError;
      console.log(`✅ Migrated flyer for party ${party.id}`);
    } catch (err) {
      console.error(`❌ Failed to migrate flyer for party ${party.id}:`, err.message);
    }
  }
}

async function migratePartyMedia() {
  console.log("\n🔄 Starting migration: Party Media Gallery...");
  const { data: media, error } = await supabase
    .from('party_media')
    .select('id, media_url, media_type, party_id')
    .like('media_url', '%supabase.co%');

  if (error) {
    console.error("Error fetching party media:", error);
    return;
  }

  console.log(`Found ${media.length} party media items to migrate.`);
  
  for (const item of media) {
    try {
      console.log(`Uploading media ${item.id} for party ${item.party_id}...`);
      const uploadResult = await unsignedCloudinaryUpload(item.media_url, `parties/${item.party_id}/gallery`);
      
      let thumbnailUrl = null;
      if (item.media_type === 'video') {
        // Generate Cloudinary video thumbnail by replacing extension with .jpg
        const splitUrl = uploadResult.secure_url.split('.');
        splitUrl.pop();
        thumbnailUrl = `${splitUrl.join('.')}.jpg`;
      }

      const { error: updateError } = await supabase
        .from('party_media')
        .update({ 
          media_url: uploadResult.secure_url,
          thumbnail_url: thumbnailUrl
        })
        .eq('id', item.id);

      if (updateError) throw updateError;
      console.log(`✅ Migrated media ${item.id}`);
    } catch (err) {
      console.error(`❌ Failed to migrate media ${item.id}:`, err.message);
    }
  }
}

async function migrateUserAvatars() {
  console.log("\n🔄 Starting migration: User Avatars...");
  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('id, avatar_url')
    .like('avatar_url', '%supabase.co%')
    .not('avatar_url', 'is', null);

  if (error) {
    console.error("Error fetching user profiles:", error);
    return;
  }

  console.log(`Found ${profiles.length} user avatars to migrate.`);
  
  for (const profile of profiles) {
    try {
      if (!profile.avatar_url) continue;
      console.log(`Uploading avatar for user ${profile.id}...`);
      const uploadResult = await unsignedCloudinaryUpload(profile.avatar_url, `avatars/${profile.id}`);
      
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: uploadResult.secure_url })
        .eq('id', profile.id);

      if (updateError) throw updateError;
      console.log(`✅ Migrated avatar for user ${profile.id}`);
    } catch (err) {
      console.error(`❌ Failed to migrate avatar for user ${profile.id}:`, err.message);
    }
  }
}

async function migrateHostAvatars() {
  console.log("\n🔄 Starting migration: Host Avatars...");
  const { data: hosts, error } = await supabase
    .from('host_profiles')
    .select('id, owner_id, avatar_url')
    .like('avatar_url', '%supabase.co%')
    .not('avatar_url', 'is', null);

  if (error) {
    console.error("Error fetching host profiles:", error);
    return;
  }

  console.log(`Found ${hosts.length} host avatars to migrate.`);
  
  for (const host of hosts) {
    try {
      if (!host.avatar_url) continue;
      console.log(`Uploading avatar for host ${host.id}...`);
      const uploadResult = await unsignedCloudinaryUpload(host.avatar_url, `host-profiles/${host.owner_id}`);
      
      const { error: updateError } = await supabase
        .from('host_profiles')
        .update({ avatar_url: uploadResult.secure_url })
        .eq('id', host.id);

      if (updateError) throw updateError;
      console.log(`✅ Migrated avatar for host ${host.id}`);
    } catch (err) {
      console.error(`❌ Failed to migrate avatar for host ${host.id}:`, err.message);
    }
  }
}

async function runAll() {
  console.log("🚀 Starting Cloudinary batch migration...");
  await migratePartyFlyers();
  await migratePartyMedia();
  await migrateUserAvatars();
  await migrateHostAvatars();
  console.log("\n🎉 Cloudinary batch migration complete!");
}

runAll();

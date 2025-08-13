require('dotenv').config();
const Mux = require('@mux/mux-node');
const { createClient } = require('@sanity/client');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
// Using built-in fetch (Node 18+)

// Initialize clients
const sanityClient = createClient({
  projectId: process.env.SANITY_PROJECT_ID,
  dataset: process.env.SANITY_DATASET,
  token: process.env.SANITY_TOKEN,
  useCdn: false,
});

const { video: Video } = new Mux({
  tokenId: process.env.MUX_TOKEN_ID,
  tokenSecret: process.env.MUX_SECRET,
});

const VIDEOS_FOLDER = path.join(process.env.HOME, 'Desktop', 'compressed_videos');
const PROGRESS_FILE = 'migration-progress.json';

// Load or create progress tracking
function loadProgress() {
  try {
    return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
  } catch {
    return { completed: [], failed: [], inProgress: [] };
  }
}

function saveProgress(progress) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

// Get all video artworks from Sanity
async function getVideoArtworks() {
  const query = `*[_type == "artwork" && mediaType == "video" && defined(video)] {
    _id,
    title,
    slug,
    video {
      asset-> {
        _id,
        originalFilename,
        url
      }
    }
  }`;
  
  return await sanityClient.fetch(query);
}

// Upload file to Mux
async function uploadToMux(filePath, filename) {
  console.log(`Uploading ${filename} to Mux...`);
  
  try {
    // Create direct upload
    const upload = await Video.uploads.create({
      new_asset_settings: {
        playback_policy: ['public'],
        encoding_tier: 'baseline', // or 'smart' for premium
      },
    });

    console.log('Upload created with ID:', upload.id);

    // Read file as buffer for upload
    const fileBuffer = fs.readFileSync(filePath);

    const uploadResponse = await fetch(upload.url, {
      method: 'PUT',
      body: fileBuffer,
      headers: {
        'Content-Type': 'video/mp4',
      },
    });

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      throw new Error(`Upload failed: ${uploadResponse.status} ${errorText}`);
    }

    console.log('File uploaded successfully, waiting for processing...');

    // Wait for upload to complete and get the asset ID
    let uploadStatus = await Video.uploads.retrieve(upload.id);
    
    while (uploadStatus.status === 'waiting' || uploadStatus.status === 'asset_creating') {
      console.log(`Upload status: ${uploadStatus.status}`);
      await new Promise(resolve => setTimeout(resolve, 5000));
      uploadStatus = await Video.uploads.retrieve(upload.id);
    }

    if (uploadStatus.status !== 'asset_created') {
      throw new Error(`Upload failed with status: ${uploadStatus.status}`);
    }

    const assetId = uploadStatus.asset_id;
    console.log('Asset created with ID:', assetId);

    // Now wait for asset to be ready
    let asset = await Video.assets.retrieve(assetId);
    
    while (asset.status === 'preparing') {
      console.log(`Waiting for ${filename} to process...`);
      await new Promise(resolve => setTimeout(resolve, 5000));
      asset = await Video.assets.retrieve(assetId);
    }

    if (asset.status !== 'ready') {
      throw new Error(`Asset processing failed: ${asset.status}`);
    }

    return {
      assetId: asset.id,
      playbackId: asset.playback_ids?.[0]?.id,
      status: 'ready'
    };

  } catch (error) {
    console.error(`Failed to upload ${filename}:`, error.message);
    throw error;
  }
}

// Update Sanity document with Mux data
async function updateSanityDocument(documentId, muxData) {
  return await sanityClient
    .patch(documentId)
    .set({
      muxAssetId: muxData.assetId,
      muxPlaybackId: muxData.playbackId,
      muxStatus: muxData.status,
    })
    .commit();
}

// Find local file for artwork
function findLocalFile(artwork) {
  const originalFilename = artwork.video?.asset?.originalFilename;
  if (!originalFilename) return null;

  const filePath = path.join(VIDEOS_FOLDER, originalFilename);
  return fs.existsSync(filePath) ? filePath : null;
}

// Main migration function
async function migrateVideos() {
  console.log('Starting Mux migration...');
  
  const progress = loadProgress();
  const artworks = await getVideoArtworks();
  
  console.log(`Found ${artworks.length} video artworks`);
  
  for (const artwork of artworks) {
    // Skip if already processed
    if (progress.completed.includes(artwork._id)) {
      console.log(`Skipping ${artwork.title || artwork._id} - already completed`);
      continue;
    }
    
    if (progress.failed.includes(artwork._id)) {
      console.log(`Skipping ${artwork.title || artwork._id} - previously failed`);
      continue;
    }

    try {
      // Find local file
      const localFilePath = findLocalFile(artwork);
      if (!localFilePath) {
        console.log(`No local file found for: ${artwork.title || artwork._id}`);
        progress.failed.push(artwork._id);
        saveProgress(progress);
        continue;
      }

      console.log(`Processing: ${artwork.title || artwork._id}`);
      progress.inProgress.push(artwork._id);
      saveProgress(progress);

      // Upload to Mux
      const muxData = await uploadToMux(
        localFilePath, 
        artwork.video.asset.originalFilename
      );

      // Update Sanity
      await updateSanityDocument(artwork._id, muxData);

      // Mark as completed
      progress.completed.push(artwork._id);
      progress.inProgress = progress.inProgress.filter(id => id !== artwork._id);
      saveProgress(progress);

      console.log(`✅ Completed: ${artwork.title || artwork._id}`);
      console.log(`   Playback ID: ${muxData.playbackId}`);

      // Rate limiting - wait between uploads
      await new Promise(resolve => setTimeout(resolve, 2000));

    } catch (error) {
      console.error(`❌ Failed: ${artwork.title || artwork._id}`, error.message);
      progress.failed.push(artwork._id);
      progress.inProgress = progress.inProgress.filter(id => id !== artwork._id);
      saveProgress(progress);
    }
  }

  console.log('\nMigration Summary:');
  console.log(`✅ Completed: ${progress.completed.length}`);
  console.log(`❌ Failed: ${progress.failed.length}`);
  console.log(`📄 Progress saved to: ${PROGRESS_FILE}`);
}

// Run migration
if (require.main === module) {
  migrateVideos().catch(console.error);
}

module.exports = { migrateVideos };
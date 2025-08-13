require('dotenv').config()
const {createClient} = require('@sanity/client')
const fs = require('fs').promises
const path = require('path')
const https = require('https')
const { exec } = require('child_process')
const { promisify } = require('util')

const execAsync = promisify(exec)

const client = createClient({
  projectId: '5lwtjnp5',
  dataset: 'production',
  token: process.env.SANITY_TOKEN,
  apiVersion: '2023-03-01',
  useCdn: false
})

// Configuration
const TARGET_SIZE_MB = 10
const BACKUP_DIR = path.join(require('os').homedir(), 'Desktop', 'sanity_video_backups')
const TEMP_DIR = './temp_videos'
const MAPPING_FILE = path.join(require('os').homedir(), 'Desktop', 'video_mapping.json')

// Ensure directories exist
async function ensureDirectories() {
  await fs.mkdir(BACKUP_DIR, { recursive: true })
  await fs.mkdir(TEMP_DIR, { recursive: true })
}

// Download file from URL
function downloadFile(url, filepath) {
  return new Promise((resolve, reject) => {
    const file = require('fs').createWriteStream(filepath)
    https.get(url, (response) => {
      response.pipe(file)
      file.on('finish', () => {
        file.close()
        resolve(filepath)
      })
    }).on('error', (err) => {
      require('fs').unlink(filepath, () => {}) // Delete the file on error
      reject(err)
    })
  })
}

// Get video info using ffprobe
async function getVideoInfo(filepath) {
  try {
    const { stdout } = await execAsync(`ffprobe -v quiet -print_format json -show_format -show_streams "${filepath}"`)
    return JSON.parse(stdout)
  } catch (error) {
    console.error(`Error getting video info for ${filepath}:`, error.message)
    throw error
  }
}

// Compress video to target size
async function compressVideo(inputPath, outputPath, targetSizeMB = TARGET_SIZE_MB) {
  try {
    console.log(`    🎬 Compressing ${path.basename(inputPath)}...`)
    
    // Get video info to maintain aspect ratio
    const videoInfo = await getVideoInfo(inputPath)
    const videoStream = videoInfo.streams.find(s => s.codec_type === 'video')
    
    if (!videoStream) {
      throw new Error('No video stream found')
    }
    
    const duration = parseFloat(videoInfo.format.duration)
    const originalWidth = videoStream.width
    const originalHeight = videoStream.height
    
    // Calculate target bitrate (80% of target to leave room for audio)
    const targetSizeBytes = targetSizeMB * 1024 * 1024
    const videoBitrate = Math.floor((targetSizeBytes * 0.8 * 8) / duration / 1000) // kbps
    
    // Determine output resolution while maintaining aspect ratio
    let outputWidth = originalWidth
    let outputHeight = originalHeight
    
    // Scale down if too large (max 1280 width for 10MB target)
    if (originalWidth > 1280) {
      outputWidth = 1280
      outputHeight = Math.round((originalHeight * 1280) / originalWidth)
    }
    
    // Ensure even dimensions (required for some codecs)
    if (outputWidth % 2 !== 0) outputWidth -= 1
    if (outputHeight % 2 !== 0) outputHeight -= 1
    
    console.log(`    📐 Original: ${originalWidth}x${originalHeight}, Output: ${outputWidth}x${outputHeight}`)
    console.log(`    📊 Target bitrate: ${videoBitrate}kbps`)
    
    // FFmpeg command for compression
    const ffmpegCmd = [
      'ffmpeg',
      '-i', `"${inputPath}"`,
      '-vcodec libx264',
      '-acodec aac',
      `-vf scale=${outputWidth}:${outputHeight}`,
      `-b:v ${videoBitrate}k`,
      '-b:a 128k',
      '-preset medium',
      '-crf 23',
      '-movflags +faststart', // Optimize for web streaming
      '-y', // Overwrite output file
      `"${outputPath}"`
    ].join(' ')
    
    await execAsync(ffmpegCmd)
    
    // Check output file size
    const stats = await fs.stat(outputPath)
    const outputSizeMB = stats.size / (1024 * 1024)
    
    console.log(`    ✅ Compressed to ${outputSizeMB.toFixed(1)}MB`)
    
    return outputPath
    
  } catch (error) {
    console.error(`Error compressing video:`, error.message)
    throw error
  }
}

// Load or create mapping file
async function loadMapping() {
  try {
    const data = await fs.readFile(MAPPING_FILE, 'utf8')
    return JSON.parse(data)
  } catch (error) {
    return { videos: [], processedAt: null }
  }
}

// Save mapping file
async function saveMapping(mapping) {
  await fs.writeFile(MAPPING_FILE, JSON.stringify(mapping, null, 2))
}

// Main compression function
async function compressAllVideos() {
  try {
    console.log('🎬 Starting video compression migration...\n')
    
    await ensureDirectories()
    
    // Get all video assets from Sanity
    console.log('📋 Fetching video assets from Sanity...')
    const videoAssets = await client.fetch(`
      *[_type == "sanity.fileAsset" && mimeType match "video/*"] {
        _id,
        url,
        originalFilename,
        size,
        mimeType
      }
    `)
    
    console.log(`Found ${videoAssets.length} video assets\n`)
    
    if (videoAssets.length === 0) {
      console.log('No videos found!')
      return
    }
    
    const mapping = await loadMapping()
    let processedCount = 0
    
    for (const [index, video] of videoAssets.entries()) {
      console.log(`[${index + 1}/${videoAssets.length}] Processing: ${video.originalFilename}`)
      console.log(`    📊 Original size: ${(video.size / (1024 * 1024)).toFixed(1)}MB`)
      
      // Skip large files for now - be more aggressive
      if (video.size > 50 * 1024 * 1024) { // Skip files over 50MB
        console.log(`    ⚠️  Skipping file over 50MB - process manually later`)
        console.log(`    💡 Focus on smaller files first\n`)
        continue
      }
      
      try {
        // Generate file paths
        const originalExt = path.extname(video.originalFilename || '.mov')
        const baseName = video._id.replace('file-', '').replace(/-[a-zA-Z0-9]+$/, '')
        const originalPath = path.join(BACKUP_DIR, `${baseName}_original${originalExt}`)
        const compressedPath = path.join(TEMP_DIR, `${baseName}_compressed.mp4`)
        
        // Download original file with timeout
        console.log(`    ⬇️  Downloading original...`)
        const downloadTimeout = setTimeout(() => {
          throw new Error('Download timeout - file too large or connection too slow')
        }, 60000) // 1 minute timeout
        
        await downloadFile(video.url, originalPath)
        clearTimeout(downloadTimeout)
        
        // Compress video
        await compressVideo(originalPath, compressedPath)
        
        // Create file stream for upload
        const compressedFile = require('fs').createReadStream(compressedPath)
        
        // Upload compressed version to replace original
        console.log(`    ⬆️  Uploading compressed version...`)
        const newAsset = await client.assets.upload('file', compressedFile, {
          filename: video.originalFilename,
          replace: video._id
        })
        
        console.log(`    ✅ Successfully replaced asset!`)
        
        // Add to mapping for potential rollback
        mapping.videos.push({
          assetId: video._id,
          originalFilename: video.originalFilename,
          originalSize: video.size,
          originalPath: originalPath,
          newAssetId: newAsset._id,
          processedAt: new Date().toISOString()
        })
        
        // Clean up temp file
        await fs.unlink(compressedPath)
        
        processedCount++
        
      } catch (error) {
        console.error(`    ❌ Error processing ${video.originalFilename}:`, error.message)
        console.log(`    ⚠️  Skipping this video and continuing...\n`)
        continue
      }
      
      console.log('') // Empty line for readability
    }
    
    // Save mapping
    mapping.processedAt = new Date().toISOString()
    await saveMapping(mapping)
    
    console.log('🎉 Compression complete!')
    console.log(`📊 Processed: ${processedCount}/${videoAssets.length} videos`)
    console.log(`💾 Mapping saved to: ${MAPPING_FILE}`)
    console.log(`📁 Originals backed up to: ${BACKUP_DIR}`)
    
    // Clean up temp directory
    await fs.rmdir(TEMP_DIR, { recursive: true })
    
  } catch (error) {
    console.error('Migration failed:', error.message)
  }
}

// Rollback function
async function rollbackVideos() {
  try {
    console.log('🔄 Starting video rollback...\n')
    
    const mapping = await loadMapping()
    
    if (!mapping.videos || mapping.videos.length === 0) {
      console.log('No mapping found. Nothing to rollback.')
      return
    }
    
    console.log(`Found ${mapping.videos.length} videos to rollback\n`)
    
    for (const [index, videoMapping] of mapping.videos.entries()) {
      console.log(`[${index + 1}/${mapping.videos.length}] Rolling back: ${videoMapping.originalFilename}`)
      
      try {
        // Check if original backup exists
        const originalPath = videoMapping.originalPath
        await fs.access(originalPath)
        
        // Create file stream for upload
        const originalFile = require('fs').createReadStream(originalPath)
        
        // Upload original back to Sanity
        console.log(`    ⬆️  Restoring original...`)
        await client.assets.upload('file', originalFile, {
          filename: videoMapping.originalFilename,
          replace: videoMapping.assetId
        })
        
        console.log(`    ✅ Successfully restored!`)
        
      } catch (error) {
        console.error(`    ❌ Error rolling back ${videoMapping.originalFilename}:`, error.message)
      }
      
      console.log('')
    }
    
    console.log('🎉 Rollback complete!')
    console.log('💡 Original mapping file preserved for reference')
    
  } catch (error) {
    console.error('Rollback failed:', error.message)
  }
}

// Command line interface
const command = process.argv[2]

if (command === 'compress') {
  compressAllVideos()
} else if (command === 'rollback') {
  rollbackVideos()
} else {
  console.log('Video Compression Migration Script')
  console.log('==================================')
  console.log('')
  console.log('Usage:')
  console.log('  node video-migration.js compress  - Compress all videos to 10MB')
  console.log('  node video-migration.js rollback  - Restore original videos')
  console.log('')
  console.log('Requirements:')
  console.log('  - FFmpeg installed and in PATH')
  console.log('  - SANITY_TOKEN in .env file')
  console.log('')
  console.log('What it does:')
  console.log('  • Downloads all video assets from Sanity')
  console.log('  • Backs up originals to ./video_backups/')
  console.log('  • Compresses videos to ~10MB while maintaining aspect ratio')
  console.log('  • Replaces original files in Sanity (same URLs/IDs)')
  console.log('  • Creates mapping file for rollback capability')
}
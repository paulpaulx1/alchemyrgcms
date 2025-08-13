require('dotenv').config()
const {createClient} = require('@sanity/client')
const fs = require('fs').promises
const path = require('path')
const https = require('https')
const {exec} = require('child_process')
const {promisify} = require('util')

const execAsync = promisify(exec)

const client = createClient({
  projectId: '5lwtjnp5',
  dataset: 'production',
  token: process.env.SANITY_TOKEN,
  apiVersion: '2023-03-01',
  useCdn: false,
})

// Save compressed videos to Desktop
const OUTPUT_DIR = path.join(require('os').homedir(), 'Desktop', 'compressed_videos')

// Download file
function downloadFile(url, filepath) {
  return new Promise((resolve, reject) => {
    const file = require('fs').createWriteStream(filepath)
    https
      .get(url, (response) => {
        response.pipe(file)
        file.on('finish', () => {
          file.close()
          resolve()
        })
      })
      .on('error', reject)
  })
}

// Compress video to small size
async function compressVideo(inputPath, outputPath) {
  const ffmpegCmd = `ffmpeg -i "${inputPath}" \
    -vcodec libx264 -preset slow -crf 22 -vf "scale='min(1280,iw)':-2" \
    -acodec aac -b:a 128k -movflags +faststart -y "${outputPath}"`
  await execAsync(ffmpegCmd)
}

// Main function
async function compressAllVideos() {
  try {
    console.log('🎬 Downloading and compressing videos...\n')

    // Create output directory
    await fs.mkdir(OUTPUT_DIR, {recursive: true})

    // Get videos from Sanity
    const videos = await client.fetch(`
      *[_type == "sanity.fileAsset" && mimeType match "video/*"] {
        url,
        originalFilename,
        size
      }
    `)

    console.log(`Found ${videos.length} videos\n`)

    for (const [i, video] of videos.entries()) {
      console.log(`[${i + 1}/${videos.length}] ${video.originalFilename}`)
      console.log(`  Original: ${(video.size / (1024 * 1024)).toFixed(1)}MB`)

      const tempPath = path.join(OUTPUT_DIR, `temp_${video.originalFilename}`)
      const outputPath = path.join(
        OUTPUT_DIR,
        `compressed_${video.originalFilename.replace(/\.[^.]+$/, '.mp4')}`,
      )

      try {
        // Download
        console.log(`  Downloading...`)
        await downloadFile(video.url, tempPath)

        // Compress
        console.log(`  Compressing...`)
        await compressVideo(tempPath, outputPath)

        // Check result
        const stats = await fs.stat(outputPath)
        console.log(`  ✅ Compressed to ${(stats.size / (1024 * 1024)).toFixed(1)}MB`)

        // Delete temp file
        await fs.unlink(tempPath)
      } catch (error) {
        console.log(`  ❌ Error: ${error.message}`)
      }

      console.log('')
    }

    console.log(`🎉 Done! Check: ${OUTPUT_DIR}`)
  } catch (error) {
    console.error('Script failed:', error.message)
  }
}

// Just run it
compressAllVideos()

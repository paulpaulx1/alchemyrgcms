require('dotenv').config()
const {createClient} = require('@sanity/client')

const client = createClient({
  projectId: '5lwtjnp5',
  dataset: 'production',
  token: process.env.SANITY_TOKEN,
  apiVersion: '2023-03-01',
  useCdn: false
})

async function listAllVideos() {
  try {
    console.log('🎬 Fetching all video assets from Sanity...\n')
    
    // Get all video file assets
    const videoAssets = await client.fetch(`
      *[_type == "sanity.fileAsset" && mimeType match "video/*"] {
        _id,
        originalFilename,
        size,
        mimeType,
        url
      } | order(size desc)
    `)
    
    if (videoAssets.length === 0) {
      console.log('No videos found!')
      return
    }
    
    console.log(`Found ${videoAssets.length} video files:\n`)
    console.log('📋 Videos (sorted by size, largest first):')
    console.log('='.repeat(60))
    
    videoAssets.forEach((video, index) => {
      const sizeMB = (video.size / (1024 * 1024)).toFixed(1)
      const filename = video.originalFilename || 'No filename'
      
      console.log(`${(index + 1).toString().padStart(2)}. ${filename}`)
      console.log(`    💾 Size: ${sizeMB}MB`)
      console.log(`    🆔 ID: ${video._id}`)
      console.log('')
    })
    
    // Also show which artworks use videos
    console.log('\n🎨 Artworks that use these videos:')
    console.log('=' .repeat(60))
    
    const artworksWithVideos = await client.fetch(`
      *[_type == "artwork" && mediaType == "video"] {
        title,
        "portfolioTitle": portfolio->title,
        "videoFilename": video.asset->originalFilename,
        "videoSize": video.asset->size,
        slug
      } | order(videoSize desc)
    `)
    
    if (artworksWithVideos.length === 0) {
      console.log('No artworks found that use video mediaType')
    } else {
      artworksWithVideos.forEach((artwork, index) => {
        const sizeMB = artwork.videoSize ? (artwork.videoSize / (1024 * 1024)).toFixed(1) : 'Unknown'
        const title = artwork.title || 'Untitled'
        const portfolio = artwork.portfolioTitle || 'No portfolio'
        
        console.log(`${(index + 1).toString().padStart(2)}. "${title}"`)
        console.log(`    📁 Portfolio: ${portfolio}`)
        console.log(`    🎬 Video: ${artwork.videoFilename || 'No filename'}`)
        console.log(`    💾 Size: ${sizeMB}MB`)
        console.log('')
      })
    }
    
    // Summary
    const totalSizeMB = videoAssets.reduce((sum, video) => sum + (video.size / (1024 * 1024)), 0)
    console.log('\n📊 Summary:')
    console.log('=' .repeat(30))
    console.log(`Total videos: ${videoAssets.length}`)
    console.log(`Total size: ${totalSizeMB.toFixed(1)}MB`)
    console.log(`Average size: ${(totalSizeMB / videoAssets.length).toFixed(1)}MB`)
    
    const largeVideos = videoAssets.filter(v => v.size > 100 * 1024 * 1024)
    console.log(`Videos over 100MB: ${largeVideos.length}`)
    
  } catch (error) {
    console.error('Error fetching videos:', error.message)
  }
}

listAllVideos()
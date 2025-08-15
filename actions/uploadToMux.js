// sanity-cms/actions/uploadToMux.js

import { PlayIcon } from '@sanity/icons'

// Upload function
async function uploadVideoToMux(videoUrl, filename) {
  console.log(`Uploading ${filename} to Mux...`)
  
  // Import Mux (needs to be dynamic in browser environment)
  const { default: Mux } = await import('@mux/mux-node')
  
  const { video: Video } = new Mux({
    tokenId: process.env.SANITY_STUDIO_MUX_TOKEN_ID,
    tokenSecret: process.env.SANITY_STUDIO_MUX_SECRET,
  })

  try {
    // Create direct upload
    const upload = await Video.uploads.create({
      new_asset_settings: {
        playback_policy: ['public'],
        encoding_tier: 'baseline',
      },
    })

    // Download video from Sanity
    const response = await fetch(videoUrl)
    if (!response.ok) {
      throw new Error(`Failed to download video: ${response.statusText}`)
    }

    const videoBuffer = await response.arrayBuffer()

    // Upload to Mux
    const uploadResponse = await fetch(upload.url, {
      method: 'PUT',
      body: videoBuffer,
      headers: {
        'Content-Type': 'video/mp4',
      },
    })

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text()
      throw new Error(`Mux upload failed: ${uploadResponse.status} ${errorText}`)
    }

    console.log('File uploaded successfully, waiting for processing...')

    // Wait for upload to complete
    let uploadStatus = await Video.uploads.retrieve(upload.id)
    
    // Poll until asset is created (with timeout)
    let attempts = 0
    const maxAttempts = 60 // 5 minutes
    
    while (uploadStatus.status === 'waiting' || uploadStatus.status === 'asset_creating') {
      if (attempts >= maxAttempts) {
        throw new Error('Upload timeout - asset creation took too long')
      }
      
      console.log(`Upload status: ${uploadStatus.status}, attempt ${attempts + 1}`)
      await new Promise(resolve => setTimeout(resolve, 5000))
      uploadStatus = await Video.uploads.retrieve(upload.id)
      attempts++
    }

    if (uploadStatus.status !== 'asset_created') {
      throw new Error(`Upload failed with status: ${uploadStatus.status}`)
    }

    const assetId = uploadStatus.asset_id
    console.log('Asset created with ID:', assetId)

    // Get asset details for playback ID
    const asset = await Video.assets.retrieve(assetId)
    const playbackId = asset.playback_ids?.[0]?.id

    if (!playbackId) {
      throw new Error('No playback ID found for asset')
    }

    return {
      assetId,
      playbackId,
      status: 'ready'
    }

  } catch (error) {
    console.error(`Failed to upload ${filename}:`, error.message)
    throw error
  }
}

export function UploadToMuxAction(props) {
  const { id, type, draft, published } = props
  
  // Only show for video artworks
  if (type !== 'artwork') return null
  
  const doc = draft || published
  if (!doc || doc.mediaType !== 'video') return null

  // Don't show if already uploaded to Mux
  if (doc.muxPlaybackId) {
    return {
      label: 'Already uploaded to Mux',
      icon: PlayIcon,
      disabled: true,
    }
  }

  // Don't show if no video file
  if (!doc.video?.asset?._ref) {
    return {
      label: 'No video file to upload',
      icon: PlayIcon,
      disabled: true,
    }
  }

  return {
    label: 'Upload to Mux',
    icon: PlayIcon,
    onHandle: async () => {
      const client = props.getClient({ apiVersion: '2023-03-01' })

      try {
        // Get video asset details
        const videoRef = doc.video.asset._ref
        const videoAsset = await client.getDocument(videoRef)
        
        if (!videoAsset?.url) {
          throw new Error('Video asset has no URL')
        }

        // Show confirmation
        const confirmed = window.confirm(
          `Upload "${videoAsset.originalFilename}" to Mux?\n\nThis may take several minutes for large videos.`
        )
        if (!confirmed) return

        // Upload to Mux (this will take a while)
        alert('Starting Mux upload... This will take a few minutes. Check the browser console for progress.')
        
        const muxData = await uploadVideoToMux(videoAsset.url, videoAsset.originalFilename)

        // Update document with Mux data
        await client
          .patch(id)
          .set({
            muxAssetId: muxData.assetId,
            muxPlaybackId: muxData.playbackId,
            muxStatus: 'ready',
          })
          .commit()

        alert(`Successfully uploaded to Mux!\nPlayback ID: ${muxData.playbackId}`)

      } catch (error) {
        console.error('Mux upload error:', error)
        alert(`Failed to upload to Mux: ${error.message}`)
      }
    },
  }
}
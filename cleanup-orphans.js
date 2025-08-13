require('dotenv').config()
const {createClient} = require('@sanity/client')

const client = createClient({
  projectId: '5lwtjnp5',
  dataset: 'production',
  token: process.env.SANITY_TOKEN,
  apiVersion: '2023-03-01',
  useCdn: false
})

async function deleteOrphanedVideos() {
  try {
    console.log('🗑️  Deleting orphaned compressed video files...\n')
    
    // Hardcoded list of orphaned compressed video asset IDs from your log
    const orphanedAssetIds = [
      'file-1b5d60b2a5764cd873ed21d498efee91433b35be-mov', // The Illusion of Choice.MOV (29.6MB)
      'file-7281719f50e9bf52332ce245771739fc1c88b0d6-mov', // IMG_9931.MOV (20.5MB)
      'file-68aba2e36368143c69ecf15f07e6a316db6704bd-mov', // IMG_9848 (1).MOV (15.5MB)
      'file-f3099a2bd088ead14549a982f536d6f17fed66af-mov'  // IMG_9846.MOV (8.1MB)
    ]
    
    console.log(`Found ${orphanedAssetIds.length} orphaned compressed videos to delete:\n`)
    
    let deletedCount = 0
    let errorCount = 0
    
    for (const assetId of orphanedAssetIds) {
      try {
        console.log(`Deleting asset: ${assetId}`)
        
        await client.delete(assetId)
        
        console.log(`✅ Deleted successfully`)
        deletedCount++
        
      } catch (error) {
        console.log(`❌ Error deleting ${assetId}: ${error.message}`)
        errorCount++
      }
      
      console.log('') // Empty line
    }
    
    console.log('🎉 Cleanup Summary:')
    console.log('=' .repeat(30))
    console.log(`✅ Successfully deleted: ${deletedCount} files`)
    console.log(`❌ Errors: ${errorCount} files`)
    
    if (deletedCount > 0) {
      console.log('\n🧹 Orphaned compressed videos cleaned up!')
      console.log('💡 Your video count should go back to 15.')
    }
    
  } catch (error) {
    console.error('Script error:', error.message)
  }
}

deleteOrphanedVideos()
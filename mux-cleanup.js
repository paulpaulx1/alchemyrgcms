require('dotenv').config();
const Mux = require('@mux/mux-node');

const { video: Video } = new Mux({
  tokenId: process.env.MUX_TOKEN_ID,
  tokenSecret: process.env.MUX_SECRET,
});

async function deleteAllAssets() {
  console.log('Fetching all Mux assets...');
  
  try {
    // Get all assets
    const assets = await Video.assets.list();
    
    if (assets.data.length === 0) {
      console.log('No assets found to delete.');
      return;
    }
    
    console.log(`Found ${assets.data.length} assets to delete:`);
    
    for (const asset of assets.data) {
      console.log(`- ${asset.id} (status: ${asset.status})`);
    }
    
    console.log('\nStarting deletion...');
    
    // Delete each asset
    for (const asset of assets.data) {
      try {
        await Video.assets.delete(asset.id);
        console.log(`✅ Deleted: ${asset.id}`);
        
        // Small delay to be nice to the API
        await new Promise(resolve => setTimeout(resolve, 500));
        
      } catch (error) {
        console.error(`❌ Failed to delete ${asset.id}:`, error.message);
      }
    }
    
    console.log('\n🎉 Cleanup complete! Ready for fresh migration.');
    
  } catch (error) {
    console.error('Error fetching assets:', error.message);
  }
}

// Confirmation prompt (safety check)
console.log('⚠️  WARNING: This will delete ALL assets in your Mux account!');
console.log('Press Ctrl+C to cancel, or any key to continue...');

process.stdin.setRawMode(true);
process.stdin.resume();
process.stdin.on('data', () => {
  process.stdin.setRawMode(false);
  deleteAllAssets().catch(console.error);
});
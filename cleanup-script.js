// cleanup-script.js
const { createClient } = require('@sanity/client');
require('dotenv').config();

async function cleanup() {
  const client = createClient({
    projectId: process.env.SANITY_PROJECT_ID || '5lwtjnp5',
    dataset: process.env.SANITY_DATASET || 'production',
    token: process.env.SANITY_TOKEN,
    useCdn: false,
    apiVersion: '2021-10-21'
  });

  console.log('Cleaning up existing data...');
  
  // Delete all artwork documents
  const artworkQuery = '*[_type == "artwork"]';
  const artworks = await client.fetch(artworkQuery);
  console.log(`Found ${artworks.length} artwork documents to delete`);
  
  for (const artwork of artworks) {
    await client.delete(artwork._id);
  }
  
  // Delete all image assets
  const assetQuery = '*[_type == "sanity.imageAsset"]';
  const assets = await client.fetch(assetQuery);
  console.log(`Found ${assets.length} image assets to delete`);
  
  for (const asset of assets) {
    await client.delete(asset._id);
  }
  
  console.log('Cleanup complete!');
}

cleanup().catch(console.error);
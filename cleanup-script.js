require('dotenv').config()
const {createClient} = require('@sanity/client')

const client = createClient({
  projectId: '5lwtjnp5',
  dataset: 'production',
  token: process.env.SANITY_TOKEN,
  apiVersion: '2023-03-01',
  useCdn: false
})

async function deleteCorrupted() {
  try {
    console.log('🗑️  Deleting corrupted duplicates...\n')
    
    // List of corrupted documents to delete (the ones with double "drafts.drafts.")
    const corruptedIds = [
      'drafts.drafts.1GE9GV3p9A7fiYY64znfWE',
      'drafts.drafts.1GE9GV3p9A7fiYY64znhMj'
    ]
    
    for (const id of corruptedIds) {
      console.log(`Attempting to delete: ${id}`)
      
      try {
        // Check if it exists first
        const doc = await client.getDocument(id)
        console.log(`  Found document: ${doc._type} - ${doc.title || 'no title'}`)
        
        // Try multiple deletion methods
        let deleted = false
        
        // Method 1: Direct delete with force
        try {
          await client.delete(id)
          console.log(`  ✅ Method 1: Direct delete successful!`)
          deleted = true
        } catch (error1) {
          console.log(`  ❌ Method 1 failed: ${error1.message}`)
          
          // Method 2: Transaction delete
          try {
            const transaction = client.transaction()
            transaction.delete(id)
            await transaction.commit()
            console.log(`  ✅ Method 2: Transaction delete successful!`)
            deleted = true
          } catch (error2) {
            console.log(`  ❌ Method 2 failed: ${error2.message}`)
            
            // Method 3: Patch to break reference, then delete
            try {
              // Remove the portfolio reference first
              await client.patch(id).unset(['portfolio']).commit()
              console.log(`  ⚠️  Removed portfolio reference`)
              
              // Now try to delete
              await client.delete(id)
              console.log(`  ✅ Method 3: Delete after removing reference successful!`)
              deleted = true
            } catch (error3) {
              console.log(`  ❌ Method 3 failed: ${error3.message}`)
              console.log(`  ⚠️  Could not delete ${id} - may need manual intervention`)
            }
          }
        }
        
        if (deleted) {
          // Verify deletion
          try {
            await client.getDocument(id)
            console.log(`  ❌ Warning: Document still exists after deletion`)
          } catch (error) {
            console.log(`  ✅ Confirmed: Document successfully deleted`)
          }
        }
        
      } catch (error) {
        console.log(`  ℹ️  Document ${id} not found (already deleted or doesn't exist)`)
      }
      
      console.log('') // Empty line for readability
    }
    
    console.log('🎉 Cleanup complete!')
    console.log('\nNow try unpublishing your "Fear Backup" portfolio again.')
    console.log('The corrupted references should be gone.')
    
  } catch (error) {
    console.error('Unexpected error:', error.message)
  }
}

deleteCorrupted()
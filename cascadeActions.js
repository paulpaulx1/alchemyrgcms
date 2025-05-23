// sanity-cms/cascadeActions.js
import { TrashIcon, EyeClosedIcon } from '@sanity/icons'
import { useDocumentOperation } from 'sanity'

// Helper function to check if portfolio has children
async function hasChildren(client, portfolioId) {
  const result = await client.fetch(`
    {
      "hasChildPortfolios": count(*[_type == "portfolio" && (
        references($portfolioId) || 
        $portfolioId in subPortfolios[]._ref
      )]) > 0,
      "hasArtworks": count(*[_type == "artwork" && portfolio._ref == $portfolioId]) > 0
    }
  `, { portfolioId })
  
  return result.hasChildPortfolios || result.hasArtworks
}

// Recursive function to collect all child portfolios
async function collectAllChildren(client, portfolioId) {
  const children = await client.fetch(`
    {
      "portfolios": *[_type == "portfolio" && (
        references($portfolioId) || 
        $portfolioId in subPortfolios[]._ref
      )] {
        _id,
        title
      },
      "artworks": *[_type == "artwork" && portfolio._ref == $portfolioId] {
        _id,
        title
      }
    }
  `, { portfolioId })
  
  let allPortfolios = [portfolioId]
  let allArtworks = [...children.artworks]
  
  // Recursively collect children
  for (const child of children.portfolios) {
    const childData = await collectAllChildren(client, child._id)
    allPortfolios = [...allPortfolios, ...childData.portfolios]
    allArtworks = [...allArtworks, ...childData.artworks]
  }
  
  return {
    portfolios: [...new Set(allPortfolios)], // Remove duplicates
    artworks: allArtworks
  }
}

// Helper function to clean "unpublished" from titles
function cleanTitle(title) {
  return title.replace(/\s*unpublished\s*$/i, '').trim()
}

// FIXED Unpublish Action - separate operations
export function SmartUnpublishAction(props) {
  const { id, type, onComplete } = props
  
  return {
    label: 'Unpublish',
    icon: EyeClosedIcon,
    tone: 'caution',
    onHandle: async () => {
      const client = props.getClient({ apiVersion: '2023-03-01' })
      
      try {
        const portfolioHasChildren = await hasChildren(client, id)
        
        if (!portfolioHasChildren) {
          // No children - simple unpublish with separate operations
          const currentDoc = await client.fetch(`*[_id == $id][0]{ title }`, { id })
          const newTitle = currentDoc.title.includes('unpublished') 
            ? currentDoc.title 
            : `${currentDoc.title} unpublished`
          
          // Step 1: Unpublish by unsetting _publishedAt
          await client.mutate([{
            patch: {
              id: id,
              unset: ['_publishedAt']
            }
          }])
          
          // Step 2: Update title in separate operation
          await client.mutate([{
            patch: {
              id: id,
              set: { title: newTitle }
            }
          }])
          
          console.log('✅ Successfully unpublished:', id)
          onComplete()
          return
        }
        
        // Has children - show cascade confirmation
        const allChildren = await collectAllChildren(client, id)
        
        const confirmMessage = `📝 CASCADE UNPUBLISH

This will unpublish this portfolio and all its children, and append "unpublished" to their titles.

Continue?`
        
        const confirmed = window.confirm(confirmMessage)
        if (!confirmed) return
        
        // Get all items
        const allItems = await client.fetch(`
          {
            "portfolios": *[_type == "portfolio" && _id in $portfolioIds] {
              _id,
              title,
              "isPublished": defined(_publishedAt)
            },
            "artworks": *[_type == "artwork" && _id in $artworkIds] {
              _id,
              title,
              "isPublished": defined(_publishedAt)
            }
          }
        `, { 
          portfolioIds: allChildren.portfolios,
          artworkIds: allChildren.artworks.map(a => a._id)
        })
        
        console.log(`🚀 Starting cascade unpublish of ${allItems.portfolios.length + allItems.artworks.length} items...`)
        
        let processedCount = 0
        const totalItems = allItems.portfolios.length + allItems.artworks.length
        
        // Process portfolios
        for (const portfolio of allItems.portfolios) {
          processedCount++
          
          // Step 1: Unpublish if published
          if (portfolio.isPublished) {
            try {
              await client.mutate([{
                patch: {
                  id: portfolio._id,
                  unset: ['_publishedAt']
                }
              }])
              console.log(`[${processedCount}/${totalItems}] 📝 Unpublished: ${portfolio.title}`)
            } catch (error) {
              console.log(`[${processedCount}/${totalItems}] ❌ Failed to unpublish: ${portfolio.title} - ${error.message}`)
            }
          } else {
            console.log(`[${processedCount}/${totalItems}] 📝 Already unpublished: ${portfolio.title}`)
          }
          
          // Step 2: Update title
          const newTitle = portfolio.title.includes('unpublished') 
            ? portfolio.title 
            : `${portfolio.title} unpublished`
          
          if (newTitle !== portfolio.title) {
            try {
              await client.mutate([{
                patch: {
                  id: portfolio._id,
                  set: { title: newTitle }
                }
              }])
              console.log(`[${processedCount}/${totalItems}] ✏️ Updated title: ${portfolio.title}`)
            } catch (error) {
              console.log(`[${processedCount}/${totalItems}] ❌ Failed to update title: ${portfolio.title}`)
            }
          }
        }
        
        // Process artworks
        for (const artwork of allItems.artworks) {
          processedCount++
          
          // Step 1: Unpublish if published
          if (artwork.isPublished) {
            try {
              await client.mutate([{
                patch: {
                  id: artwork._id,
                  unset: ['_publishedAt']
                }
              }])
              console.log(`[${processedCount}/${totalItems}] 🎨 Unpublished: ${artwork.title}`)
            } catch (error) {
              console.log(`[${processedCount}/${totalItems}] ❌ Failed to unpublish: ${artwork.title} - ${error.message}`)
            }
          } else {
            console.log(`[${processedCount}/${totalItems}] 🎨 Already unpublished: ${artwork.title}`)
          }
          
          // Step 2: Update title
          const newTitle = artwork.title.includes('unpublished') 
            ? artwork.title 
            : `${artwork.title} unpublished`
          
          if (newTitle !== artwork.title) {
            try {
              await client.mutate([{
                patch: {
                  id: artwork._id,
                  set: { title: newTitle }
                }
              }])
              console.log(`[${processedCount}/${totalItems}] ✏️ Updated title: ${artwork.title}`)
            } catch (error) {
              console.log(`[${processedCount}/${totalItems}] ❌ Failed to update title: ${artwork.title}`)
            }
          }
        }
        
        console.log(`✅ Cascade unpublish completed! Processed ${processedCount} items.`)
        alert(`✅ Cascade unpublish completed!\n\nProcessed ${processedCount} items.\n\nCheck the console for detailed results.`)
        onComplete()
        
      } catch (error) {
        console.error('❌ Unpublish failed:', error)
        alert(`Unpublish failed: ${error.message}`)
      }
    }
  }
}

// Simple Publish Action
export function SmartPublishAction(props) {
  const { id, type, onComplete } = props
  
  return {
    label: 'Publish All',
    icon: 'publish',
    tone: 'positive',
    onHandle: async () => {
      const client = props.getClient({ apiVersion: '2023-03-01' })
      
      try {
        const portfolioHasChildren = await hasChildren(client, id)
        
        if (!portfolioHasChildren) {
          // No children - clean title and let user manually publish
          const currentDoc = await client.fetch(`*[_id == $id][0]{ title }`, { id })
          const cleanedTitle = cleanTitle(currentDoc.title)
          
          await client.mutate([{
            patch: {
              id: id,
              set: { title: cleanedTitle }
            }
          }])
          
          alert('Title cleaned - please manually publish using the standard Publish button.')
          onComplete()
          return
        }
        
        // Has children
        const allChildren = await collectAllChildren(client, id)
        
        const confirmMessage = `📢 SIMPLE CASCADE PUBLISH

This will clean "unpublished" from titles of:
• 1 portfolio
• ${allChildren.artworks.length} artworks

You'll need to manually publish them using Sanity's standard publish buttons.

Continue to clean titles?`
        
        const confirmed = window.confirm(confirmMessage)
        if (!confirmed) return
        
        // Get all items
        const allItems = await client.fetch(`
          {
            "portfolios": *[_type == "portfolio" && _id in $portfolioIds] {
              _id,
              title
            },
            "artworks": *[_type == "artwork" && _id in $artworkIds] {
              _id,
              title
            }
          }
        `, { 
          portfolioIds: allChildren.portfolios,
          artworkIds: allChildren.artworks.map(a => a._id)
        })
        
        // Simple title cleaning only
        const mutations = []
        
        allItems.portfolios.forEach(portfolio => {
          const cleanedTitle = cleanTitle(portfolio.title)
          if (cleanedTitle !== portfolio.title) {
            mutations.push({
              patch: {
                id: portfolio._id,
                set: { title: cleanedTitle }
              }
            })
          }
        })
        
        allItems.artworks.forEach(artwork => {
          const cleanedTitle = cleanTitle(artwork.title)
          if (cleanedTitle !== artwork.title) {
            mutations.push({
              patch: {
                id: artwork._id,
                set: { title: cleanedTitle }
              }
            })
          }
        })
        
        if (mutations.length > 0) {
          await client.mutate(mutations)
          alert(`✅ Cleaned titles for ${mutations.length} items.\n\n🔧 Now manually publish them using Sanity's standard Publish buttons.\n\n💡 Search for items without "unpublished" to find them.`)
        } else {
          alert('No titles needed cleaning!')
        }
        
        onComplete()
        
      } catch (error) {
        console.error('❌ Title cleaning failed:', error)
        alert(`Title cleaning failed: ${error.message}`)
      }
    }
  }
}

// Simple Delete Action
export function SmartDeleteAction(props) {
  const { id, type, onComplete } = props
  
  return {
    label: 'Delete All',
    icon: TrashIcon,
    tone: 'critical',
    onHandle: async () => {
      const client = props.getClient({ apiVersion: '2023-03-01' })
      
      try {
        const portfolioHasChildren = await hasChildren(client, id)
        
        if (!portfolioHasChildren) {
          // No children - normal delete
          const confirmed = window.confirm('Delete this portfolio permanently?')
          if (confirmed) {
            await client.mutate([{
              delete: { id: id }
            }])
            onComplete()
          }
          return
        }
        
        // Has children
        const allChildren = await collectAllChildren(client, id)
        
        const confirmMessage = `⚠️ CASCADE DELETE WARNING ⚠️

This will permanently delete:
• 1 portfolio
• ${allChildren.artworks.length} artworks

This CANNOT be undone!

Continue?`
        
        const confirmed = window.confirm(confirmMessage)
        if (!confirmed) return
        
        // Simple deletion
        const mutations = []
        
        // Delete artworks first
        allChildren.artworks.forEach(artwork => {
          mutations.push({ delete: { id: artwork._id } })
        })
        
        // Delete portfolios last
        allChildren.portfolios.reverse().forEach(portfolioId => {
          mutations.push({ delete: { id: portfolioId } })
        })
        
        await client.mutate(mutations)
        console.log(`✅ Deleted ${mutations.length} items`)
        onComplete()
        
      } catch (error) {
        console.error('❌ Delete failed:', error)
        alert(`Delete failed: ${error.message}`)
      }
    }
  }
}
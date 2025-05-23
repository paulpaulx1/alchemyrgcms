// sanity-cms/cascadeActions.js
import { TrashIcon, EyeClosedIcon } from '@sanity/icons'

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

// Smart Publish Action - publishes portfolio and all unpublished children
export function SmartPublishAction(props) {
  const { id, type, onComplete } = props
  
  return {
    label: 'Publish',
    icon: 'publish', // or import PublishIcon
    tone: 'positive',
    onHandle: async () => {
      const client = props.getClient({ apiVersion: '2023-03-01' })
      
      try {
        const portfolioHasChildren = await hasChildren(client, id)
        
        if (!portfolioHasChildren) {
          // No children - normal publish and clean title
          const currentDoc = await client.fetch(`*[_id == $id][0]{ title }`, { id })
          const cleanedTitle = cleanTitle(currentDoc.title)
          
          await client.patch(id, patch => 
            patch.set({ 
              _publishedAt: new Date().toISOString(),
              title: cleanedTitle
            })
          ).commit()
          onComplete()
          return
        }
        
        // Has children - show cascade confirmation
        const allChildren = await collectAllChildren(client, id)
        
        // Check which ones are actually unpublished
        const unpublishedItems = await client.fetch(`
          {
            "portfolios": *[_type == "portfolio" && _id in $portfolioIds && !defined(_publishedAt)] {
              _id,
              title
            },
            "artworks": *[_type == "artwork" && _id in $artworkIds && !defined(_publishedAt)] {
              _id,
              title
            }
          }
        `, { 
          portfolioIds: allChildren.portfolios,
          artworkIds: allChildren.artworks.map(a => a._id)
        })
        
        const totalUnpublished = unpublishedItems.portfolios.length + unpublishedItems.artworks.length
        
        if (totalUnpublished === 0) {
          // Everything is already published
          const confirmed = window.confirm('This portfolio and all its children are already published. Publish anyway to update timestamps and clean titles?')
          if (!confirmed) return
        } else {
          // Show cascade publish confirmation
          const confirmMessage = `📢 CASCADE PUBLISH

This will publish this portfolio and all unpublished children, and remove "unpublished" from titles:

📁 ${unpublishedItems.portfolios.length} Unpublished Portfolio(s)
🎨 ${unpublishedItems.artworks.length} Unpublished Artwork(s)

Continue?`
          
          const confirmed = window.confirm(confirmMessage)
          if (!confirmed) return
        }
        
        // Get current titles for all items to clean them
        const allCurrentTitles = await client.fetch(`
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
        
        // Execute cascade publish with title cleanup
        const transaction = client.transaction()
        const publishTime = new Date().toISOString()
        
        // Publish all portfolios and clean titles
        allCurrentTitles.portfolios.forEach(portfolio => {
          transaction.patch(portfolio._id, patch => 
            patch.set({ 
              _publishedAt: publishTime,
              title: cleanTitle(portfolio.title)
            })
          )
        })
        
        // Publish all artworks and clean titles
        allCurrentTitles.artworks.forEach(artwork => {
          transaction.patch(artwork._id, patch => 
            patch.set({ 
              _publishedAt: publishTime,
              title: cleanTitle(artwork.title)
            })
          )
        })
        
        await transaction.commit()
        
        console.log(`✅ Cascade publish completed with title cleanup`)
        onComplete()
        
      } catch (error) {
        console.error('❌ Publish failed:', error)
        alert(`Publish failed: ${error.message}`)
      }
    }
  }
}
export function SmartDeleteAction(props) {
  const { id, type, onComplete } = props
  
  return {
    label: 'Delete',
    icon: TrashIcon,
    tone: 'critical',
    onHandle: async () => {
      // Get the client from context 
      const client = props.getClient({ apiVersion: '2023-03-01' })
      
      try {
        // Check if this portfolio has children
        const portfolioHasChildren = await hasChildren(client, id)
        
        if (!portfolioHasChildren) {
          // No children - use normal delete with simple confirmation
          const confirmed = window.confirm('Delete this portfolio permanently?')
          if (confirmed) {
            await client.delete(id)
            onComplete()
          }
          return
        }
        
        // Has children - show cascade confirmation
        const allChildren = await collectAllChildren(client, id)
        const portfolioDetails = await client.fetch(`
          *[_type == "portfolio" && _id in $ids] {
            _id,
            title
          }
        `, { ids: allChildren.portfolios })
        
        const confirmMessage = `⚠️ CASCADE DELETE WARNING ⚠️

This portfolio has children! This will permanently delete:

📁 ${portfolioDetails.length} Portfolio(s):
${portfolioDetails.map(p => `  • ${p.title}`).join('\n')}

🎨 ${allChildren.artworks.length} Artwork(s)

⚠️ This action CANNOT be undone!

Continue with cascade delete?`
        
        const confirmed = window.confirm(confirmMessage)
        if (!confirmed) return
        
        // Execute cascade delete
        const transaction = client.transaction()
        
        // Delete artworks first
        allChildren.artworks.forEach(artwork => {
          transaction.delete(artwork._id)
        })
        
        // Delete portfolios (reverse order to delete children first)
        allChildren.portfolios.reverse().forEach(portfolioId => {
          transaction.delete(portfolioId)
        })
        
        await transaction.commit()
        
        console.log(`✅ Cascade delete completed`)
        onComplete()
        
      } catch (error) {
        console.error('❌ Delete failed:', error)
        alert(`Delete failed: ${error.message}`)
      }
    }
  }
}

// Smart Unpublish Action
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
          // No children - normal unpublish
          await client.patch(id).unset(['_publishedAt']).commit()
          onComplete()
          return
        }
        
        // Has children - show cascade confirmation
        const allChildren = await collectAllChildren(client, id)
        
        const confirmMessage = `📝 CASCADE UNPUBLISH

This will unpublish this portfolio and all its children.

Continue?`
        
        const confirmed = window.confirm(confirmMessage)
        if (!confirmed) return
        
        // Execute cascade unpublish
        const transaction = client.transaction()
        
        // Unpublish artworks
        allChildren.artworks.forEach(artwork => {
          transaction.patch(artwork._id).unset(['_publishedAt'])
        })
        
        // Unpublish portfolios
        allChildren.portfolios.forEach(portfolioId => {
          transaction.patch(portfolioId).unset(['_publishedAt'])
        })
        
        await transaction.commit()
        
        console.log(`✅ Cascade unpublish completed`)
        onComplete()
        
      } catch (error) {
        console.error('❌ Unpublish failed:', error)
        alert(`Unpublish failed: ${error.message}`)
      }
    }
  }
}
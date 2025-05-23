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

// Smart Delete Action - following official Sanity docs structure
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
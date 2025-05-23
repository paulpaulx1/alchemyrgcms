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
        title,
        subPortfolios[]->_id
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

// Smart Delete Action
export function createSmartDeleteAction(originalAction) {
  return (props) => {
    // Return the action object directly, not a function
    return {
      label: 'Delete',
      icon: TrashIcon,
      tone: 'critical',
      onHandle: async () => {
        const { id, getClient } = props
        const client = getClient({ apiVersion: '2023-03-01' })
        
        try {
          // Check if this portfolio has children
          const portfolioHasChildren = await hasChildren(client, id)
          
          if (!portfolioHasChildren) {
            // No children - use normal delete with simple confirmation
            const confirmed = window.confirm('Delete this portfolio permanently?')
            if (confirmed) {
              await client.delete(id)
              // Navigate away
              if (window.history.length > 1) {
                window.history.back()
              } else {
                window.location.href = '/studio'
              }
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

🎨 ${allChildren.artworks.length} Artwork(s):
${allChildren.artworks.slice(0, 5).map(a => `  • ${a.title}`).join('\n')}${allChildren.artworks.length > 5 ? `\n  • ... and ${allChildren.artworks.length - 5} more` : ''}

⚠️ This action CANNOT be undone!

Continue with cascade delete?`
          
          const confirmed = window.confirm(confirmMessage)
          if (!confirmed) return
          
          // Final confirmation
          const finalConfirm = window.confirm(
            `FINAL CONFIRMATION\n\nDelete ${portfolioDetails.length} portfolios and ${allChildren.artworks.length} artworks permanently?\n\nThis cannot be undone!`
          )
          if (!finalConfirm) return
          
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
          
          console.log(`✅ Cascade delete completed: ${portfolioDetails.length} portfolios, ${allChildren.artworks.length} artworks`)
          
          // Navigate away
          if (window.history.length > 1) {
            window.history.back()
          } else {
            window.location.href = '/studio'
          }
          
        } catch (error) {
          console.error('❌ Delete failed:', error)
          alert(`Delete failed: ${error.message}`)
        }
      }
    }
  }
}

// Smart Unpublish Action
export function createSmartUnpublishAction(originalAction) {
  return (props) => {
    return {
      label: 'Unpublish',
      icon: EyeClosedIcon,
      tone: 'caution',
      onHandle: async () => {
        const { id, getClient } = props
        const client = getClient({ apiVersion: '2023-03-01' })
        
        try {
          const portfolioHasChildren = await hasChildren(client, id)
          
          if (!portfolioHasChildren) {
            // No children - normal unpublish
            await client.patch(id).unset(['_publishedAt']).commit()
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
          
          const confirmMessage = `📝 CASCADE UNPUBLISH

This portfolio has children! This will unpublish:

📁 ${portfolioDetails.length} Portfolio(s)
🎨 ${allChildren.artworks.length} Artwork(s)

Continue with cascade unpublish?`
          
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
          
          console.log(`✅ Cascade unpublish completed: ${portfolioDetails.length} portfolios, ${allChildren.artworks.length} artworks`)
          
        } catch (error) {
          console.error('❌ Unpublish failed:', error)
          alert(`Unpublish failed: ${error.message}`)
        }
      }
    }
  }
}
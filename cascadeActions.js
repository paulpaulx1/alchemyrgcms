// sanity-cms/cascadeActions.js
import {TrashIcon, EyeClosedIcon} from '@sanity/icons'
import {useState, useEffect} from 'react'
import {useDocumentOperation} from 'sanity'

// Helper function to check if portfolio has children
async function hasChildren(client, portfolioId) {
  const result = await client.fetch(
    `
    {
      "hasChildPortfolios": count(*[_type == "portfolio" && (
        references($portfolioId) || 
        $portfolioId in subPortfolios[]._ref
      )]) > 0,
      "hasArtworks": count(*[_type == "artwork" && portfolio._ref == $portfolioId]) > 0
    }
  `,
    {portfolioId},
  )

  return result.hasChildPortfolios || result.hasArtworks
}

// Recursive function to collect all child portfolios
async function collectAllChildren(client, portfolioId) {
  const children = await client.fetch(
    `
    {
      "portfolios": *[_type == "portfolio" && (
        references($portfolioId) || 
        $portfolioId in subPortfolios[]._ref
      )] {
        _id,
        title,
        _type
      },
      "artworks": *[_type == "artwork" && portfolio._ref == $portfolioId] {
        _id,
        title,
        _type
      }
    }
  `,
    {portfolioId},
  )

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
    artworks: allArtworks,
  }
}

// Helper function to clean "unpublished" from titles
function cleanTitle(title) {
  return title.replace(/\s*unpublished\s*$/i, '').trim()
}

async function unpublishDocument(client, docId) {
  const draftId = `drafts.${docId}`
  const publishedDoc = await client.getDocument(docId)

  if (!publishedDoc) {
    console.log(`⚠️ Document ${docId} is not published.`)
    return
  }

  // Create a draft copy if none exists
  await client
    .transaction()
    .createIfNotExists({...publishedDoc, _id: draftId})
    .delete(docId)
    .commit()

  console.log(`✅ Unpublished document: ${docId}`)
}

// TEST Unpublish Action - let's see what operations are available
export function SmartUnpublishAction(props) {
    const { id, type, onComplete } = props
    const operations = useDocumentOperation(id, type)
  
    return {
      label: 'Cascade Unpublish',
      icon: EyeClosedIcon,
      tone: 'caution',
      onHandle: async () => {
        const client = props.getClient({ apiVersion: '2023-03-01' })
  
        // Helper to simulate unpublish
        async function unpublishDocument(docId) {
          const draftId = `drafts.${docId}`
          const publishedDoc = await client.getDocument(docId)
          if (!publishedDoc) {
            console.log(`⚠️ Document ${docId} is already unpublished.`)
            return
          }
  
          await client
            .transaction()
            .createIfNotExists({ ...publishedDoc, _id: draftId })
            .delete(docId)
            .commit()
  
          console.log(`✅ Unpublished document: ${docId}`)
        }
  
        try {
          const allChildren = await collectAllChildren(client, id)
  
          const confirmMessage = `⚠️ CASCADE UNPUBLISH ⚠️
  
  This will unpublish:
  • ${allChildren.artworks.length} artworks
  • ${allChildren.portfolios.length - 1} sub-portfolios
  • 1 main portfolio
  
  Continue?`
  
          const confirmed = window.confirm(confirmMessage)
          if (!confirmed) return
  
          // --- Unpublish children ---
  
          // Unpublish artworks
          for (const artwork of allChildren.artworks) {
            await unpublishDocument(artwork._id)
          }
  
          // Unpublish child portfolios (excluding the main one)
          const childPortfolios = allChildren.portfolios.filter(pid => pid !== id)
          for (const portfolioId of childPortfolios.reverse()) {
            await unpublishDocument(portfolioId)
          }
  
          // --- Unpublish main portfolio last ---
  
          const draft = await client.getDocument(`drafts.${id}`)
          const published = await client.getDocument(id)
  
          console.log('📄 Main portfolio draft exists:', !!draft)
          console.log('📄 Main portfolio published exists:', !!published)
          console.log('⚙️ Built-in unpublish available:', !!operations.unpublish)
          console.log('🚫 Built-in unpublish disabled:', operations.unpublish?.disabled)
  
          if (operations.unpublish && !operations.unpublish.disabled) {
            console.log('🚀 Using built-in unpublish for main portfolio...')
            operations.unpublish.execute()
          } else {
            console.log('⚠️ Using fallback unpublish for main portfolio...')
            await unpublishDocument(id)
          }
  
          alert('✅ Cascade unpublish complete!')
          onComplete()
        } catch (error) {
          console.error('❌ Cascade unpublish failed:', error)
          alert(`Cascade unpublish failed: ${error.message}`)
        }
      }
    }
  }

// Proper Publish Action
export function SmartPublishAction(props) {
  const {id, type, onComplete} = props

  return {
    label: 'Cascade Publish',
    icon: 'publish',
    tone: 'positive',
    onHandle: async () => {
      const client = props.getClient({apiVersion: '2023-03-01'})

      try {
        const portfolioHasChildren = await hasChildren(client, id)

        if (!portfolioHasChildren) {
          // No children - clean title and show message
          const currentDoc = await client.fetch(`*[_id == $id][0]{ title }`, {id})
          const cleanedTitle = cleanTitle(currentDoc.title)

          if (cleanedTitle !== currentDoc.title) {
            await client.mutate([
              {
                patch: {
                  id: id,
                  set: {title: cleanedTitle},
                },
              },
            ])
          }

          alert(
            '✅ Title cleaned.\n\n📢 Now click the standard "Publish" button to actually publish this document.',
          )
          onComplete()
          return
        }

        // Has children
        const allChildren = await collectAllChildren(client, id)

        const confirmMessage = `📢 CASCADE PUBLISH PREP

This will:
1. Remove "unpublished" from titles
2. Show you a list of documents to manually publish

Items to process:
• 1 portfolio
• ${allChildren.artworks.length} artworks

Continue?`

        const confirmed = window.confirm(confirmMessage)
        if (!confirmed) return

        // Get all items
        const allItems = await client.fetch(
          `
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
        `,
          {
            portfolioIds: allChildren.portfolios,
            artworkIds: allChildren.artworks.map((a) => a._id),
          },
        )

        // Clean titles
        const mutations = []
        const itemsToPublish = []

        allItems.portfolios.forEach((portfolio) => {
          const cleanedTitle = cleanTitle(portfolio.title)
          if (cleanedTitle !== portfolio.title) {
            mutations.push({
              patch: {
                id: portfolio._id,
                set: {title: cleanedTitle},
              },
            })
          }
          itemsToPublish.push(`📁 ${cleanedTitle} (Portfolio)`)
        })

        allItems.artworks.forEach((artwork) => {
          const cleanedTitle = cleanTitle(artwork.title)
          if (cleanedTitle !== artwork.title) {
            mutations.push({
              patch: {
                id: artwork._id,
                set: {title: cleanedTitle},
              },
            })
          }
          itemsToPublish.push(`🎨 ${cleanedTitle} (Artwork)`)
        })

        // Execute title cleaning
        if (mutations.length > 0) {
          await client.mutate(mutations)
        }

        const message = `✅ CASCADE TITLE CLEANUP COMPLETED!

Cleaned ${mutations.length} titles (removed "unpublished").

📋 NEXT STEPS - Manually publish these items:

${itemsToPublish.slice(0, 10).join('\n')}${itemsToPublish.length > 10 ? `\n... and ${itemsToPublish.length - 10} more` : ''}

💡 TIP: Use the standard Publish button on each item to publish them.`

        alert(message)
        console.log('📋 Items to manually publish:', itemsToPublish)
        onComplete()
      } catch (error) {
        console.error('❌ Cascade operation failed:', error)
        alert(`Operation failed: ${error.message}`)
      }
    },
  }
}

// Simple Delete Action (this one can work automatically)
export function SmartDeleteAction(props) {
  const {id, type, onComplete} = props

  return {
    label: 'Cascade Delete',
    icon: TrashIcon,
    tone: 'critical',
    onHandle: async () => {
      const client = props.getClient({apiVersion: '2023-03-01'})

      try {
        const portfolioHasChildren = await hasChildren(client, id)

        if (!portfolioHasChildren) {
          // No children - normal delete
          const confirmed = window.confirm('Delete this portfolio permanently?')
          if (confirmed) {
            await client.mutate([
              {
                delete: {id: id},
              },
            ])
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

⚠️ This CANNOT be undone!

Type "DELETE" to confirm:`

        const userInput = prompt(confirmMessage)
        if (userInput !== 'DELETE') {
          alert('Delete cancelled.')
          return
        }

        // Execute cascade delete
        const mutations = []

        // Delete artworks first
        allChildren.artworks.forEach((artwork) => {
          mutations.push({delete: {id: artwork._id}})
        })

        // Delete portfolios last (children first)
        allChildren.portfolios.reverse().forEach((portfolioId) => {
          mutations.push({delete: {id: portfolioId}})
        })

        await client.mutate(mutations)

        console.log(`✅ Cascade delete completed: ${mutations.length} items deleted`)
        onComplete()
      } catch (error) {
        console.error('❌ Delete failed:', error)
        alert(`Delete failed: ${error.message}`)
      }
    },
  }
}

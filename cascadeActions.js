// sanity-cms/cascadeActions.js
import { TrashIcon, EyeClosedIcon, EyeOpenIcon, PublishIcon } from '@sanity/icons'
import { useDocumentOperation } from 'sanity'
import { useState, useEffect } from 'react'

async function hasChildren(client, portfolioId) {
  const { hasChildPortfolios, hasArtworks } = await client.fetch(
    `{
      "hasChildPortfolios": count(*[_type=="portfolio" && references($id)])>0,
      "hasArtworks":       count(*[_type=="artwork"   && portfolio._ref==$id])>0
    }`,
    { id: portfolioId }
  )
  return hasChildPortfolios || hasArtworks
}

async function collectAllChildren(client, portfolioId) {
  const { portfolios, artworks } = await client.fetch(
    `{
      "portfolios": *[_type=="portfolio" && references($id)]{_id},
      "artworks":   *[_type=="artwork"   && portfolio._ref==$id]{_id}
    }`,
    { id: portfolioId }
  )
  let allPortfolios = [portfolioId]
  let allArtworks   = artworks.map(a => a._id)
  for (const p of portfolios) {
    const sub = await collectAllChildren(client, p._id)
    allPortfolios = allPortfolios.concat(sub.portfolios)
    allArtworks   = allArtworks.concat(sub.artworks)
  }
  return {
    portfolios: Array.from(new Set(allPortfolios)),
    artworks:   Array.from(new Set(allArtworks))
  }
}

function cleanTitle(title) {
  return title.replace(/\s*unpublished\s*$/i, '').trim()
}

async function markUnpublished(client, docId) {
  const doc = await client.getDocument(docId)
  if (!doc) return
  const base    = cleanTitle(doc.title || '')
  const updated = `${base} unpublished`
  await client.patch(docId).set({ title: updated }).commit()
}

async function clearUnpublished(client, docId) {
  const doc = await client.getDocument(docId)
  if (!doc) return
  const cleaned = cleanTitle(doc.title || '')
  if (cleaned !== doc.title) {
    await client.patch(docId).set({ title: cleaned }).commit()
  }
}

export function SmartCascadePublishAction(props) {
  const { id, onComplete, type } = props
  const { publish } = useDocumentOperation(id, type)
  const [isPublishing, setIsPublishing] = useState(false)

  useEffect(() => {
    // Check if publishing is complete
    if (isPublishing && !props.draft) {
      setIsPublishing(false)
    }
  }, [props.draft, isPublishing])

  return {
    label: isPublishing ? 'Publishing...' : 'Cascade Publish',
    icon: PublishIcon,
    tone: 'positive',
    disabled: publish.disabled || isPublishing,
    onHandle: async () => {
      const client = props.getClient({ apiVersion: '2023-03-01' })
      const { portfolios, artworks } = await collectAllChildren(client, id)
      
      if (!window.confirm(
        `Publish ${artworks.length} artworks and ${portfolios.length} portfolios (including this one)?`
      )) return

      setIsPublishing(true)

      try {
        // First, publish all child artworks
        for (const aid of artworks) {
          // Check if artwork has a draft version that needs publishing
          const artworkDraft = await client.getDocument(`drafts.${aid}`)
          if (artworkDraft) {
            // Use client mutations to publish the draft
            await client.mutate([
              { 
                createOrReplace: { 
                  ...artworkDraft, 
                  _id: aid // Remove drafts. prefix
                } 
              },
              { delete: { id: `drafts.${aid}` } }
            ])
          }
        }

        // Then publish all portfolios (children first, then parent)
        const sortedPortfolios = [...portfolios].reverse() // Start with deepest children
        for (const pid of sortedPortfolios) {
          const portfolioDraft = await client.getDocument(`drafts.${pid}`)
          if (portfolioDraft) {
            await client.mutate([
              { 
                createOrReplace: { 
                  ...portfolioDraft, 
                  _id: pid 
                } 
              },
              { delete: { id: `drafts.${pid}` } }
            ])
          }
        }

        // Finally, publish the main portfolio using the document operation
        publish.execute()
        onComplete()
      } catch (error) {
        console.error('Error during cascade publish:', error)
        setIsPublishing(false)
        alert('Error occurred during publishing. Check console for details.')
      }
    }
  }
}

export function SafeCascadeUnpublishAction(props) {
  const { id, onComplete, type } = props
  const { unpublish } = useDocumentOperation(id, type)
  const [isUnpublishing, setIsUnpublishing] = useState(false)

  return {
    label: isUnpublishing ? 'Unpublishing...' : 'Safe Cascade Unpublish',
    icon: EyeClosedIcon,
    tone: 'caution',
    disabled: isUnpublishing || unpublish.disabled,
    onHandle: async () => {
      const client = props.getClient({ apiVersion: '2023-03-01' })
      const { portfolios, artworks } = await collectAllChildren(client, id)
      
      if (!window.confirm(
        `This will unpublish:\n• ${portfolios.length} portfolios\n• ${artworks.length} artworks\n\nThey will become drafts but won't be deleted. Continue?`
      )) return

      setIsUnpublishing(true)

      try {
        // Step 1: Unpublish all child artworks first (they should unpublish easily)
        console.log('Unpublishing artworks...')
        for (const aid of artworks) {
          try {
            const publishedArtwork = await client.getDocument(aid)
            if (publishedArtwork) {
              // Create draft version
              await client.createOrReplace({
                ...publishedArtwork,
                _id: `drafts.${aid}`
              })
              // Delete published version
              await client.delete(aid)
              console.log(`Unpublished artwork: ${aid}`)
            }
          } catch (error) {
            console.warn(`Could not unpublish artwork ${aid}:`, error.message)
            // Continue with other artworks
          }
        }

        // Step 2: Unpublish child portfolios (reverse order - deepest first)
        console.log('Unpublishing child portfolios...')
        const childPortfolios = portfolios.filter(pid => pid !== id).reverse()
        for (const pid of childPortfolios) {
          try {
            const publishedPortfolio = await client.getDocument(pid)
            if (publishedPortfolio) {
              // Create draft version
              await client.createOrReplace({
                ...publishedPortfolio,
                _id: `drafts.${pid}`
              })
              // Delete published version
              await client.delete(pid)
              console.log(`Unpublished portfolio: ${pid}`)
            }
          } catch (error) {
            console.warn(`Could not unpublish portfolio ${pid}:`, error.message)
            // Continue with other portfolios
          }
        }

        // Step 3: Finally unpublish the main portfolio using Sanity's built-in operation
        console.log('Unpublishing main portfolio...')
        unpublish.execute()
        
        setIsUnpublishing(false)
        onComplete()
      } catch (error) {
        console.error('Error during cascade unpublish:', error)
        setIsUnpublishing(false)
        alert('Error occurred during unpublishing. Check console for details.')
      }
    }
  }
}

export function SimpleUnpublishAction(props) {
  const { id, onComplete, type } = props
  const { unpublish } = useDocumentOperation(id, type)
  const [isUnpublishing, setIsUnpublishing] = useState(false)

  return {
    label: isUnpublishing ? 'Unpublishing...' : 'Simple Unpublish',
    icon: EyeClosedIcon,
    tone: 'caution',
    disabled: isUnpublishing || unpublish.disabled,
    onHandle: async () => {
      if (!window.confirm('Unpublish this portfolio only (no cascade)?')) return

      setIsUnpublishing(true)

      try {
        // Just use Sanity's built-in unpublish
        unpublish.execute()
        setIsUnpublishing(false)
        onComplete()
      } catch (error) {
        console.error('Error during unpublish:', error)
        setIsUnpublishing(false)
        alert('Could not unpublish. This usually means other documents reference it.')
      }
    }
  }
}

export function SmartMarkUnpublishAction(props) {
  const { id, onComplete, type } = props
  return {
    label: 'Mark as "Unpublished"',
    icon:  EyeClosedIcon,
    tone:  'caution',
    onHandle: async () => {
      const client = props.getClient({ apiVersion: '2023-03-01' })
      const { portfolios, artworks } = await collectAllChildren(client, id)
      if (!window.confirm(
        `Add "unpublished" to titles of:\n• ${portfolios.length} portfolios\n• ${artworks.length} artworks\n\n(This doesn't actually unpublish them)`
      )) return
      
      try {
        for (const pid of portfolios) {
          await markUnpublished(client, pid)
        }
        for (const aid of artworks) {
          await markUnpublished(client, aid)
        }
        alert('Added "unpublished" to all titles')
        onComplete()
      } catch (error) {
        console.error('Error marking unpublished:', error)
        alert('Error occurred. Check console for details.')
      }
    }
  }
}

export function SmartClearUnpublishAction(props) {
  const { id, onComplete } = props
  return {
    label: 'Clear "Unpublished" from Titles',
    icon:  EyeOpenIcon,
    tone:  'positive',
    onHandle: async () => {
      const client = props.getClient({ apiVersion: '2023-03-01' })
      const { portfolios, artworks } = await collectAllChildren(client, id)
      if (!window.confirm(
        `Remove "unpublished" from titles of:\n• ${portfolios.length} portfolios\n• ${artworks.length} artworks`
      )) return
      
      try {
        for (const pid of portfolios) {
          await clearUnpublished(client, pid)
        }
        for (const aid of artworks) {
          await clearUnpublished(client, aid)
        }
        alert('Removed "unpublished" from all titles')
        onComplete()
      } catch (error) {
        console.error('Error clearing unpublished:', error)
        alert('Error occurred. Check console for details.')
      }
    }
  }
}

export function SmartDeleteAction(props) {
  const { id, onComplete, type } = props
  return {
    label: 'Cascade Delete',
    icon:  TrashIcon,
    tone:  'critical',
    onHandle: async () => {
      const client = props.getClient({ apiVersion: '2023-03-01' })
      
      if (!(await hasChildren(client, id))) {
        if (window.confirm('Delete this portfolio permanently?')) {
          await client.mutate([{ delete: { id } }])
          onComplete()
        }
        return
      }
      
      const { portfolios, artworks } = await collectAllChildren(client, id)
      const input = prompt(
        `⚠️ CASCADE DELETE ⚠️\nThis will PERMANENTLY delete:\n• ${portfolios.length} portfolios\n• ${artworks.length} artworks\n\nType "DELETE" to confirm:`
      )
      if (input !== 'DELETE') return
      
      try {
        const mutations = [
          ...artworks.map(aid => ({ delete: { id: aid } })),
          ...portfolios.reverse().map(pid => ({ delete: { id: pid } }))
        ]
        await client.mutate(mutations)
        alert('All documents deleted successfully')
        onComplete()
      } catch (error) {
        console.error('Error during cascade delete:', error)
        alert('Error occurred during deletion. Check console for details.')
      }
    }
  }
}
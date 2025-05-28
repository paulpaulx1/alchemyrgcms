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

export function SmartCascadeUnpublishAction(props) {
  const { id, onComplete, type } = props
  const { unpublish } = useDocumentOperation(id, type)
  const [isUnpublishing, setIsUnpublishing] = useState(false)

  useEffect(() => {
    // Check if unpublishing is complete - when published becomes null
    if (isUnpublishing && !props.published) {
      setIsUnpublishing(false)
    }
  }, [props.published, isUnpublishing])

  return {
    label: isUnpublishing ? 'Unpublishing...' : 'Cascade Unpublish',
    icon: EyeClosedIcon,
    tone: 'caution',
    disabled: unpublish.disabled || isUnpublishing || !props.published,
    onHandle: async () => {
      const client = props.getClient({ apiVersion: '2023-03-01' })
      const { portfolios, artworks } = await collectAllChildren(client, id)
      
      if (!window.confirm(
        `Unpublish ${artworks.length} artworks and ${portfolios.length} portfolios (including this one)?`
      )) return

      setIsUnpublishing(true)

      try {
        // First unpublish all child artworks
        for (const aid of artworks) {
          const publishedArtwork = await client.getDocument(aid)
          if (publishedArtwork) {
            // Create draft version and delete published
            await client.mutate([
              { 
                createOrReplace: { 
                  ...publishedArtwork, 
                  _id: `drafts.${aid}` 
                } 
              },
              { delete: { id: aid } }
            ])
          }
        }

        // Then unpublish child portfolios (deepest first)
        const childPortfolios = portfolios.filter(pid => pid !== id)
        for (const pid of childPortfolios) {
          const publishedPortfolio = await client.getDocument(pid)
          if (publishedPortfolio) {
            await client.mutate([
              { 
                createOrReplace: { 
                  ...publishedPortfolio, 
                  _id: `drafts.${pid}` 
                } 
              },
              { delete: { id: pid } }
            ])
          }
        }

        // Finally, unpublish the main portfolio using the document operation
        unpublish.execute()
        onComplete()
      } catch (error) {
        console.error('Error during cascade unpublish:', error)
        setIsUnpublishing(false)
        alert('Error occurred during unpublishing. Check console for details.')
      }
    }
  }
}

export function SmartMarkUnpublishAction(props) {
  const { id, onComplete, type } = props
  return {
    label: 'Cascade Mark Unpublish',
    icon:  EyeClosedIcon,
    tone:  'caution',
    onHandle: async () => {
      const client = props.getClient({ apiVersion: '2023-03-01' })
      const { portfolios, artworks } = await collectAllChildren(client, id)
      if (!window.confirm(
        `Mark ${artworks.length} artworks and ${portfolios.length - 1} sub-portfolios as "unpublished"?`
      )) return
      for (const pid of portfolios) {
        await markUnpublished(client, pid)
      }
      for (const aid of artworks) {
        await markUnpublished(client, aid)
      }
      onComplete()
    }
  }
}

export function SmartClearUnpublishAction(props) {
  const { id, onComplete } = props
  return {
    label: 'Cascade Clear Unpublished',
    icon:  EyeOpenIcon,
    tone:  'positive',
    onHandle: async () => {
      const client = props.getClient({ apiVersion: '2023-03-01' })
      const { portfolios, artworks } = await collectAllChildren(client, id)
      if (!window.confirm(
        `Remove "unpublished" from ${artworks.length} artworks and ${portfolios.length} portfolios?`
      )) return
      for (const pid of portfolios) {
        await clearUnpublished(client, pid)
      }
      for (const aid of artworks) {
        await clearUnpublished(client, aid)
      }
      onComplete()
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
        `⚠️ CASCADE DELETE ⚠️\nThis will delete:\n• 1 portfolio\n• ${artworks.length} artworks\nType "DELETE" to confirm:`
      )
      if (input !== 'DELETE') return
      const mutations = [
        ...artworks.map(aid => ({ delete: { id: aid } })),
        ...portfolios.reverse().map(pid => ({ delete: { id: pid } }))
      ]
      await client.mutate(mutations)
      onComplete()
    }
  }
}
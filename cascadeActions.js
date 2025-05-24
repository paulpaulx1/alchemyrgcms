/* global window */
// sanity-cms/cascadeActions.js
import { TrashIcon, EyeClosedIcon, EyeOpenIcon } from '@sanity/icons'

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

export function SmartMarkUnpublishAction(props) {
  const { id, onComplete } = props
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
  const { id, onComplete } = props
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
      const input = window.prompt(
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

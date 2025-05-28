// sanity-cms/cascadeActions.js
import { TrashIcon } from '@sanity/icons'

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
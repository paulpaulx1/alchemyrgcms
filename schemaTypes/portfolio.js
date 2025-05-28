export default {
  name: 'portfolio',
  title: 'Portfolio',
  type: 'document',
  fields: [
    {
      name: 'title',
      title: 'Portfolio Title',
      type: 'string',
      validation: (Rule) => Rule.required(),
    },
    {
      name: 'slug',
      title: 'Slug',
      type: 'slug',
      options: {
        source: 'title',
        maxLength: 96,
      },
      validation: (Rule) => Rule.required(),
    },
    
    {
      name: 'description',
      title: 'Description',
      type: 'text',
    },
    {
      name: 'coverImage',
      title: 'Cover Image',
      type: 'image',
      options: {
        hotspot: true,
      },
    },
    {
      name: 'coverArtwork',
      title: 'Cover Artwork',
      type: 'reference',
      to: [{type: 'artwork'}],
      description: 'Select an artwork to use as the portfolio cover (will override the Cover Image if both are set)'
    },
    {
      name: 'parentPortfolio',
      title: 'Parent Portfolio',
      type: 'reference',
      to: [{type: 'portfolio'}],
      description: 'Optional: Select a parent portfolio if this is a sub-portfolio',
    },
    {
      name: 'subPortfolios',
      title: 'Sub Portfolios',
      type: 'array',
      of: [
        {
          type: 'reference',
          to: [{type: 'portfolio'}],
        },
      ],
      description: 'Sub-portfolios contained within this portfolio',
    },
    {
      name: 'year',
      title: 'Year',
      type: 'string',
    },
    {
      name: 'featured',
      title: 'Featured Portfolio',
      type: 'boolean',
      description: 'Show this portfolio prominently on the home page',
    },
    {
      name: 'publishedAt',
      title: 'Published At',
      type: 'datetime',
    },
    {
      name: 'order',
      title: 'Display Order',
      type: 'number',
      description: 'Controls the order of portfolios (lower numbers appear first)',
    },
  ],
  orderings: [
    {
      title: 'Display Order',
      name: 'orderAsc',
      by: [{field: 'order', direction: 'asc'}],
    },
    {
      title: 'Publication Date, New',
      name: 'publishedAtDesc',
      by: [{field: 'publishedAt', direction: 'desc'}],
    },
  ],
  preview: {
    select: {
      title: 'title',
      year: 'year',
      media: 'coverImage',
      parentTitle: 'parentPortfolio.title',
      // Add artwork count for better search context
      artworkCount: '*[_type == "artwork" && portfolio._ref == ^._id]',
    },
    prepare(selection) {
      const {title, year, parentTitle, artworkCount} = selection
      const count = Array.isArray(artworkCount) ? artworkCount.length : 0
      
      let subtitle = ''
      if (parentTitle) {
        subtitle = `📁 Sub-portfolio of ${parentTitle}`
      } else if (count > 0) {
        subtitle = `${count} artwork${count !== 1 ? 's' : ''}`
      }
      if (year && subtitle) {
        subtitle += ` • ${year}`
      } else if (year) {
        subtitle = year
      }
      
      return {
        ...selection,
        subtitle: subtitle,
      }
    },
  },
}
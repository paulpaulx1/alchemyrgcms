export default {
  name: 'siteSettings',
  title: 'Site Settings',
  type: 'document',
  fields: [
    {
      name: 'title',
      title: 'Site Title',
      type: 'string'
    },
    {
      name: 'description',
      title: 'Site Description',
      type: 'text'
    },
    {
      name: 'logo',
      title: 'Site Logo',
      type: 'image'
    },
    {
      name: 'artist',
      title: 'Artist',
      type: 'reference',
      to: {type: 'artist'},
      validation: Rule => Rule.required()
    },
    {
      name: 'featuredPortfolios',
      title: 'Featured Portfolios',
      type: 'array',
      of: [{type: 'reference', to: {type: 'portfolio'}}]
    },
    {
      name: 'heroImage',
      title: 'Hero Image',
      type: 'image',
      options: {
        hotspot: true
      }
    },
    {
      name: 'metaImage',
      title: 'Meta Image',
      type: 'image',
      description: 'Image used for social media sharing'
    },
    // New fields for background color and font
    {
      name: 'backgroundColor',
      title: 'Background Color',
      type: 'color',
      description: 'Choose a background color for the site'
    },
    {
      name: 'font',
      title: 'Site Font',
      type: 'string',
      description: 'Choose a font for the site',
      options: {
        list: [
          { title: 'Default', value: 'default' },
          { title: 'Open Sans', value: 'open-sans' },
          { title: 'Roboto', value: 'roboto' },
          { title: 'Lato', value: 'lato' },
          { title: 'Montserrat', value: 'montserrat' }
          // Add more fonts based on Raj's preferences
        ]
      }
    }
  ],
  preview: {
    select: {
      title: 'title',
      artist: 'artist.name'
    },
    prepare(selection) {
      const {title, artist} = selection
      return {
        title: title || 'Site Settings',
        subtitle: artist ? `Artist: ${artist}` : ''
      }
    }
  }
}
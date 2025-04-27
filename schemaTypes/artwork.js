export default {
  name: 'artwork',
  title: 'Artwork',
  type: 'document',
  fields: [
    {
      name: 'title',
      title: 'Title',
      type: 'string',
      validation: Rule => Rule.required()
    },
    {
      name: 'slug',
      title: 'Slug',
      type: 'slug',
      options: {
        source: 'title',
        maxLength: 96
      },
      validation: Rule => Rule.required()
    },
    {
      name: 'portfolio',
      title: 'Portfolio',
      type: 'reference',
      to: {type: 'portfolio'},
      validation: Rule => Rule.required()
    },
    {
      name: 'mediaType',
      title: 'Media Type',
      type: 'string',
      options: {
        list: [
          {title: 'Image', value: 'image'},
          {title: 'Video', value: 'video'}
        ],
      },
      validation: Rule => Rule.required()
    },
    {
      name: 'image',
      title: 'Image',
      type: 'image',
      options: {
        hotspot: true
      },
      hidden: ({document}) => document?.mediaType !== 'image'
    },
    {
      name: 'lowResImage',
      title: 'Low Resolution Image',
      type: 'image',
      options: {
        hotspot: true
      },
      hidden: ({document}) => document?.mediaType !== 'image'
    },
    {
      name: 'video',
      title: 'Video File',
      type: 'file',
      options: {
        accept: 'video/*'
      },
      hidden: ({document}) => document?.mediaType !== 'video'
    },
    {
      name: 'videoThumbnail',
      title: 'Video Thumbnail',
      type: 'image',
      options: {
        hotspot: true
      },
      hidden: ({document}) => document?.mediaType !== 'video'
    },
    {
      name: 'videoUrl',
      title: 'External Video URL',
      type: 'url',
      description: 'URL to YouTube, Vimeo, etc. (optional, use this or upload a video file)',
      hidden: ({document}) => document?.mediaType !== 'video'
    },
    {
      name: 'description',
      title: 'Description',
      type: 'text'
    },
    {
      name: 'year',
      title: 'Year',
      type: 'string'
    },
    {
      name: 'dimensions',
      title: 'Dimensions',
      type: 'string'
    },
    {
      name: 'medium',
      title: 'Medium',
      type: 'string'
    },
    {
      name: 'tags',
      title: 'Tags',
      type: 'array',
      of: [{type: 'reference', to: {type: 'tag'}}]
    },
    {
      name: 'order',
      title: 'Display Order',
      type: 'number',
      description: 'Controls the order of artworks within a portfolio (lower numbers appear first)'
    }
  ],
  orderings: [
    {
      title: 'Display Order',
      name: 'orderAsc',
      by: [
        {field: 'order', direction: 'asc'}
      ]
    },
    {
      title: 'Title',
      name: 'titleAsc',
      by: [
        {field: 'title', direction: 'asc'}
      ]
    },
    {
      title: 'Year, New',
      name: 'yearDesc',
      by: [
        {field: 'year', direction: 'desc'}
      ]
    }
  ],
  preview: {
    select: {
      title: 'title',
      portfolio: 'portfolio.title',
      media: 'image',
      lowResMedia: 'lowResImage',
      videoThumbnail: 'videoThumbnail',
      mediaType: 'mediaType'
    },
    prepare(selection) {
      const {title, portfolio, media, lowResMedia, videoThumbnail, mediaType} = selection
      return {
        title,
        subtitle: portfolio ? `Portfolio: ${portfolio}` : '',
        media: mediaType === 'video' ? videoThumbnail : (media || lowResMedia)
      }
    }
  }
}
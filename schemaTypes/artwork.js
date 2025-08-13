export default {
  name: 'artwork',
  title: 'Artwork',
  type: 'document',
  __experimental_search: [
    {
      path: 'title',
      weight: 10,
      mapWith: 'lowercase'
    },
    {
      path: 'slug.current',
      weight: 8,
      mapWith: 'lowercase'
    },
    {
      path: 'portfolio.title',
      weight: 5,
      mapWith: 'lowercase'
    },
    {
      path: 'description',
      weight: 2,
      mapWith: 'lowercase'
    }
  ],
  fields: [
    {
      name: 'displayTitle',
      title: 'Display Title?',
      type: 'boolean',
      initialValue: true,
      description: 'Toggle off to hide title on frontend (for multiple photos of same piece, etc.)',
    },
    {
      name: 'title',
      title: 'Title',
      type: 'string',
      hidden: ({document}) => !document?.displayTitle,
      validation: (Rule) =>
        Rule.custom((value, context) => {
          if (context.document?.displayTitle && !value) {
            return 'Title is required when "Display Title?" is enabled'
          }
          return true
        }),
    },
    {
      name: 'slug',
      title: 'Slug',
      type: 'slug',
      options: {
        source: (doc) => {
          if (!doc.displayTitle) {
            // Generate unique slug for pieces without displayed titles
            return `no-title-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
          }
          return doc.title
        },
        maxLength: 96,
        slugify: (input) => {
          if (input.startsWith('no-title-')) {
            return input // Don't modify auto-generated slugs
          }

          // Transliterate accented characters
          const transliterated = input
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
            .toLowerCase()

          return transliterated
            .replace(/\s+/g, '-') // Replace spaces with hyphens
            .replace(/[^a-z0-9\-]/g, '') // Keep only letters, numbers, hyphens
            .replace(/-+/g, '-') // Replace multiple hyphens with single
            .replace(/^-|-$/g, '') // Remove leading/trailing hyphens
            .slice(0, 96)
        },
      },
      validation: (Rule) => Rule.required(),
    },
    {
      name: 'portfolio',
      title: 'Portfolio',
      type: 'reference',
      to: {type: 'portfolio'},
      validation: (Rule) => Rule.required(),
    },
    {
      name: 'mediaType',
      title: 'Media Type',
      type: 'string',
      options: {
        list: [
          {title: 'Image', value: 'image'},
          {title: 'Video', value: 'video'},
          {title: 'PDF', value: 'pdf'},
          {title: 'Audio', value: 'audio'},
        ],
      },
      validation: (Rule) => Rule.required(),
    },
    {
      name: 'image',
      title: 'Image',
      type: 'image',
      options: {
        hotspot: true,
      },
      hidden: ({document}) => document?.mediaType !== 'image',
    },
    {
      name: 'lowResImage',
      title: 'Low Resolution Image',
      type: 'image',
      options: {
        hotspot: true,
      },
      hidden: ({document}) => document?.mediaType !== 'image',
    },
    {
      name: 'video',
      title: 'Video File',
      type: 'file',
      options: {
        accept: 'video/*',
      },
      hidden: ({document}) => document?.mediaType !== 'video',
    },
    {
      name: 'videoThumbnail',
      title: 'Video Thumbnail',
      type: 'image',
      options: {
        hotspot: true,
      },
      hidden: ({document}) => document?.mediaType !== 'video',
    },
    {
      name: 'videoUrl',
      title: 'External Video URL',
      type: 'url',
      description: 'URL to YouTube, Vimeo, etc. (optional, use this or upload a video file)',
      hidden: ({document}) => document?.mediaType !== 'video',
    },
    // NEW MUX FIELDS - Add these after the existing video fields
    {
      name: 'muxPlaybackId',
      title: 'Mux Playback ID',
      type: 'string',
      hidden: ({document}) => document?.mediaType !== 'video',
      description: 'Auto-populated when video is uploaded to Mux',
      readOnly: true,
    },
    {
      name: 'muxAssetId', 
      title: 'Mux Asset ID',
      type: 'string',
      hidden: true, // Keep hidden, just for API reference
      readOnly: true,
    },
    {
      name: 'muxStatus',
      title: 'Mux Upload Status',
      type: 'string',
      options: {
        list: [
          {title: 'Pending', value: 'pending'},
          {title: 'Ready', value: 'ready'},
          {title: 'Error', value: 'errored'}
        ]
      },
      hidden: ({document}) => document?.mediaType !== 'video',
      readOnly: true,
    },
    // END MUX FIELDS
    {
      name: 'pdfFile',
      title: 'PDF File',
      type: 'file',
      options: {
        accept: 'application/pdf',
      },
      hidden: ({document}) => document?.mediaType !== 'pdf',
      validation: (Rule) =>
        Rule.custom((value, context) => {
          if (context.document?.mediaType === 'pdf' && !value) {
            return 'PDF file is required when media type is PDF'
          }
          return true
        }),
    },
    {
      name: 'pdfThumbnail',
      title: 'PDF Thumbnail',
      type: 'image',
      options: {
        hotspot: true,
      },
      description: 'Optional thumbnail image for PDF preview',
      hidden: ({document}) => document?.mediaType !== 'pdf',
    },
    {
      name: 'audioFile',
      title: 'Audio File',
      type: 'file',
      options: {
        accept: 'audio/*',
      },
      hidden: ({document}) => document?.mediaType !== 'audio',
      validation: (Rule) =>
        Rule.custom((value, context) => {
          if (context.document?.mediaType === 'audio' && !value) {
            return 'Audio file is required when media type is Audio'
          }
          return true
        }),
    },
    {
      name: 'audioThumbnail',
      title: 'Audio Thumbnail',
      type: 'image',
      options: {
        hotspot: true,
      },
      description: 'Optional thumbnail image for audio preview',
      hidden: ({document}) => document?.mediaType !== 'audio',
    },
    {
      name: 'description',
      title: 'Description',
      type: 'text',
    },
    {
      name: 'year',
      title: 'Year',
      type: 'string',
    },
    {
      name: 'dimensions',
      title: 'Dimensions',
      type: 'string',
    },
    {
      name: 'medium',
      title: 'Medium',
      type: 'string',
    },
    {
      name: 'tags',
      title: 'Tags',
      type: 'array',
      of: [{type: 'reference', to: {type: 'tag'}}],
    },
    {
      name: 'order',
      title: 'Display Order',
      type: 'number',
      description:
        'Controls the order of artworks within a portfolio (higher numbers appear first)',
    },
  ],
  orderings: [
    {
      title: 'Display Order',
      name: 'orderDesc',
      by: [{field: 'order', direction: 'desc'}],
    },
    {
      title: 'Title',
      name: 'titleAsc',
      by: [{field: 'title', direction: 'asc'}],
    },
    {
      title: 'Year, New',
      name: 'yearDesc',
      by: [{field: 'year', direction: 'desc'}],
    },
  ],
  preview: {
    select: {
      title: 'title',
      displayTitle: 'displayTitle',
      portfolio: 'portfolio.title',
      media: 'image',
      lowResMedia: 'lowResImage',
      videoThumbnail: 'videoThumbnail',
      pdfThumbnail: 'pdfThumbnail',
      audioThumbnail: 'audioThumbnail',
      mediaType: 'mediaType',
      slug: 'slug.current',
    },
    prepare(selection) {
      const {
        title,
        displayTitle,
        portfolio,
        media,
        lowResMedia,
        videoThumbnail,
        pdfThumbnail,
        audioThumbnail,
        mediaType,
        slug,
      } = selection
      let previewMedia
      switch (mediaType) {
        case 'audio':
          previewMedia = audioThumbnail
          break
        case 'pdf':
          previewMedia = pdfThumbnail
          break
        case 'video':
          previewMedia = videoThumbnail
          break
        case 'image':
          previewMedia = media || lowResMedia
          break
        default:
          previewMedia = media || lowResMedia
      }

      // Show title with indicator if not displayed
      let displayName
      if (title) {
        displayName = displayTitle ? title : `${title} - untitled`
      } else {
        displayName = `(${slug})`
      }

      return {
        title: displayName,
        subtitle: portfolio ? `Portfolio: ${portfolio}` : '',
        media: previewMedia,
      }
    },
  },
}
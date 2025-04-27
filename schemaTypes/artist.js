export default {
    name: 'artist',
    title: 'Artist',
    type: 'document',
    fields: [
      {
        name: 'name',
        title: 'Name',
        type: 'string',
        validation: Rule => Rule.required()
      },
      {
        name: 'slug',
        title: 'Slug',
        type: 'slug',
        options: {
          source: 'name',
          maxLength: 96
        },
        validation: Rule => Rule.required()
      },
      {
        name: 'profileImage',
        title: 'Profile Image',
        type: 'image',
        options: {
          hotspot: true
        }
      },
      {
        name: 'bio',
        title: 'Biography',
        type: 'array',
        of: [
          {
            type: 'block'
          }
        ]
      },
      {
        name: 'email',
        title: 'Email',
        type: 'string'
      },
      {
        name: 'website',
        title: 'Website',
        type: 'url'
      },
      {
        name: 'socialMedia',
        title: 'Social Media',
        type: 'object',
        fields: [
          {name: 'instagram', title: 'Instagram', type: 'url'},
          {name: 'twitter', title: 'Twitter', type: 'url'},
          {name: 'facebook', title: 'Facebook', type: 'url'},
          {name: 'linkedin', title: 'LinkedIn', type: 'url'},
          {name: 'youtube', title: 'YouTube', type: 'url'}
        ]
      },
      {
        name: 'cv',
        title: 'CV/Resume',
        type: 'file'
      }
    ],
    preview: {
      select: {
        title: 'name',
        media: 'profileImage'
      }
    }
  }
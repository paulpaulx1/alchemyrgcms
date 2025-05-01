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
      name: 'heroImage',
      title: 'Hero Image',
      type: 'image',
      options: {
        hotspot: true
      }
    },
    {
      name: 'isActive',
      title: 'Currently Active',
      type: 'boolean',
      description: 'Set to true to make this the active site configuration',
      initialValue: false
    },
    // New fields for background color and font
    {
      name: 'backgroundColor',
      title: 'Background Color',
      type: 'color',
      description: 'Choose a background color for the site'
    },
    {
      name: 'textColor',
      title: 'Text Color',
      type: 'color',
      description: 'Choose a text color for the site'
    },
    {
      name: 'font',
      title: 'Site Font',
      type: 'string',
      description: 'Choose a font for the site',
      options: {
        list: [
          { title: 'EB Garamond (Current)', value: 'eb-garamond' },
          
          // Serif fonts
          { title: 'Playfair Display', value: 'playfair-display' },
          { title: 'Merriweather', value: 'merriweather' },
          { title: 'Libre Baskerville', value: 'libre-baskerville' },
          { title: 'Lora', value: 'lora' },
          { title: 'Cormorant Garamond', value: 'cormorant-garamond' },
          
          // Sans-serif fonts
          { title: 'Open Sans', value: 'open-sans' },
          { title: 'Roboto', value: 'roboto' },
          { title: 'Lato', value: 'lato' },
          { title: 'Montserrat', value: 'montserrat' },
          { title: 'Raleway', value: 'raleway' },
          { title: 'Work Sans', value: 'work-sans' },
          { title: 'Poppins', value: 'poppins' },
          
          // More artistic/display fonts
          { title: 'Cormorant', value: 'cormorant' },
          { title: 'Cinzel', value: 'cinzel' },
          { title: 'Josefin Sans', value: 'josefin-sans' },
          { title: 'Josefin Slab', value: 'josefin-slab' },
          { title: 'Quicksand', value: 'quicksand' }
        ]
      },
      initialValue: 'eb-garamond'
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
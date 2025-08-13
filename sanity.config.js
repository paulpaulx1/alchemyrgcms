// sanity.config.js
import { defineConfig } from 'sanity'
import { structureTool } from 'sanity/structure'
import { visionTool } from '@sanity/vision'
import { colorInput } from '@sanity/color-input'
import { schemaTypes } from './schemaTypes'
import {
  SmartDeleteAction
} from './cascadeActions'
import { UploadToMuxAction } from './actions/uploadToMux' // Add this import

export default defineConfig({
  name: 'default',
  title: 'AlchemyRG',
  projectId: '5lwtjnp5',
  dataset: 'production',
  plugins: [structureTool(), visionTool(), colorInput()],
  schema: { types: schemaTypes },
  
  // Modern search configuration
  search: {
    unstable_enableNewSearch: true,
  },
  
  document: {
    // Enhanced search for artworks
    search: (prev, context) => {
      if (context.schemaType === 'artwork') {
        return [
          {path: 'title', weight: 10, mapWith: 'lowercase'},
          {path: 'slug.current', weight: 8, mapWith: 'lowercase'},
          {path: 'portfolio.title', weight: 5, mapWith: 'lowercase'},
          {path: 'description', weight: 2, mapWith: 'lowercase'},
          {path: 'medium', weight: 1, mapWith: 'lowercase'},
          {path: 'year', weight: 1}
        ]
      }
      return prev
    },
    
    actions: (prev, { schemaType, getClient }) => {
      if (schemaType === 'portfolio') {
        return [
          ...prev,
          props => SmartDeleteAction({ ...props, getClient })
        ]
      }
      
      // Add Mux action for artworks
      if (schemaType === 'artwork') {
        return [
          ...prev,
          props => UploadToMuxAction({ ...props, getClient })
        ]
      }
      
      return prev
    }
  }
})
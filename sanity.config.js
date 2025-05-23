import {defineConfig} from 'sanity'
import {structureTool} from 'sanity/structure'
import {visionTool} from '@sanity/vision'
import {schemaTypes} from './schemaTypes'
import {colorInput} from '@sanity/color-input'

// Import the smart cascade actions
import { smartDeleteAction, smartUnpublishAction } from './cascadeActions'

console.log(process.env);
export default defineConfig({
  name: 'default',
  title: 'AlchemyRG',
  projectId: '5lwtjnp5', 
  dataset: 'production',
  token: process.env.SANITY_TOKEN,

  plugins: [structureTool(), visionTool(), colorInput()],

  schema: {
    types: schemaTypes,
  },

  // Add document actions configuration
  document: {
    actions: (prev, context) => {
      // Only modify actions for portfolio documents
      if (context.schemaType === 'portfolio') {
        return [
          // Keep all original actions except delete and unpublish
          ...prev.filter(action => action.action !== 'delete' && action.action !== 'unpublish'),
          // Add our smart actions
          smartDeleteAction,
          smartUnpublishAction
        ]
      }
      
      // For all other document types, keep original actions
      return prev
    }
  }
})
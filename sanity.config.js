import {defineConfig} from 'sanity'
import {structureTool} from 'sanity/structure'
import {visionTool} from '@sanity/vision'
import {schemaTypes} from './schemaTypes'
import {colorInput} from '@sanity/color-input'

// Import the smart cascade actions
import { createSmartDeleteAction, createSmartUnpublishAction } from './cascadeActions'

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
        return prev.map(action => {
          // Replace the default delete action with smart delete
          if (action.action === 'delete') {
            return createSmartDeleteAction(action)
          }
          // Replace the default unpublish action with smart unpublish
          if (action.action === 'unpublish') {
            return createSmartUnpublishAction(action)
          }
          // Keep all other actions as-is
          return action
        })
      }
      
      // For all other document types, keep original actions
      return prev
    }
  }
})
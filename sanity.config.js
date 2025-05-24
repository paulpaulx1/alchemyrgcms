// sanity.config.js
import { defineConfig } from 'sanity'
import { structureTool } from 'sanity/structure'
import { visionTool } from '@sanity/vision'
import { colorInput } from '@sanity/color-input'
import { schemaTypes } from './schemaTypes'
import {
  SmartMarkUnpublishAction,
  SmartClearUnpublishAction,
  SmartDeleteAction
} from './cascadeActions'

export default defineConfig({
  name:    'default',
  title:   'AlchemyRG',
  projectId: '5lwtjnp5',
  dataset: 'production',
  plugins: [structureTool(), visionTool(), colorInput()],
  schema: { types: schemaTypes },
  document: {
    actions: (prev, { schemaType, getClient }) => {
      if (schemaType === 'portfolio') {
        return [
          ...prev,
          props => SmartMarkUnpublishAction({ ...props, getClient }),
          props => SmartClearUnpublishAction({ ...props, getClient }),
          props => SmartDeleteAction({   ...props, getClient })
        ]
      }
      return prev
    }
  }
})

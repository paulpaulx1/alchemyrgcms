// sanity.config.js
import { defineConfig } from 'sanity'
import { structureTool } from 'sanity/structure'
import { visionTool } from '@sanity/vision'
import { colorInput } from '@sanity/color-input'
import { schemaTypes } from './schemaTypes'
import {
  SmartCascadePublishAction,
  SmartCascadeUnpublishAction,
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
  // Add search configuration to make artworks searchable by portfolio name
  __experimental_search: [
    {
      type: 'artwork',
      query: '*[_type == "artwork" && (title match $searchTerm || portfolio->title match $searchTerm)]'
    }
  ],
  document: {
    actions: (prev, { schemaType, getClient }) => {
      if (schemaType === 'portfolio') {
        return [
          ...prev,
          props => SmartCascadePublishAction({ ...props, getClient }),
          props => SmartCascadeUnpublishAction({ ...props, getClient }),
          props => SmartMarkUnpublishAction({ ...props, getClient }),
          props => SmartClearUnpublishAction({ ...props, getClient }),
          props => SmartDeleteAction({ ...props, getClient })
        ]
      }
      return prev
    }
  }
})
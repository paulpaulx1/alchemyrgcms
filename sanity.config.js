import {defineConfig} from 'sanity'
import {structureTool} from 'sanity/structure'
import {visionTool} from '@sanity/vision'
import {schemaTypes} from './schemaTypes'
import {colorInput} from '@sanity/color-input'


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
}) 

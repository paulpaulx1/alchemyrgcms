import {defineCliConfig} from 'sanity/cli'

export default defineCliConfig({
  api: {
    projectId: process.env.SANITY_PROJECT_ID,
    dataset: 'production'
  },
  autoUpdates: true,
  
  // Map your existing env vars to Studio format
  env: {
    development: {
      plugins: ['@sanity/vision']
    },
    production: {
      SANITY_STUDIO_MUX_TOKEN_ID: process.env.MUX_TOKEN_ID,
      SANITY_STUDIO_MUX_SECRET: process.env.MUX_TOKEN_SECRET
    }
  }
})
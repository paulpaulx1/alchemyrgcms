require('dotenv').config()
const {createClient} = require('@sanity/client')

const client = createClient({
  projectId: '5lwtjnp5',
  dataset: 'production',
  token: process.env.SANITY_TOKEN,
  apiVersion: '2023-03-01',
  useCdn: false
})

async function quickFix() {
  try {
    // Just delete the problematic draft
    await client.delete('drafts.5hhzGfeemqVyh9hcGYvega')
    console.log('✅ Deleted problematic draft')
  } catch (error) {
    console.error('Error:', error.message)
  }
}

quickFix()
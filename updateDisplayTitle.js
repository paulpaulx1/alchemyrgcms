import {createClient} from '@sanity/client'

const client = createClient({
  projectId: process.env.SANITY_PROJECT_ID,
  dataset: process.env.SANITY_DATASET || 'production',
  token: process.env.SANITY_TOKEN,
  apiVersion: '2023-03-01',
  useCdn: false
})

const query = `*[_type == "artwork" && !defined(displayTitle)]`

client.fetch(query).then(docs => {
  console.log(`Found ${docs.length} artworks to update`)
  
  const transaction = client.transaction()
  
  docs.forEach(doc => {
    transaction.patch(doc._id, {
      set: {displayTitle: true}
    })
  })
  
  return transaction.commit()
}).then(result => {
  console.log(`Successfully updated documents`)
}).catch(err => {
  console.error('Error:', err)
})
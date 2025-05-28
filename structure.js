// structure.js
import {StructureBuilder as S} from 'sanity/structure'

export default () =>
  S.list()
    .title('Content')
    .items([
      // Enhanced Portfolio section with search
      S.listItem()
        .title('Portfolios')
        .child(
          S.list()
            .title('Portfolios')
            .items([
              // All Portfolios with enhanced search
              S.listItem()
                .title('All Portfolios')
                .child(
                  S.documentTypeList('portfolio')
                    .title('All Portfolios')
                    .filter('_type == "portfolio"')
                    .child(portfolioId =>
                      S.document()
                        .documentId(portfolioId)
                        .schemaType('portfolio')
                        .views([
                          S.view.form(),
                          // Add a custom view showing artworks in this portfolio
                          S.view
                            .component(PortfolioArtworksView)
                            .title('Artworks in Portfolio')
                        ])
                    )
                ),
              
              // Parent Portfolios only
              S.listItem()
                .title('Parent Portfolios')
                .child(
                  S.documentTypeList('portfolio')
                    .title('Parent Portfolios')
                    .filter('_type == "portfolio" && !defined(parentPortfolio)')
                ),
              
              // Sub-portfolios only
              S.listItem()
                .title('Sub-portfolios')
                .child(
                  S.documentTypeList('portfolio')
                    .title('Sub-portfolios')
                    .filter('_type == "portfolio" && defined(parentPortfolio)')
                ),
            ])
        ),

      // Enhanced Artwork section
      S.listItem()
        .title('Artworks')
        .child(
          S.list()
            .title('Artworks')
            .items([
              // All Artworks with portfolio context
              S.listItem()
                .title('All Artworks')
                .child(
                  S.documentTypeList('artwork')
                    .title('All Artworks')
                    .filter('_type == "artwork"')
                ),
              
              // Artworks by Portfolio
              S.listItem()
                .title('By Portfolio')
                .child(
                  // First show list of portfolios
                  S.documentTypeList('portfolio')
                    .title('Select Portfolio')
                    .filter('_type == "portfolio"')
                    .child(portfolioId =>
                      // Then show artworks in that portfolio
                      S.documentTypeList('artwork')
                        .title('Artworks')
                        .filter('_type == "artwork" && portfolio._ref == $portfolioId')
                        .params({ portfolioId })
                    )
                ),
              
              // Unassigned Artworks
              S.listItem()
                .title('Unassigned Artworks')
                .child(
                  S.documentTypeList('artwork')
                    .title('Unassigned Artworks')
                    .filter('_type == "artwork" && !defined(portfolio)')
                ),
            ])
        ),

      // Global Search
      S.listItem()
        .title('Search All Content')
        .child(
          S.component(GlobalSearchView)
            .title('Search Portfolios & Artworks')
        ),

      // Other document types
      ...S.documentTypeListItems().filter(listItem => 
        !['portfolio', 'artwork'].includes(listItem.getId())
      )
    ])

// Custom component for showing artworks in a portfolio
function PortfolioArtworksView(props) {
  const {document} = props
  const portfolioId = document.displayed._id
  
  return (
    <div style={{padding: '20px'}}>
      <h2>Artworks in this Portfolio</h2>
      <div>
        {/* This would show a list of artworks */}
        <p>Portfolio ID: {portfolioId}</p>
        {/* You can add more complex artwork listing here */}
      </div>
    </div>
  )
}

// Custom global search component
function GlobalSearchView(props) {
  return (
    <div style={{padding: '20px'}}>
      <h2>Global Search</h2>
      <p>Search across all portfolios and artworks</p>
      {/* Add your custom search interface here */}
    </div>
  )
}
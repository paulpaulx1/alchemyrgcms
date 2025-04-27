const fs = require('fs-extra');
const path = require('path');
const { createClient } = require('@sanity/client');
const slugify = require('slugify');
require('dotenv').config();

class SanityUploader {
    constructor(config) {
        this.client = createClient({
            projectId: config.projectId,
            dataset: config.dataset,
            useCdn: false,
            token: config.token,
            apiVersion: '2021-10-21'
        });
        
        // Track created portfolios to avoid duplicates
        this.portfolioCache = {};
    }

    /**
     * Upload an image to Sanity
     * @param {string} imagePath - Path to the image file
     * @param {string} renamedFilename - New filename for the image
     * @returns {Promise<object>} Uploaded asset
     */
    async uploadImage(imagePath, renamedFilename) {
        try {
            return await this.client.assets.upload('image', fs.createReadStream(imagePath), {
                filename: renamedFilename
            });
        } catch (error) {
            console.error(`Error uploading image ${imagePath}:`, error);
            throw error;
        }
    }

    /**
     * Create a portfolio in Sanity
     * @param {string} portfolioName - Name of the portfolio
     * @param {string} parentPortfolioId - ID of the parent portfolio (optional)
     * @returns {Promise<object>} Created portfolio document
     */
    async createPortfolio(portfolioName, parentPortfolioId = null) {
        const slugifiedName = slugify(portfolioName, { lower: true });
        const cacheKey = parentPortfolioId ? `${parentPortfolioId}-${slugifiedName}` : slugifiedName;
        
        // Check cache first
        if (this.portfolioCache[cacheKey]) {
            return this.portfolioCache[cacheKey];
        }

        // Check if portfolio already exists
        const existingPortfolio = await this.client.fetch(
            `*[_type == "portfolio" && slug.current == $slug][0]`,
            { slug: slugifiedName }
        );

        // If portfolio exists, cache and return it
        if (existingPortfolio) {
            this.portfolioCache[cacheKey] = existingPortfolio;
            return existingPortfolio;
        }

        // Prepare portfolio data
        const portfolioData = {
            _type: 'portfolio',
            title: portfolioName,
            slug: {
                _type: 'slug',
                current: slugifiedName
            },
            description: `Portfolio: ${portfolioName}`
        };

        // Add parent reference if provided
        if (parentPortfolioId) {
            portfolioData.parentPortfolio = {
                _type: 'reference',
                _ref: parentPortfolioId
            };
        }

        try {
            // Create portfolio
            const newPortfolio = await this.client.create(portfolioData);
            // Cache the created portfolio
            this.portfolioCache[cacheKey] = newPortfolio;
            return newPortfolio;
        } catch (error) {
            console.error(`Error creating portfolio ${portfolioName}:`, error);
            throw error;
        }
    }

    /**
     * Process directory structure recursively
     * @param {string} basePath - Base path to processed directory
     * @param {string} outputPath - Path to save renamed images
     */
    async processDirectoryStructure(basePath, outputPath) {
        const hqPath = path.join(basePath, 'hq');
        const lqPath = path.join(basePath, 'lq');

        // Ensure output path exists
        fs.ensureDirSync(outputPath);

        if (!fs.existsSync(hqPath) || !fs.existsSync(lqPath)) {
            throw new Error(`HQ or LQ directory not found in ${basePath}`);
        }

        // Track portfolios and artworks
        const uploadResults = {
            portfolios: [],
            artworks: [],
            failed: []
        };

        // Start recursive processing from root directories
        await this.processDirectory(hqPath, lqPath, null, outputPath, '', uploadResults);

        // Summary
        console.log('\n--- Upload Summary ---');
        console.log(`Portfolios created: ${uploadResults.portfolios.length}`);
        console.log(`Artworks created: ${uploadResults.artworks.length}`);
        console.log(`Failed items: ${uploadResults.failed.length}`);

        return uploadResults;
    }

    /**
     * Process a directory recursively
     * @param {string} hqDir - Current HQ directory
     * @param {string} lqDir - Current LQ directory
     * @param {string} parentPortfolioId - Parent portfolio ID
     * @param {string} outputBaseDir - Base output directory
     * @param {string} relativePath - Relative path from base directory
     * @param {object} results - Results object to track progress
     */
    async processDirectory(hqDir, lqDir, parentPortfolioId, outputBaseDir, relativePath, results) {
        console.log(`Processing directory: ${relativePath || 'root'}`);
        
        try {
            // Get directory contents
            const hqContents = fs.readdirSync(hqDir);
            
            // Create portfolio for this directory (if not root)
            let currentPortfolioId = parentPortfolioId;
            
            if (relativePath) {
                const portfolioName = path.basename(relativePath);
                const portfolio = await this.createPortfolio(portfolioName, parentPortfolioId);
                currentPortfolioId = portfolio._id;
                results.portfolios.push(portfolio);
                console.log(`Created/found portfolio: ${portfolioName} (${portfolio._id})`);
            }
            
            // Create output directory
            const currentOutputDir = path.join(outputBaseDir, relativePath);
            fs.ensureDirSync(currentOutputDir);
            
            // Process all items in the directory
            for (const item of hqContents) {
                const hqItemPath = path.join(hqDir, item);
                const lqItemPath = path.join(lqDir, item);
                const newRelativePath = relativePath ? path.join(relativePath, item) : item;
                
                if (fs.statSync(hqItemPath).isDirectory()) {
                    // Check if corresponding LQ directory exists
                    if (fs.existsSync(lqItemPath) && fs.statSync(lqItemPath).isDirectory()) {
                        // Process subdirectory recursively
                        await this.processDirectory(
                            hqItemPath,
                            lqItemPath,
                            currentPortfolioId,
                            outputBaseDir,
                            newRelativePath,
                            results
                        );
                    } else {
                        console.warn(`Skipping directory ${item}: No matching LQ directory`);
                    }
                } else if (this.isImageFile(item)) {
                    // Process image file
                    await this.processImageFile(
                        hqItemPath,
                        lqDir,
                        item,
                        currentPortfolioId,
                        currentOutputDir,
                        results
                    );
                }
            }
        } catch (error) {
            console.error(`Error processing directory ${relativePath}:`, error);
            results.failed.push(relativePath);
        }
    }

    /**
     * Process a single image file
     * @param {string} hqFilePath - Path to HQ image
     * @param {string} lqDir - LQ directory path
     * @param {string} filename - Image filename
     * @param {string} portfolioId - Portfolio ID
     * @param {string} outputDir - Output directory
     * @param {object} results - Results object
     */
    async processImageFile(hqFilePath, lqDir, filename, portfolioId, outputDir, results) {
        try {
            // Find corresponding LQ file
            const baseFileName = path.parse(filename);
            const lqFile = fs.readdirSync(lqDir)
                .find(file => path.parse(file).name === baseFileName.name);

            if (!lqFile) {
                console.warn(`No LQ image found for ${filename}`);
                return;
            }

            const lqFilePath = path.join(lqDir, lqFile);

            // Prepare renamed filenames
            const hqRenamedFile = `${baseFileName.name}-hq${baseFileName.ext}`;
            const lqRenamedFile = `${baseFileName.name}-lq${path.parse(lqFile).ext}`;

            // Copy and rename files to output directory
            const hqOutputPath = path.join(outputDir, hqRenamedFile);
            const lqOutputPath = path.join(outputDir, lqRenamedFile);
            
            fs.copyFileSync(hqFilePath, hqOutputPath);
            fs.copyFileSync(lqFilePath, lqOutputPath);

            // Upload image assets
            const hqAsset = await this.uploadImage(hqOutputPath, hqRenamedFile);
            const lqAsset = await this.uploadImage(lqOutputPath, lqRenamedFile);

            // Prepare artwork data
            const artworkName = baseFileName.name;
            const slugifiedName = slugify(artworkName, { lower: true });

            const artworkData = {
                _type: 'artwork',
                title: artworkName,
                slug: {
                    _type: 'slug',
                    current: slugifiedName
                },
                portfolio: {
                    _type: 'reference',
                    _ref: portfolioId
                },
                mediaType: 'image',
                image: {
                    _type: 'image',
                    asset: {
                        _type: 'reference',
                        _ref: hqAsset._id
                    }
                },
                lowResImage: {
                    _type: 'image',
                    asset: {
                        _type: 'reference',
                        _ref: lqAsset._id
                    }
                }
            };

            // Create artwork
            const createdArtwork = await this.client.create(artworkData);
            console.log(`Created artwork: ${artworkName} in portfolio ${portfolioId}`);
            results.artworks.push(createdArtwork);
        } catch (error) {
            console.error(`Error processing image ${filename}:`, error);
            results.failed.push(filename);
        }
    }

    /**
     * Check if a file is an image
     * @param {string} filename - Name of the file
     * @returns {boolean} True if the file is an image
     */
    isImageFile(filename) {
        const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'];
        return imageExtensions.some(ext => 
            filename.toLowerCase().endsWith(ext)
        );
    }
}

// Main execution function
async function main() {
    // Use environment variables or default values
    const config = {
        projectId: process.env.SANITY_PROJECT_ID || '5lwtjnp5',
        dataset: process.env.SANITY_DATASET || 'production',
        token: process.env.SANITY_TOKEN
    };

    // Validate token
    if (!config.token) {
        console.error('ERROR: No Sanity token provided. Set SANITY_TOKEN in .env file.');
        process.exit(1);
    }

    // Paths for input and output
    const basePath = path.join(process.cwd(), 'rg-processed');
    const outputPath = path.join(process.cwd(), 'processed-images');

    // Initialize uploader
    const uploader = new SanityUploader(config);

    // Process directory
    try {
        console.log('Starting upload process...');
        console.log(`Base path: ${basePath}`);
        console.log(`Output path: ${outputPath}`);

        await uploader.processDirectoryStructure(basePath, outputPath);
        console.log('Upload completed successfully!');
    } catch (error) {
        console.error('Upload failed:', error);
        process.exit(1);
    }
}

// Run the main function
main();

module.exports = SanityUploader;
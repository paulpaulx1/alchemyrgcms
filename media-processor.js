const fs = require('fs-extra');
const path = require('path');
const { execSync } = require('child_process');
const { google } = require('googleapis');
const { authenticate } = require('@google-cloud/local-auth');
const readline = require('readline-sync');
const slugify = require('slugify');
const sanityClient = require('@sanity/client');
require('dotenv').config();

const os = require('os');
// Configuration
const CONFIG = {
  // Paths
  rootDir: path.join(os.homedir(), 'Desktop', 'Fear Backup'), // Root directory to scan
  outputDir: path.join(__dirname, 'processed'), // Directory for processed files
  credentialsPath: path.join(__dirname, 'client_secret.json'), // Google API credentials
  
  // Image processing
  highResMaxWidth: 1500,
  highResQuality: 85,
  lowResMaxWidth: 400,
  lowResQuality: 60,
  
  // YouTube
  youtubeScopes: ['https://www.googleapis.com/auth/youtube.upload'],
  defaultPrivacyStatus: 'unlisted',
  
  // Sanity
  sanity: {
    projectId: process.env.SANITY_PROJECT_ID,
    dataset: process.env.SANITY_DATASET || 'production',
    token: process.env.SANITY_TOKEN,
    apiVersion: '2023-03-01'
  }
};

// Initialize Sanity client
const { createClient } = require('@sanity/client');
const sanity = createClient(CONFIG.sanity);

// Map to track portfolio paths to Sanity IDs
const portfolioMap = {};

// Process images (convert HEIC, create high/low res)
async function processImage(imagePath, relativePath) {
  try {
    const ext = path.extname(imagePath).toLowerCase();
    const filename = path.basename(imagePath, ext);
    const dirPath = path.dirname(imagePath);
    const relativeDir = path.dirname(relativePath);
    
    // Create output directories
    const outputHighDir = path.join(CONFIG.outputDir, 'hq', relativeDir);
    const outputLowDir = path.join(CONFIG.outputDir, 'lq', relativeDir);
    fs.ensureDirSync(outputHighDir);
    fs.ensureDirSync(outputLowDir);
    
    // Set paths for processed files
    const highResPath = path.join(outputHighDir, `${filename}.jpg`);
    const lowResPath = path.join(outputLowDir, `${filename}.jpg`);
    
    // If HEIC file, convert to JPG first
    let sourcePath = imagePath;
    if (ext === '.heic') {
      const tempPath = path.join(dirPath, `${filename}_temp.jpg`);
      execSync(`convert "${imagePath}" "${tempPath}"`);
      sourcePath = tempPath;
    }
    
    // Create high-res version
    execSync(`convert "${sourcePath}" -resize ${CONFIG.highResMaxWidth}x${CONFIG.highResMaxWidth}\\> -quality ${CONFIG.highResQuality} "${highResPath}"`);
    
    // Create low-res version
    execSync(`convert "${sourcePath}" -resize ${CONFIG.lowResMaxWidth}x${CONFIG.lowResMaxWidth}\\> -quality ${CONFIG.lowResQuality} "${lowResPath}"`);
    
    // Clean up temp file if needed
    if (ext === '.heic' && sourcePath !== imagePath) {
      fs.removeSync(sourcePath);
    }
    
    console.log(`Processed image: ${relativePath}`);
    
    return {
      original: imagePath,
      relativePath,
      highRes: highResPath,
      lowRes: lowResPath,
      title: filename // Use filename as title
    };
  } catch (error) {
    console.error(`Error processing image ${imagePath}:`, error);
    return null;
  }
}

// Upload video to YouTube
async function uploadVideo(auth, videoPath, relativePath) {
  try {
    const youtube = google.youtube({version: 'v3', auth});
    const filename = path.basename(videoPath, path.extname(videoPath));
    
    // Use filename as title and description
    const title = filename;
    const description = `Video: ${filename}`;
    
    // Set up video metadata
    const requestBody = {
      snippet: {
        title,
        description,
        tags: []
      },
      status: {
        privacyStatus: CONFIG.defaultPrivacyStatus
      }
    };
    
    // Set up media
    const media = {
      body: fs.createReadStream(videoPath)
    };
    
    console.log(`Uploading video to YouTube: ${relativePath}`);
    
    // Execute upload
    const response = await youtube.videos.insert({
      part: 'snippet,status',
      requestBody,
      media
    });
    
    console.log(`Video uploaded! Video ID: ${response.data.id}`);
    
    return {
      videoId: response.data.id,
      title,
      description,
      youtubeUrl: `https://www.youtube.com/watch?v=${response.data.id}`,
      thumbnailUrl: `https://img.youtube.com/vi/${response.data.id}/maxresdefault.jpg`
    };
  } catch (error) {
    console.error(`Error uploading video ${videoPath}:`, error);
    return null;
  }
}

// Upload image to Sanity
async function uploadImageToSanity(imagePath, filename) {
  try {
    const asset = await sanity.assets.upload('image', fs.createReadStream(imagePath), {
      filename
    });
    return asset._id;
  } catch (error) {
    console.error(`Error uploading image to Sanity: ${imagePath}`, error);
    return null;
  }
}

// Create a document in Sanity
async function createSanityDocument(data) {
  try {
    return await sanity.create(data);
  } catch (error) {
    console.error('Error creating Sanity document:', error);
    return null;
  }
}

// Get or create portfolio in Sanity
async function getOrCreatePortfolio(folderPath, parentPortfolioId) {
  // Check if we already have this portfolio
  if (portfolioMap[folderPath]) {
    return portfolioMap[folderPath];
  }
  
  const folderName = path.basename(folderPath);
  
  // Check if portfolio exists in Sanity
  let portfolio = await sanity.fetch(
    `*[_type == "portfolio" && title == $title][0]`,
    { title: folderName }
  );
  
  if (!portfolio) {
    // Create new portfolio
    const portfolioData = {
      _type: 'portfolio',
      title: folderName,
      slug: {
        _type: 'slug',
        current: slugify(folderName, { lower: true })
      }
    };
    
    // Add parent reference if provided
    if (parentPortfolioId) {
      portfolioData.parentPortfolio = {
        _type: 'reference',
        _ref: parentPortfolioId
      };
    }
    
    portfolio = await createSanityDocument(portfolioData);
    console.log(`Created portfolio: ${folderName}`);
  }
  
  // Store in cache
  portfolioMap[folderPath] = portfolio._id;
  
  return portfolio._id;
}

// Process a directory
async function processDirectory(dirPath, parentPath = '', parentPortfolioId = null) {
  const items = fs.readdirSync(dirPath);
  
  // First, get or create portfolio for this directory
  const relativePath = path.join(parentPath, path.basename(dirPath));
  const portfolioId = await getOrCreatePortfolio(relativePath, parentPortfolioId);
  
  const processedImages = [];
  const processedVideos = [];
  
  // Process all items in the directory
  for (const item of items) {
    const itemPath = path.join(dirPath, item);
    const itemRelativePath = path.join(relativePath, item);
    const stat = fs.statSync(itemPath);
    
    if (stat.isDirectory()) {
      // Recursively process subdirectory
      await processDirectory(itemPath, relativePath, portfolioId);
    } else {
      // Process file
      const ext = path.extname(itemPath).toLowerCase();
      
      // Image processing
      if (['.jpg', '.jpeg', '.png', '.webp', '.heic'].includes(ext)) {
        const processedImage = await processImage(itemPath, itemRelativePath);
        if (processedImage) {
          processedImages.push(processedImage);
        }
      }
      
      // Video processing (mark for later upload)
      if (['.mp4', '.mov', '.avi', '.webm', '.mkv'].includes(ext)) {
        processedVideos.push({
          path: itemPath,
          relativePath: itemRelativePath,
          portfolioId,
          title: path.basename(itemPath, ext)
        });
      }
    }
  }
  
  // Handle video uploads and Sanity creation for this directory
    // Process images in Sanity
    for (const image of processedImages) {
      // Upload images to Sanity
      console.log(`Uploading images to Sanity: ${image.relativePath}`);
      const highResAssetId = await uploadImageToSanity(image.highRes, `${image.title}-high.jpg`);
      const lowResAssetId = await uploadImageToSanity(image.lowRes, `${image.title}-low.jpg`);
      
      if (highResAssetId && lowResAssetId) {
        // Create artwork document
        const artworkData = {
          _type: 'artwork',
          title: image.title,
          slug: {
            _type: 'slug',
            current: slugify(image.title, { lower: true })
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
              _ref: highResAssetId
            }
          },
          lowResImage: {
            _type: 'image',
            asset: {
              _type: 'reference',
              _ref: lowResAssetId
            }
          }
        };
        
        const result = await createSanityDocument(artworkData);
        console.log(`Created artwork document: ${image.title}`);
      }
    }
  
  
  return {
    portfolioId,
    processedVideos
  };
}

// Main function
async function main() {
  try {
    // Create output directory
    fs.ensureDirSync(CONFIG.outputDir);
    fs.ensureDirSync(path.join(CONFIG.outputDir, 'hq'));
    fs.ensureDirSync(path.join(CONFIG.outputDir, 'lq'));
    
    // Process all directories and files
    console.log('Starting directory processing...');
    const { processedVideos } = await processDirectory(CONFIG.rootDir);
    
    // Upload videos to YouTube if there are any
    if (processedVideos.length > 0) {
      console.log(`\nFound ${processedVideos.length} videos to upload`);
      
      // Authenticate with YouTube
      console.log('Authenticating with YouTube...');
      const auth = await authenticate({
        keyfilePath: CONFIG.credentialsPath,
        scopes: CONFIG.youtubeScopes
      });
      
      // Process each video
      for (const video of processedVideos) {
        const uploadResult = await uploadVideo(auth, video.path, video.relativePath);
        
        if (uploadResult) {
          // Create artwork document
          const artworkData = {
            _type: 'artwork',
            title: video.title,
            slug: {
              _type: 'slug',
              current: slugify(video.title, { lower: true })
            },
            portfolio: {
              _type: 'reference',
              _ref: video.portfolioId
            },
            mediaType: 'video',
            videoUrl: uploadResult.youtubeUrl
          };
          
          const result = await createSanityDocument(artworkData);
          console.log(`Created video artwork document: ${video.title}`);
        }
      }
    }
    
    console.log('\nProcess completed successfully!');
  } catch (error) {
    console.error('Error in main process:', error);
  }
}

// Run the main function
main();
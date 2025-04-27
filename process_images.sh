#!/bin/bash

# Define source and destination directories
SOURCE_FOLDER="$HOME/Desktop/rg-alchemy-assets"
OUTPUT_FOLDER="$HOME/Desktop/rg-processed"

# Display info about directories
echo "Source folder: $SOURCE_FOLDER"
echo "Output folder: $OUTPUT_FOLDER"

# Check if source directory exists
if [ ! -d "$SOURCE_FOLDER" ]; then
  echo "ERROR: Source directory doesn't exist!"
  exit 1
fi

# Count files to process
file_count=$(find "$SOURCE_FOLDER" -type f)
echo "Found $file_count image files to process"

# Create output directories
mkdir -p "$OUTPUT_FOLDER/hq" "$OUTPUT_FOLDER/lq"

# Process image files - now including heic
find "$SOURCE_FOLDER" -type f | while read file; do
  # Get filename without path and extension
  filename=$(basename "$file")
  name="${filename%.*}"
  extension="${filename##*.}"
  extension_lower=$(echo "$extension" | tr '[:upper:]' '[:lower:]')
  
  # Get relative directory structure
  rel_dir=$(dirname "${file#$SOURCE_FOLDER/}")
  
  # Create output directories if they don't exist
  mkdir -p "$OUTPUT_FOLDER/hq/$rel_dir" "$OUTPUT_FOLDER/lq/$rel_dir"
  
  echo "Processing: $file"
  
  # Handle HEIC files differently
  if [ "$extension_lower" = "heic" ]; then
    echo "Converting HEIC file to JPG first..."
    # Convert HEIC to temporary JPG first
    convert "$file" "${file%.heic}.tmp.jpg" || echo "ERROR: Failed to convert HEIC to JPG"
    
    # Then process the temporary file
    convert "${file%.heic}.tmp.jpg" -resize 1500x1500\> -strip -quality 82 "$OUTPUT_FOLDER/hq/$rel_dir/$name.jpg" || echo "ERROR: Failed to create HQ version" 
    convert "${file%.heic}.tmp.jpg" -resize 400x400\> -strip -quality 60 "$OUTPUT_FOLDER/lq/$rel_dir/$name.jpg" || echo "ERROR: Failed to create LQ version"
    
    # Remove temporary file
    rm "${file%.heic}.tmp.jpg"
  else
    # Process regular image files
    convert "$file" -resize 1500x1500\> -strip -quality 82 "$OUTPUT_FOLDER/hq/$rel_dir/$name.jpg" || echo "ERROR: Failed to create HQ version"
    convert "$file" -resize 400x400\> -strip -quality 60 "$OUTPUT_FOLDER/lq/$rel_dir/$name.jpg" || echo "ERROR: Failed to create LQ version"
  fi
  
  echo "Processed: $file"
done

# Count processed files
hq_count=$(find "$OUTPUT_FOLDER/hq" -type f | wc -l)
lq_count=$(find "$OUTPUT_FOLDER/lq" -type f | wc -l)
echo "Created $hq_count high-quality images and $lq_count low-quality images"

echo "All images processed. High-quality and low-quality versions are in $OUTPUT_FOLDER"
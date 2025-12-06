# Puter.js Integration for Image Generation

This document explains the changes made to replace Runware with Puter.js for image generation in the D&D character creation application.

## Overview

The application has been updated to use Puter.js for client-side image generation with the Nano Banana model instead of the previous Runware API integration. This change enables the User-Pays model where users cover their own image generation costs.

## Changes Made

### 1. Server-Side Changes (`app/services/gemini.server.ts`)

- **Removed Runware dependencies**: Removed `RUNWARE_API_KEY` environment variable and related imports
- **Added Puter.js preparation functions**: 
  - `preparePuterPrompt()` - Cleans and formats prompts for Puter.js
  - `prepareImageGeneration()` - Prepares image generation configuration
  - `generateImageWithPuter()` - Client-side generation function
- **Updated image generation functions**:
  - `generateMapImage()` - Now returns configuration for client-side generation
  - `generateCharacterPawn()` - Now returns configuration for client-side generation  
  - `generateCharacterPortrait()` - Now returns configuration for client-side generation

### 2. Client-Side Changes (`app/services/puter.client.ts` - NEW FILE)

- **Puter.js loading**: `ensurePuterLoaded()` dynamically loads Puter.js script
- **Image generation**: `generateImageWithPuter()` handles client-side image generation
- **Character-specific functions**:
  - `generateCharacterPortrait()` - Generates character portraits
  - `generateCharacterPawn()` - Generates character pawns
  - `generateMapImage()` - Generates adventure maps
- **Image conversion**: `convertImageToBase64()` converts images to base64 for saving

### 3. API Route Updates (`app/routes/api.character.portrait.generate.tsx`)

- **Added base64 support**: Now accepts `portraitBase64` from client-side generation
- **Dual-mode operation**: Supports both client-side and server-side generation
- **Fallback mechanism**: Falls back to server-side generation if client-side fails

### 4. Component Updates (`app/components/NewCharacterForm.tsx`)

- **Client-side generation**: `handleGeneratePortrait()` now uses Puter.js
- **Fallback support**: Falls back to server-side generation on error
- **Dynamic imports**: Imports Puter.js client functions dynamically

### 5. Type Definitions (`app/types.ts`)

- **Fixed weapons type**: Added missing `secondary` weapon property

## How It Works

### Image Generation Flow

1. **User requests image generation** (portrait, pawn, or map)
2. **Server prepares configuration** using `prepareImageGeneration()`
3. **Client loads Puter.js** (if not already loaded)
4. **Client generates image** using `generateImageWithPuter()`
5. **Image converted to base64** for saving to server
6. **Server saves image** to character data

### Benefits of Puter.js

- **User-Pays Model**: Users cover their own image generation costs
- **No Server Costs**: No need to pay for image generation API usage
- **Scalability**: Application can scale to unlimited users at no cost
- **Advanced Features**: Access to Nano Banana and Nano Banana Pro models
- **Client-Side Processing**: Reduces server load

## Models Available

### Nano Banana (Gemini 2.5 Flash Image)
- **Use Case**: Low-latency, quick image generation
- **Best For**: Experimentation and iteration
- **Model ID**: `gemini-2.5-flash-image-preview`

### Nano Banana Pro (Gemini 3 Pro Image)
- **Use Case**: High-quality text generation and detailed images
- **Best For**: Professional-quality portraits and detailed artwork
- **Model ID**: `google/gemini-3-pro-image`

## Setup Requirements

### Environment Variables
- `GEMINI_API_KEY` - Required for AI text generation (scenarios, character details)
- No longer requires `RUNWARE_API_KEY`

### Client-Side Script
Puter.js is loaded dynamically from: `https://js.puter.com/v2/`

## Usage Examples

### Basic Image Generation
```javascript
import { generateImageWithPuter } from '~/services/puter.client';

const base64Image = await generateImageWithPuter("A fantasy character portrait", {
  model: 'gemini-2.5-flash-image-preview',
  width: 1024,
  height: 1024
});
```

### Character Portrait Generation
```javascript
import { generateCharacterPortrait } from '~/services/puter.client';

const base64Image = await generateCharacterPortrait(character, {
  width: 1024,
  height: 1024,
  model: 'gemini-2.5-flash-image-preview'
});
```

## Demo

A demo HTML file (`puter-demo.html`) is included to showcase Puter.js functionality:
- Load the file in a browser
- Enter a prompt and configure settings
- Generate images using the Nano Banana model
- View the generated image and base64 data in console

## Migration Notes

### From Runware to Puter.js

1. **Remove Runware API Key**: No longer needed in environment variables
2. **Update Image Generation Calls**: Use new Puter.js client functions
3. **Handle Base64 Images**: Images are now returned as base64 strings
4. **Client-Side Loading**: Puter.js loads dynamically in the browser

### Error Handling

The system includes fallback mechanisms:
- If Puter.js fails to load, falls back to server-side generation
- If client-side generation fails, falls back to server-side generation
- Comprehensive error logging and user feedback

## Performance Considerations

- **Client-Side Processing**: Reduces server load and costs
- **Dynamic Loading**: Puter.js loads only when needed
- **Image Size**: Base64 images can be large; consider compression
- **Network Usage**: Images generated in-browser, no external API calls

## Future Enhancements

- **Image Compression**: Add compression for base64 images
- **Caching**: Cache generated images to avoid regeneration
- **Progress Indicators**: Show generation progress to users
- **Multiple Models**: Support for additional Puter.js models
- **Batch Generation**: Generate multiple images simultaneously

## Troubleshooting

### Common Issues

1. **Puter.js Not Loading**
   - Check internet connection
   - Verify script URL: `https://js.puter.com/v2/`
   - Check browser console for errors

2. **Image Generation Fails**
   - Check prompt format
   - Verify model availability
   - Check for NSFW content filters

3. **Base64 Conversion Issues**
   - Ensure image element is valid
   - Check canvas size limitations
   - Verify browser support

### Debug Mode

Enable debug logging by setting:
```javascript
console.log('[PUTER] Debug mode enabled');
```

## Support

For issues with Puter.js integration:
1. Check the demo file for working examples
2. Review browser console for errors
3. Verify Puter.js script loading
4. Check network requests and responses
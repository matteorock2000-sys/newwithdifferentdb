/*
// Client-side Puter.js image generation service
// This file contains functions that will be called from the browser

declare global {
  interface Window {
    puter?: any;
  }
}

// Ensure Puter.js is loaded
export async function ensurePuterLoaded(): Promise<void> {
  // Check if Puter.js is already loaded
  if (window.puter) {
    return;
  }

  // Create script element for Puter.js
  const script = document.createElement('script');
  script.src = 'https://js.puter.com/v2/';
  script.async = true;
  
  return new Promise((resolve, reject) => {
    script.onload = () => {
      console.log('Puter.js loaded successfully');
      resolve();
    };
    
    script.onerror = () => {
      console.error('Failed to load Puter.js');
      reject(new Error('Failed to load Puter.js'));
    };
    
    document.head.appendChild(script);
  });
}

// Generate image using Puter.js
export async function generateImageWithPuter(
  prompt: string, 
  options: { 
    model?: string; 
    width?: number; 
    height?: number;
    disableSafetyChecker?: boolean;
  } = {}
): Promise<string> {
  const { 
    model = 'gemini-2.5-flash-image-preview', 
    width = 1024, 
    height = 1024,
    disableSafetyChecker = true
  } = options;

  try {
    // Ensure Puter.js is loaded
    await ensurePuterLoaded();

    if (!window.puter || !window.puter.ai) {
      throw new Error('Puter.js is not properly loaded');
    }

    console.log('Generating image with Puter.js:', { prompt, model, width, height });

    // Generate image using Puter.js
    const imageElement = await window.puter.ai.txt2img(prompt, {
      model,
      width,
      height,
      disable_safety_checker: disableSafetyChecker
    });

    if (!imageElement || !(imageElement instanceof HTMLImageElement)) {
      throw new Error('Puter.js did not return a valid image element');
    }

    // Convert image to base64
    const base64 = await convertImageToBase64(imageElement);
    
    console.log('Image generated successfully, base64 length:', base64.length);
    
    return base64;

  } catch (error) {
    console.error('Error generating image with Puter.js:', error);
    // Don't throw error, return empty string to trigger fallback
    return '';
  }
}

// Convert image element to base64
function convertImageToBase64(imageElement: HTMLImageElement): Promise<string> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    canvas.width = imageElement.width;
    canvas.height = imageElement.height;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      reject(new Error('Could not get canvas context'));
      return;
    }
    
    try {
      ctx.drawImage(imageElement, 0, 0);
      const dataURL = canvas.toDataURL('image/jpeg', 0.85);
      // Remove the data:image/jpeg;base64, prefix
      const base64 = dataURL.split(',')[1];
      resolve(base64);
    } catch (error) {
      reject(new Error(`Failed to convert image to base64: ${error instanceof Error ? error.message : 'Unknown error'}`));
    }
  });
}

// Save image to server using Puter's storage (if needed)
export async function saveImageToServer(base64Image: string, filename: string): Promise<string> {
  try {
    // This would save the image to your server
    // For now, we'll just return the base64 data
    console.log('Image saved to server:', filename);
    return base64Image;
  } catch (error) {
    console.error('Error saving image to server:', error);
    throw new Error(`Failed to save image to server: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Generate and save character portrait
export async function generateCharacterPortrait(
  character: { race: string; class: string; level: number; alignment: string; background: string; appearance?: string; armor?: string; equipment?: string[]; weapons?: { primary?: { name?: string }; secondary?: { name?: string }; ranged?: { name?: string } }; personality?: { trait?: string; ideal?: string; bond?: string; flaw?: string } },
  options: { 
    model?: string; 
    width?: number; 
    height?: number;
  } = {}
): Promise<string> {
  const characterDescription = `A Dungeons & Dragons character portrait, 2D digital art, front-facing bust shot, direct eye contact, highly detailed fantasy illustration.

Character Details:
- Race: ${character.race}, Class: ${character.class}, Level: ${character.level}
- Alignment: ${character.alignment}, Background: ${character.background}
- Appearance: ${character.appearance || 'No specific appearance details'}
- Armor & Equipment: ${character.armor || 'standard'}${character.equipment && character.equipment.length > 0 ? `, ${character.equipment.join(', ')}` : ''}
- Weapons: Primary: ${character.weapons?.primary?.name || 'none'}, Secondary: ${character.weapons?.secondary?.name || 'none'}, Ranged: ${character.weapons?.ranged?.name || 'none'}
- Personality: Trait: ${character.personality?.trait || 'none'}, Ideal: ${character.personality?.ideal || 'none'}, Bond: ${character.personality?.bond || 'none'}, Flaw: ${character.personality?.flaw || 'none'}
- Visual Style: ${character.class} with ${character.class === 'Wizard' ? 'arcane symbols and magical aura' : character.class === 'Cleric' ? 'holy symbol and divine light' : character.class === 'Rogue' ? 'stealthy clothing and daggers' : character.class === 'Fighter' ? 'battle-worn armor and weapons' : 'class-appropriate visual elements'}

Art Direction: Professional fantasy character portrait, neutral expression, detailed facial features, vibrant colors, dramatic lighting, parchment background texture.`;

  const positivePrompt = `
    "fantasy character portrait," "RPG avatar," "2D digital art," "bust shot," "front view," "high detail," "fantasy illustration," "concept art,"
    Character: ${characterDescription}.
    Neutral expression, direct eye contact, detailed lighting, vibrant colors, dramatic composition.
  `;

  return generateImageWithPuter(positivePrompt, {
    ...options,
    model: options.model || 'gemini-2.5-flash-image-preview',
    width: options.width || 1024,
    height: options.height || 1024
  });
}

// Generate and save character pawn
export async function generateCharacterPawn(
  character: { race: string; class: string; appearance?: string; armor?: string; weapons?: { primary?: { name?: string } } },
  options: { 
    model?: string; 
    width?: number; 
    height?: number;
  } = {}
): Promise<string> {
  const characterDescription = `A Dungeons & Dragons character, 3D render, middle-body statue style, front-facing portrait, highly detailed. 
  Race: ${character.race}. Class: ${character.class}. 
  ${character.appearance ? `Appearance: ${character.appearance}.` : ''}
  Consider their armor: ${character.armor || 'standard'}, and weapons: ${character.weapons?.primary?.name || 'none'}.`;

  const positivePrompt = `
    "fantasy character," "RPG pawn," "3D statue render," "middle-body shot," "front view," "high detail," "unreal engine," "octane render,"
    Character: ${characterDescription}.
    Detailed background features.
  `;

  return generateImageWithPuter(positivePrompt, {
    ...options,
    model: options.model || 'gemini-2.5-flash-image-preview',
    width: options.width || 512,
    height: options.height || 512
  });
}

// Generate and save map image
export async function generateMapImage(
  scenario: { title: string; surrounding: string; objective: string; mapDescription: string },
  options: { 
    model?: string; 
    width?: number; 
    height?: number;
  } = {}
): Promise<string> {
  const positivePrompt = `
    "fantasy map," "cartography," "tabletop RPG," "parchment texture," "top-down view," "satellite view,"
    Scenario: ${scenario.title}.
    Environment: ${scenario.surrounding}.
    Objective: ${scenario.objective}.
    Map Details: ${scenario.mapDescription}.
    high detailed multiple places. surrounding towns and buildings, highlight the map locations start point and objective located in the map with guide.
  `;

  return generateImageWithPuter(positivePrompt, {
    ...options,
    model: options.model || 'gemini-2.5-flash-image-preview',
    width: options.width || 1344,
    height: options.height || 768
  });
}
*/
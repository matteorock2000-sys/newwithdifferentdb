import { json, LoaderFunction, ActionFunction, redirect } from "@remix-run/node";
import { useLoaderData, useFetcher, Link } from "@remix-run/react";
import { useState, useEffect } from "react";
import { requireUser } from "~/services/auth.server";
import { getCharactersForUser, saveCharacter, deleteCharacter, findNextAvailableSlot, saveTemporaryPartySetup } from "~/services/db.server";
import type { Character, User, PlayerSlot, PlayerSlotType } from "~/types";
import CharacterSelector from "~/components/CharacterSelector";
import CharacterImporter from "~/components/CharacterImporter";
import PlayerSetupSlot from "~/components/PlayerSetupSlot";
import NewCharacterForm from "~/components/NewCharacterForm";
import { DND_5E_CHARACTERS } from "~/data/dnd";
import { createRandomLevel3Character } from "~/data/randomizerData";
// REMOVED: import { getSession, commitSession } from "~/sessions";
import { logger } from "~/utils/logger";
import { showToast } from "~/utils/toast"; 

// REMOVED AI IMPORTS: generateCharacterFeatures, generateCharacterPersonality, parseCharacterText

interface LoaderData {
  user: User;
  characters: Character[];
}

/**
 * Helper function to generate a complete character object from scratch using Gemini.
 * REMOVED: This function is now obsolete as we are using local randomization.
 */
/*
async function generateCompleteCharacter(cClass: string, cRace: string, cBackground: string): Promise<Omit<Character, 'userId' | 'slotIndex'>> {
    
    const features = await generateCharacterFeatures(cClass, cRace, cBackground);
    const personality = await generateCharacterPersonality(cClass, cRace, cBackground);

    const fullPrompt = `Generate a complete D&D 5e character sheet in JSON format for a Level 3 character. 
    Race: ${cRace}, Class: ${cClass}, Background: ${cBackground}. 
    Ensure all fields are populated, including rolling 4d6 drop lowest for stats, calculating derived stats (HP, AC, Initiative, Proficiency Bonus +2), and generating appropriate equipment, features, personality (trait, ideal, bond, flaw), and appearance.
    Use the features generated: [${features.join(', ')}] and personality: ${JSON.stringify(personality)}.
    Return ONLY the JSON object adhering strictly to the Character type definition.`;

    const characterText = await parseCharacterText(fullPrompt);
    
    let parsedCharacter: Omit<Character, 'userId' | 'slotIndex'> = JSON.parse(characterText.trim());
    
    if (!parsedCharacter.id) {
        parsedCharacter.id = crypto.randomUUID();
    }

    if (!parsedCharacter.level) parsedCharacter.level = 3;
    if (!parsedCharacter.proficiencyBonus) parsedCharacter.proficiencyBonus = 2;
    
    return parsedCharacter;
}
*/


export const loader: LoaderFunction = async ({ request }) => {
  const user = await requireUser(request);
  const characters = await getCharactersForUser(user.id);
  
  const validCharacters = characters.filter((c): c is Character => c !== null).map(char => {
    logger.debug(`[INDEX LOADER] Processing character: ${char.name}, original avatarUrl present: ${!!char.avatarUrl}`);
    // If avatarUrl is a data URI (large base64) OR a raw base64 string, strip it to prevent 431 errors
    if (char.avatarUrl && 
        (char.avatarUrl.startsWith('data:image/') || 
         (!char.avatarUrl.startsWith('http://') && !char.avatarUrl.startsWith('https://') && !char.avatarUrl.startsWith('/') && char.avatarUrl.length > 200))) {
      logger.debug(`[INDEX LOADER] Stripping suspected base64 avatar for character: ${char.name}, ID: ${char.id}`);
      return { ...char, avatarUrl: null, _hasBase64Avatar: true };
    }
    logger.debug(`[INDEX LOADER] Retaining avatarUrl for character: ${char.name}, ID: ${char.id}, avatarUrl: ${char.avatarUrl ? char.avatarUrl.substring(0, 50) + '...' : 'none'}`);

    return char;
  });

  return json<LoaderData>({ user, characters: validCharacters });
};

export const action: ActionFunction = async ({ request }) => {
  const user = await requireUser(request);
  const formData = await request.formData();
  const { _action, ...values } = Object.fromEntries(formData);
  // REMOVED: const session = await getSession(request.headers.get("Cookie")); 

  try {
    if (_action === 'save') {
      const character = JSON.parse(values.character as string) as Character;

      if (!character.slotIndex) {
        const nextSlot = await findNextAvailableSlot(user.id);
        if (nextSlot === null) {
          return json({ error: 'All 12 character slots are full.' }, { status: 400 });
        }
        character.slotIndex = nextSlot;
      }
      
      character.userId = user.id;

      await saveCharacter(user.id, character);
      
      if (values.originalIdToDelete) {
        await deleteCharacter(user.id, values.originalIdToDelete as string);
      }
      return json({ success: true });
    }

    if (_action === 'delete') {
      const characterId = values.characterId as string;
      await deleteCharacter(user.id, characterId);
      return json({ success: true });
    }
    
    if (_action === 'generateRandomCharacter') {
      // --- LOCAL RANDOMIZATION INSTEAD OF AI ---
      try {
        const characterData = createRandomLevel3Character();
        // Return the generated data to the client to pre-fill the form
        logger.debug(`[ACTION] Generated random Level 3 character: ${characterData.name} (${characterData.race} ${characterData.class})`);
        return json({ success: true, data: { characterData } });
      } catch (randomError) {
        logger.error("Local Random Character Creation Failed", { error: randomError instanceof Error ? randomError.message : "Unknown error" });
        const errorMessage = randomError instanceof Error ? randomError.message : 'Failed to generate random character locally.';
        return json({ error: errorMessage }, { status: 500 });
      }
    }

    if (_action === 'importDefaultCharacters') {
      try {
        const defaultCharactersToImport = DND_5E_CHARACTERS.slice(0, 2); // Import the first two static characters
        const savedCharacters: Character[] = [];
        let overwriteCandidate: Omit<Character, 'userId' | 'slotIndex'> | null = null;
        let existingCharacters: Character[] | undefined = undefined;
        let overwriteTriggered = false;

        for (const templateChar of defaultCharactersToImport) {
          // 1. Find the next available slot for this specific character (1 to 12)
          const nextSlot = await findNextAvailableSlot(user.id);

          if (nextSlot === null) {
            // All 12 slots are full. Trigger overwrite prompt for the current character template.
            existingCharacters = await getCharactersForUser(user.id);
            overwriteCandidate = templateChar as Omit<Character, 'userId' | 'slotIndex'>;
            overwriteTriggered = true;
            break; // Stop processing further characters, wait for user confirmation
          }

          // 2. Assign slot and save
          const characterData: Character = {
            ...templateChar as Character,
            id: crypto.randomUUID(), // Assign new ID since these are new imports
            slotIndex: nextSlot,
            userId: user.id,
          };

          // Ensure basic required fields are present if template is incomplete (though DND_5E_CHARACTERS should be complete)
          if (!characterData.level) characterData.level = 3;
          if (!characterData.proficiencyBonus) characterData.proficiencyBonus = 2;
          if (!characterData.hp || !characterData.maxHp) {
             characterData.maxHp = 30; 
             characterData.hp = characterData.maxHp;
          }
          if (!characterData.ac) characterData.ac = 10;
          if (!characterData.initiative) characterData.initiative = 0;
          if (!characterData.personality) characterData.personality = { trait: 'N/A', ideal: 'N/A', bond: 'N/A', flaw: 'N/A' };
          if (!characterData.weapons) characterData.weapons = {};
          if (!characterData.spells) characterData.spells = { cantrips: [], level1: [], level2: [] };
          if (!characterData.spellSlots) characterData.spellSlots = { level1: { current: 0, max: 0 }, level2: { current: 0, max: 0 } };


          await saveCharacter(user.id, characterData);
          savedCharacters.push(characterData);
          logger.debug(`Character "${characterData.name}" saved successfully to slot ${nextSlot}`);
        }

        if (overwriteTriggered && overwriteCandidate) {
          // Return conflict status to show overwrite modal
          return json({
            success: false,
            error: 'All character slots are full. Please choose a character to overwrite.',
            characterData: overwriteCandidate, // Static character data we tried to save
            existingCharacters: existingCharacters,
          }, { status: 409 });
        }

        // Success: If we saved 1 or 2 characters without hitting the full slot limit
        return json({ success: true, characters: savedCharacters }, { status: 200 });

      } catch (error) {
        logger.error("Error importing default characters", { error: error instanceof Error ? error.message : "Unknown error" });
        const errorMessage = error instanceof Error ? error.message : 'Failed to process request';
        return json({ error: errorMessage }, { status: 500 });
      }
    }

    if (_action === 'overwriteCharacter') {
      const characterToOverwriteId = values.characterId as string;
      const characterData = JSON.parse(values.characterData as string) as Omit<Character, 'userId' | 'slotIndex'>;

      // Get the character to overwrite
      const existingCharacters = await getCharactersForUser(user.id);
      const characterToOverwrite = existingCharacters.find(c => c?.id === characterToOverwriteId);

      if (!characterToOverwrite) {
        return json({ error: 'Character to overwrite not found.' }, { status: 404 });
      }

      // Save the character
      characterData.slotIndex = characterToOverwrite.slotIndex;
      characterData.userId = user.id;
      characterData.id = characterToOverwriteId;

      await saveCharacter(user.id, characterData as Character);

      // Return success with the saved character
      logger.debug(`Character "${characterData.name}" overwritten in slot ${characterData.slotIndex}`);
      return json({ success: true, characters: [characterData] }, { status: 200 });
    }
    
    if (_action === 'proceedToRooms') { // <-- UPDATED ACTION HANDLER
      const partySlotsJson = values.partySlots as string;
      if (!partySlotsJson) {
        return json({ error: 'Missing party configuration.' }, { status: 400 });
      }
      
      const partySlots: PlayerSlot[] = JSON.parse(partySlotsJson);
      
      // Store the party configuration using temporary DB storage
      await saveTemporaryPartySetup(user.id, partySlots);
      
      // Redirect to /rooms
      throw redirect('/rooms');
    }

    return json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    // CRITICAL FIX: If the error is a Response object (which happens during a redirect), re-throw it.
    if (error instanceof Response) {
      throw error;
    }
    
    logger.error("Character management action failed", { error: error instanceof Error ? error.message : "Unknown error" });
    const errorMessage = error instanceof Error ? error.message : 'Failed to process request';
    return json({ error: errorMessage }, { status: 500 });
  }
};

export default function Index() {
  const { user, characters: loadedCharacters } = useLoaderData<LoaderData>();
  const characters = loadedCharacters || []; // DEFENSIVE FIX: Ensure characters is an array
  const fetcher = useFetcher<{ success: boolean, error?: string, characters?: Character[] , data?: { characterData: Character }, existingCharacters?: Character[] }>();
  
  const [isImporterOpen, setIsImporterOpen] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  
  const [editingCharacter, setEditingCharacter] = useState<Partial<Character> | null>(null);
  const [editingSlotIndex, setEditingSlotIndex] = useState<number | undefined>(undefined);

  const selectedCharacter = characters.find(c => c.id === editingCharacter?.id) || characters.find(c => c.id === (characters[0]?.id || null));
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(characters[0]?.id || null);

  const defaultSlots: PlayerSlot[] = [
    { type: 'None', characterId: null, isReady: false },
    { type: 'None', characterId: null, isReady: false },
    { type: 'None', characterId: null, isReady: false },
    { type: 'None', characterId: null, isReady: false },
  ];
  const [partySlots, setPartySlots] = useState<PlayerSlot[]>(defaultSlots);

  useEffect(() => {
    setPartySlots(prevSlots => {
      const newSlots = [...prevSlots];
      const newCharId = selectedCharacterId;
      const newType: PlayerSlotType = newCharId ? 'Human' : 'None';
      
      // Only update slot 0 based on selectedCharacterId if it hasn't been manually configured
      // If the user has characters, ensure slot 0 is populated with the first character by default.
      if (newCharId && newSlots[0].characterId !== newCharId) {
        newSlots[0] = { type: newType, characterId: newCharId, isReady: false };
      } else if (!newCharId && newSlots[0].type !== 'None') {
        newSlots[0] = { type: 'None', characterId: null, isReady: false };
      }
      
      return newSlots;
    });
  }, [selectedCharacterId]);

  useEffect(() => {
    if (!selectedCharacterId && characters.length > 0) {
        setSelectedCharacterId(characters[0].id);
    }
  }, [characters, selectedCharacterId]);


  const handleSlotChange = (slotIndex: number, newPlayerSlot: PlayerSlot) => {
    setPartySlots(prevSlots => {
      const newSlots = [...prevSlots];
      newSlots[slotIndex] = newPlayerSlot;
      return newSlots;
    });
  };
  
  // Handler for readiness toggle (required by PlayerSetupSlot, but only updates local state here)
  const handleToggleReady = (slotIndex: number, isReady: boolean) => {
    logger.debug(`[INDEX] Readiness toggle attempted for slot ${slotIndex}: ${isReady}. (Updating local state)`);
    setPartySlots(prevSlots => {
        const newSlots = [...prevSlots];
        if (newSlots[slotIndex]) {
            newSlots[slotIndex] = { ...newSlots[slotIndex], isReady };
        }
        return newSlots;
    });
  };

  const handleCharacterImported = (character: Partial<Character>) => {
    setEditingCharacter(character);
    setEditingSlotIndex(undefined);
    setIsImporterOpen(false);
    setIsFormOpen(true);
  };

  const handleSaveCharacter = (character: Character, slotIndex?: number, saveAsNewName?: string, originalIdToDelete?: string) => {
    const formData = new FormData();
    formData.append('_action', 'save');
    formData.append('character', JSON.stringify(character));
    if (originalIdToDelete) {
      formData.append('originalIdToDelete', originalIdToDelete);
    }
    fetcher.submit(formData, { method: 'post' });
    setIsFormOpen(false);
    setEditingCharacter(null);
    
    if (!selectedCharacterId || selectedCharacterId === originalIdToDelete) {
        setSelectedCharacterId(character.id);
    }
  };

  const handleEditCharacter = (character: Character, slotIndex: number) => {
    setEditingCharacter(character);
    setEditingSlotIndex(slotIndex);
    setIsFormOpen(true);
  };

  const handleNewCharacter = (slotIndex?: number) => {
    setEditingCharacter(null);
    setEditingSlotIndex(slotIndex);
    setIsFormOpen(true);
  };

  const handleDeleteCharacter = (characterId: string) => {
    if (confirm('Are you sure you want to delete this character? This cannot be undone.')) {
      const formData = new FormData();
      formData.append('_action', 'delete');
      formData.append('characterId', characterId);
      fetcher.submit(formData, { method: 'post' });
      
      if (selectedCharacterId === characterId) {
          setSelectedCharacterId(characters.length > 1 ? characters.filter(c => c.id !== characterId)[0]?.id || null : null);
      }
    }
  };

  const currentSelectedCharacter = characters.find(c => c.id === selectedCharacterId);

  const handleGenerateRandomCharacter = (e: React.FormEvent) => {
    e.preventDefault();
    logger.debug("[INDEX] 'Generate Random Character' button pressed. Submitting fetcher to generate locally.");
    
    const formData = new FormData();
    formData.append('_action', 'generateRandomCharacter');
    fetcher.submit(formData, { method: 'post' });
  };

  const handleImportDefaultCharacters = async () => {
    logger.debug("[INDEX] 'Import Default Characters' button pressed. Submitting fetcher.");
    const formData = new FormData();
    formData.append('_action', 'importDefaultCharacters');
    fetcher.submit(formData, { method: 'post' });
  };

  const handleProceedToRooms = () => { // <-- HANDLER TRIGGERS ACTION
    const activeSlots = partySlots.filter(slot => slot.type === 'Human' || slot.type === 'AI');
    const allReady = activeSlots.length > 0 && activeSlots.every(slot => slot.isReady);

    if (!allReady) {
        showToast("Please ensure all active player slots are ready before proceeding.", "error");
        return;
    }
    
    const formData = new FormData();
    formData.append('_action', 'proceedToRooms');
    formData.append('partySlots', JSON.stringify(partySlots));
    
    fetcher.submit(formData, { method: 'post' });
  };

  useEffect(() => {
    if (fetcher.state === 'idle' && fetcher.data) {
      if (fetcher.data.data?.characterData) {
        // AI Character generation success (if that action is used) OR LOCAL RANDOMIZATION SUCCESS
        logger.debug("[INDEX] Character data received via fetcher. Opening form.");
        setEditingCharacter(fetcher.data.data.characterData);
        setIsFormOpen(true);
      } else if (fetcher.data.error) {
        if (fetcher.data.error.includes('All character slots are full') && fetcher.data.characterData && fetcher.data.existingCharacters) {
          // Trigger overwrite confirmation specifically for default import failure (409)
          setShowOverwriteConfirmation(true);
          setCharacterToOverwrite(fetcher.data.characterData as Character); 
        } else {
          // General Error (including AI generation failure from generateRandomCharacter)
          logger.error("[INDEX] General Error", { error: fetcher.data.error });
          showToast(`Operation Failed: ${fetcher.data.error}`, "error");
        }
      } else if (fetcher.data.characters) {
        // Default characters successfully imported or single save succeeded
        logger.debug("[INDEX] Default characters successfully imported or character saved. Refreshing character list.");
        if (fetcher.data.characters) {
          fetcher.data.characters.forEach((character: Character) => {
            logger.debug(`Character "${character.name}" saved to slot ${character.slotIndex}`);
          });
        }
      }
    }
  }, [fetcher.state, fetcher.data]);

  const isGeneratingRandom = fetcher.state === 'submitting' && fetcher.formData?.get('_action') === 'generateRandomCharacter';
  const isImportingDefaults = fetcher.state === 'submitting' && fetcher.formData?.get('_action') === 'importDefaultCharacters';
  const isProceeding = fetcher.state === 'submitting' && fetcher.formData?.get('_action') === 'proceedToRooms'; // <-- NEW CHECK

  // New state for handling the overwrite confirmation
  const [showOverwriteConfirmation, setShowOverwriteConfirmation] = useState(false);
  const [characterToOverwrite, setCharacterToOverwrite] = useState<Partial<Character> | null>(null);

  // Function to handle the overwrite confirmation
  const handleConfirmOverwrite = (characterId: string, characterData: Omit<Character, 'userId' | 'slotIndex'>) => {
    const formData = new FormData();
    formData.append('_action', 'overwriteCharacter');
    formData.append('characterId', characterId);
    formData.append('characterData', JSON.stringify(characterData));
    fetcher.submit(formData, { method: 'post' });
    setShowOverwriteConfirmation(false);
  };

  const handleCancelOverwrite = () => {
    setShowOverwriteConfirmation(false);
  };

  const activeSlots = partySlots.filter(slot => slot.type === 'Human' || slot.type === 'AI');
  const allActiveSlotsReady = activeSlots.length > 0 && activeSlots.every(slot => slot.isReady);

  return (
    <div className="min-h-screen bg-gray-900">
      <main className="p-4 lg:p-8 flex flex-center items-center">
        <div className="w-full max-w-6xl">
          <h1 className="text-6xl font-medieval text-red-500 text-center mb-12">D&D Campaign Manager</h1>
          
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            
            <div className="lg:col-span-2">
              <h2 className="text-4xl font-medieval text-red-500 mb-6">Your Character Roster</h2>
              
              <CharacterSelector 
                characters={characters} 
                selectedCharacter={currentSelectedCharacter}
                onSelectCharacter={setSelectedCharacterId}
              />
              
              <h2 className="text-3xl font-medieval text-red-500 mt-10 mb-4">Party Setup (Active Slots)</h2>
              <div className="mt-8 flex flex-wrap justify-center gap-4">
                {partySlots.map((slot, index) => (
                  <PlayerSetupSlot 
                    key={index}
                    slotIndex={index} 
                    playerSlot={slot} 
                    allCharacters={characters}
                    allSlots={partySlots} // Pass all slots for availability check
                    onSlotChange={handleSlotChange}
                    onEditCharacter={handleEditCharacter}
                    onDeleteCharacter={handleDeleteCharacter}
                    onToggleReady={handleToggleReady} // <-- ADDED PROP
                    showManagementButtons={true} // <-- ADDED: Enable Edit/Delete buttons on dashboard
                  />
                ))}
              </div>
            </div>
            
            <div className="lg:col-span-1">
              <h2 className="text-4xl font-medieval text-red-500 mb-6">Character Tools</h2>
              <div className="space-y-4">
                <button 
                  onClick={() => handleNewCharacter()}
                  className="w-full bg-red-700 hover:bg-red-600 text-white font-bold py-3 px-4 rounded text-lg text-center transition duration-150"
                >
                  Start Manual Creation
                </button>
                <button 
                  onClick={() => setIsImporterOpen(true)} 
                  className="w-full bg-purple-700 hover:bg-purple-600 text-white font-bold py-3 px-4 rounded text-lg transition duration-150"
                >
                  Import from Text Description
                </button>
                
                <form onSubmit={handleGenerateRandomCharacter} className="w-full">
                  <button 
                    type="submit"
                    disabled={isGeneratingRandom}
                    className="w-full bg-green-700 hover:bg-green-600 text-white font-bold py-3 px-4 rounded text-lg text-center transition duration-150 disabled:bg-gray-500 disabled:cursor-not-allowed"
                  >
                    {isGeneratingRandom ? 'Rolling Dice...' : 'Generate Random Character'}
                  </button>
                </form>

                <button
                  type="button"
                  onClick={handleImportDefaultCharacters}
                  disabled={isImportingDefaults}
                  className="w-full bg-yellow-700 hover:bg-yellow-600 text-white font-bold py-3 px-4 rounded text-lg text-center transition duration-150 disabled:bg-gray-500 disabled:cursor-not-allowed"
                >
                  {isImportingDefaults ? 'Summoning Allies...' : 'Import Default Characters'}
                </button>
              </div>
            </div>
          </div>

          <div className="mt-12 text-center">
            <button
              onClick={handleProceedToRooms}
              disabled={!allActiveSlotsReady || isProceeding}
              className={`inline-block font-bold py-4 px-8 rounded-lg text-2xl transition duration-300 ease-in-out transform hover:scale-105 shadow-lg
                ${allActiveSlotsReady && !isProceeding
                  ? 'bg-blue-600 hover:bg-blue-500 text-white'
                  : 'bg-gray-600 text-gray-400 cursor-not-allowed'
                }`}
            >
              {isProceeding ? 'Preparing Portal...' : 'Proceed to Room Selection'}
            </button>
          </div>

          <div>
            <h2 className="text-3xl font-medieval text-red-500 mt-10 mb-4">Current User Characters</h2>
            <ul>
              {characters.map((character) => (
                <li key={character.id}>
                  {character.name} (Slot: {character.slotIndex})
                </li>
              ))}
            </ul>
          </div>
        </div>
        
        {isImporterOpen && (
          <div className="fixed inset-0 bg-black bg-opacity-75 z-50 flex items-center justify-center p-4">
            <CharacterImporter 
              onClose={() => setIsImporterOpen(false)} 
              onCharacterParsed={handleCharacterImported} 
            />
          </div>
        )}

        {isFormOpen && (
          <div className="fixed inset-0 bg-black bg-opacity-75 z-50 flex items-center justify-center p-4">
            <NewCharacterForm
              initialData={editingCharacter}
              onSave={handleSaveCharacter}
              onClose={() => setIsFormOpen(false)}
              slotIndex={editingSlotIndex}
            />
          </div>
        )}

        {/* Overwrite Confirmation Modal */}
        {showOverwriteConfirmation && characterToOverwrite && (
          <div className="fixed inset-0 bg-black bg-opacity-75 z-50 flex items-center justify-center p-4">
            <div className="bg-gray-800 p-6 rounded-md shadow-lg space-y-4">
              <h3 className="text-xl font-bold text-white">Character Slots Full</h3>
              <p className="text-gray-300">All character slots are currently occupied. Would you like to overwrite an existing character with the new character: <strong className="text-red-300">{characterToOverwrite.name || 'Unnamed Character'}</strong>?</p>
              <div className="flex space-x-4 justify-center">
                {fetcher.data?.existingCharacters?.map(char => (
                  <button
                    key={char.id}
                    onClick={() => handleConfirmOverwrite(char.id, characterToOverwrite!)}
                    className="bg-red-600 hover:bg-red-500 text-white font-bold py-2 px-4 rounded transition duration-150"
                  >
                    Overwrite {char.name} (Slot {char.slotIndex})
                  </button>
                ))}
                <button
                  onClick={handleCancelOverwrite}
                  className="bg-gray-600 hover:bg-gray-500 text-white font-bold py-2 px-4 rounded transition duration-150"
                >
                  Cancel Import
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

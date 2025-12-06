import { useState, useMemo, useEffect } from 'react';
import { json, useLoaderData, useFetcher, useNavigate, useRevalidator } from '@remix-run/react';
import type { LoaderFunctionArgs } from "@remix-run/node";
import { getSession } from '~/sessions';
import { getAllCharacters } from '~/services/characterCache.server';
import type { Character } from '~/types';
import NewCharacterForm from '~/components/NewCharacterForm';

// --- Placeholder Data ---
const CLASSES = ['Barbarian', 'Bard', 'Cleric', 'Druid', 'Fighter', 'Monk', 'Paladin', 'Ranger', 'Rogue', 'Sorcerer', 'Warlock', 'Wizard'];
const RACES = ['Dwarf', 'Elf', 'Halfling', 'Human', 'Dragonborn', 'Gnome', 'Half-Elf', 'Half-Orc', 'Tiefling'];
const BACKGROUNDS = ['Acolyte', 'Criminal', 'Folk Hero', 'Noble', 'Sage', 'Soldier', 'Urchin'];
// ------------------------

interface CharacterLoaderData {
  characters: Character[];
}

export async function loader({ request }: LoaderFunctionArgs) {
  const session = await getSession(request.headers.get("cookie"));
  const userId = session.get("userId");

  if (!userId) {
    return json({ characters: [] }, { status: 401 });
  }

  const characters = await getAllCharacters(userId);
  return json<CharacterLoaderData>({ characters });
}

export default function CharacterNew() {
  const { characters } = useLoaderData<CharacterLoaderData>();
  const navigate = useNavigate();
  const revalidator = useRevalidator();
  const [fetcherKey, setFetcherKey] = useState(0);
  const generationFetcher = useFetcher<{ data: { characterData: Character } | { error: string }, type: 'success' | 'error' }>({ key: `character-generation-${fetcherKey}` });
  const saveFetcher = useFetcher();

  const [showForm, setShowForm] = useState(false);
  const [formInitialData, setFormInitialData] = useState<Partial<Character> | null>(null);

  const [selectedClass, setSelectedClass] = useState(CLASSES[0]);
  const [selectedRace, setSelectedRace] = useState(RACES[0]);
  const [selectedBackground, setSelectedBackground] = useState(BACKGROUNDS[0]);

  // Effect to handle showing the form after successful AI generation
  useEffect(() => {
    console.log('CharacterNew: Generation Fetcher State:', generationFetcher.state, 'Data:', generationFetcher.data);
    if (generationFetcher.data && generationFetcher.state === 'idle') {
      if (generationFetcher.data.type === 'success' && generationFetcher.data.data) {
        const { characterData } = generationFetcher.data.data;
        setFormInitialData(characterData);
        setShowForm(true);
      } else if (generationFetcher.data.type === 'error') {
        alert(`Generation Error: ${generationFetcher.data.error}`);
      }
      // Clear fetcher data by setting a new key to force a fresh fetcher instance
      setFetcherKey(prev => prev + 1);
    }
  }, [generationFetcher.data, generationFetcher.state]);

  // Effect to revalidate character list after saving changes from the form
  useEffect(() => {
    if (saveFetcher.state === 'idle' && saveFetcher.data) {
      revalidator.revalidate();
    }
  }, [saveFetcher.state, saveFetcher.data, revalidator]);

  const handleGenerateRandom = (e: React.FormEvent) => {
    e.preventDefault();
    console.log('CharacterNew: --- handleGenerateRandom clicked! ---');
    console.log(`Submitting for generation: Class=${selectedClass}, Race=${selectedRace}, Background=${selectedBackground}`);
    
    generationFetcher.submit(
      { generateFull: 'true', class: selectedClass, race: selectedRace, background: selectedBackground }, // Pass selected parameters to server
      { method: 'post', action: '/api/character.create-ai' }
    );
    console.log('CharacterNew: Fetcher submitted.');
  };

  const handleManualCreation = () => {
    setFormInitialData(null); // No initial data for manual creation
    setShowForm(true);
  };

  const handleImportText = () => {
    navigate('/character.import/text');
  };

  const handleImportDefault = () => {
    alert('Importing default characters...');
    navigate('/character.manage');
  };

  const handleFormSave = (character: Character) => {
    // The AI action might have already created a character.
    // If this save is triggered from the modal, it could be a new character or an update.
    const isUpdate = !!formInitialData?.id;

    saveFetcher.submit(
      {
        intent: isUpdate ? 'updateCharacter' : 'createCharacter',
        character: JSON.stringify(character),
        // If updating, we might need to delete the old record if the ID has changed.
        // The backend action should handle this logic.
        originalIdToDelete: isUpdate ? formInitialData.id : undefined,
      },
      { method: 'post', action: '/api/character.manage' }
    );
    setShowForm(false);
  };

  const handleFormClose = () => {
    setShowForm(false);
    setFormInitialData(null);
    // Clear fetcher state if necessary to allow re-submission
    // Use state-based approach instead of reset() which is not available in Remix v2.8.1
    setFetcherKey(prev => prev + 1);
  };

  const renderSelectionForm = useMemo(() => (
    <form onSubmit={handleGenerateRandom} className="p-4 bg-gray-800 rounded-lg shadow-inner mb-6 border border-gray-700">
      <h3 className="text-xl font-bold text-red-400 mb-3">AI Character Parameters</h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        <div>
          <label htmlFor="char-class" className="block text-gray-400 text-sm mb-1">Class:</label>
          <select
            id="char-class"
            value={selectedClass}
            onChange={(e) => setSelectedClass(e.target.value)}
            className="w-full p-2 bg-gray-700 text-white rounded-md border border-gray-600 focus:outline-none focus:border-red-500"
          >
            {CLASSES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="char-race" className="block text-gray-400 text-sm mb-1">Race:</label>
          <select
            id="char-race"
            value={selectedRace}
            onChange={(e) => setSelectedRace(e.target.value)}
            className="w-full p-2 bg-gray-700 text-white rounded-md border border-gray-600 focus:outline-none focus:border-red-500"
          >
            {RACES.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="char-background" className="block text-gray-400 text-sm mb-1">Background:</label>
          <select
            id="char-background"
            value={selectedBackground}
            onChange={(e) => setSelectedBackground(e.target.value)}
            className="w-full p-2 bg-gray-700 text-white rounded-md border border-gray-600 focus:outline-none focus:border-red-500"
          >
            {BACKGROUNDS.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
        </div>
      </div>
      <button
        type="submit"
        disabled={generationFetcher.state !== 'idle'}
        className="w-full py-3 bg-green-600 hover:bg-green-500 text-white font-bold rounded-lg transition duration-200 disabled:bg-gray-500 disabled:cursor-not-allowed"
      >
        {generationFetcher.state === 'loading' ? 'Rewriting the Fate..' : 'Generate Random Character'}
      </button>
    </form>
  ), [selectedClass, selectedRace, selectedBackground, generationFetcher.state]);

  return (
    <div className="p-6 max-w-xl mx-auto">
      <h1 className="text-3xl font-bold text-red-400 mb-6 border-b border-gray-700 pb-2">Character Tools</h1>

      <div className="space-y-4">
        <button
          onClick={handleManualCreation}
          className="w-full py-3 bg-red-700 hover:bg-red-600 text-white font-bold rounded-lg shadow-lg transition duration-200"
        >
          Start Manual Creation
        </button>

        <button
          onClick={handleImportText}
          className="w-full py-3 bg-purple-700 hover:bg-purple-600 text-white font-bold rounded-lg shadow-lg transition duration-200"
        >
          Import from Text Description
        </button>
        
        {renderSelectionForm}

        <button
          onClick={handleImportDefault}
          className="w-full py-3 bg-amber-700 hover:bg-amber-600 text-white font-bold rounded-lg shadow-lg transition duration-200"
        >
          Import Default Characters
        </button>
      </div>

      <hr className="my-8 border-gray-700" />

      <h2 className="text-2xl font-bold text-red-400 mb-4">Your Characters ({characters.length})</h2>
      {characters.length === 0 ? (
        <p className="text-gray-400">No characters found. Create one above!</p>
      ) : (
        <ul className="space-y-2">
          {characters.map(char => (
            <li key={char.id} className="p-3 bg-gray-800 rounded-md flex justify-between items-center border border-gray-700">
              <span className="text-lg text-white">{char.name} ({char.race} {char.class})</span>
              <button
                onClick={() => navigate(`/character/${char.id}`)}
                className="text-sm bg-blue-600 hover:bg-blue-500 px-3 py-1 rounded"
              >
                View/Edit
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* The form overlay */}
      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-4">
          <NewCharacterForm
            initialData={formInitialData}
            onSave={handleFormSave}
            onClose={handleFormClose}
          />
        </div>
      )}
    </div>
  );
}

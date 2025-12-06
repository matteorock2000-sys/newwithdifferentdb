import { useState, useRef, useEffect } from 'react';
import type { Character } from '~/types';
import { useFetcher } from '@remix-run/react';

interface ImportResponse {
  success: boolean;
  character?: Character;
  error?: string;
}

interface CharacterImporterProps {
  onCharacterParsed: (character: Partial<Character>) => void;
  onClose: () => void;
}

export default function CharacterImporter({ onCharacterParsed, onClose }: CharacterImporterProps) {
  const [description, setDescription] = useState('');
  const [parsedCharacter, setParsedCharacter] = useState<Partial<Character> | null>(null);
  const fetcher = useFetcher<ImportResponse>();
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (fetcher.data) {
      if (fetcher.data.success && fetcher.data.character) {
        console.log("CharacterImporter: Successfully received parsed character via fetcher.");
        setParsedCharacter(fetcher.data.character);
      } else if (fetcher.data.error) {
        console.error("CharacterImporter: Import failed with error:", fetcher.data.error);
        // Display the error message to the user
        alert(`Import failed: ${fetcher.data.error}`);
        setParsedCharacter(null); // Ensure parsedCharacter is null on error
      } else {
        console.warn("CharacterImporter: Fetcher data received but not in expected format:", fetcher.data);
        alert("Import failed: Unexpected response format.");
        setParsedCharacter(null); // Ensure parsedCharacter is null on unexpected format
      }
    }
  }, [fetcher.data]);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (description.trim() === '') {
      alert('Please enter a character description to import.');
      return;
    }

    // Clear previous parsed character data before submitting a new one
    setParsedCharacter(null); 

    // Sanitize description to remove non-ASCII characters that might cause issues in form submission or parsing
    const sanitizedDescription = description.replace(/[^\x00-\x7F\n\r\t ]/g, ''); 
    
    console.log("CharacterImporter: Submitting form to /api/character/import using useFetcher.");

    const formData = new FormData();
    formData.append('description', sanitizedDescription);
    
    // Use the dedicated API route for parsing. 
    // Changed action path from /api.character.import to /api/character/import to resolve 404 routing issue.
    fetcher.submit(formData, { method: 'post', action: '/api/character/import' });
  };

  const handleUseCharacter = (event: React.MouseEvent) => {
    // Although type="button" is set, keep preventDefault for maximum robustness against browser quirks
    event.preventDefault(); 
    if (parsedCharacter) {
      console.log("CharacterImporter: Using parsed character and closing importer.");
      onCharacterParsed(parsedCharacter);
      onClose();
    }
  };

  const handleCancelPreview = () => {
    console.log("CharacterImporter: Cancelling preview.");
    setParsedCharacter(null);
    setDescription(''); // Also clear the description input
  };

  const isLoading = fetcher.state === 'submitting';

  return (
    <div className="bg-gray-800 p-6 rounded-lg shadow-lg border border-gray-700 relative">
      {/* Close Button (X) */}
      <button
        type="button"
        onClick={onClose}
        className="absolute top-3 right-3 text-gray-400 hover:text-red-400 text-2xl font-bold transition duration-150"
        aria-label="Close import window"
      >
        &times;
      </button>

      <h3 className="text-2xl font-medieval text-red-400 mb-4">Import Character from Text</h3>
      <p className="text-gray-300 mb-4">Paste a character description (e.g., from a character builder, a story, or a stat block) and let the AI try to parse it into a character sheet.</p>

      {!parsedCharacter ? (
        <form ref={formRef} onSubmit={handleSubmit}>
          <textarea
            name="description"
            className="w-full p-3 bg-gray-900 border border-gray-600 rounded-md text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-red-500 mb-4"
            rows={10}
            placeholder="Paste your character description here..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={isLoading}
          ></textarea>
          <button
            type="submit"
            className="w-full bg-red-700 hover:bg-red-600 text-white font-bold py-3 px-4 rounded-md transition duration-200 ease-in-out disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={isLoading}
          >
            {isLoading ? 'Parsing Character...' : 'Import Character'}
          </button>
        </form>
      ) : (
        <div className="mt-4">
          <h4 className="text-xl font-medieval text-green-400 mb-3">Parsed Character Preview:</h4>
          <div className="bg-gray-900 p-4 rounded-md border border-gray-700 max-h-96 overflow-y-auto mb-4">
            <pre className="text-gray-100 text-sm whitespace-pre-wrap break-words">
              {JSON.stringify(parsedCharacter, null, 2)}
            </pre>
          </div>
          <div className="flex justify-end gap-4">
            <button
              type="button" // Explicitly set type to prevent unintended form submission/navigation
              onClick={handleCancelPreview}
              className="bg-gray-600 hover:bg-gray-500 text-white font-bold py-2 px-4 rounded-md transition duration-200 ease-in-out"
            >
              Cancel
            </button>
            <button
              type="button" // Explicitly set type to prevent unintended form submission/navigation
              onClick={handleUseCharacter}
              className="bg-green-700 hover:bg-green-600 text-white font-bold py-2 px-4 rounded-md transition duration-200 ease-in-out"
            >
              Use This Character
            </button>
          </div>
        </div>
      )}

      {isLoading && (
        <div className="mt-4 text-center text-gray-400">
          <p>This might take a moment as the AI processes the description...</p>
        </div>
      )}
    </div>
  );
}

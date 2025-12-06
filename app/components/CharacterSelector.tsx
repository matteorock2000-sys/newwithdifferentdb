import React from 'react';
import type { Character } from '~/types';
import CharacterSheet from './CharacterSheet';

interface CharacterSelectorProps {
  characters: Character[];
  selectedCharacter: Character | undefined;
  onSelectCharacter: (id: string) => void;
}

const CharacterSelector: React.FC<CharacterSelectorProps> = ({ characters, selectedCharacter, onSelectCharacter }) => {
  const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onSelectCharacter(e.target.value);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <label htmlFor="character-select" className="block text-xl font-medieval text-gray-300">
          Select Active Character:
        </label>
        <span className="text-sm text-gray-400">{characters.length} characters available</span>
      </div>
      <select
        id="character-select"
        value={selectedCharacter?.id || ''}
        onChange={handleSelectChange}
        className="w-full p-3 bg-gray-700 border border-gray-600 rounded-md text-white text-lg focus:outline-none focus:ring-2 focus:ring-red-500 transition duration-200"
      >
        {characters.length === 0 ? (
          <option value="" disabled>No characters saved yet</option>
        ) : (
          <>
            <option value="" disabled>--- Choose a Character ---</option>
            {characters.map(char => (
              <option key={char.id} value={char.id}>
                {char.name} ({char.race} {char.class} Lvl {char.level}) - Slot {char.slotIndex}
              </option>
            ))}
          </>
        )}
      </select>

      {/* Character Selection Feedback */}
      {selectedCharacter && (
        <div className="p-3 bg-blue-900 bg-opacity-20 border border-blue-600 rounded-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <span className="w-3 h-3 bg-green-500 rounded-full mr-3"></span>
              <span className="text-blue-300 font-semibold">Selected:</span>
            </div>
            <span className="text-blue-200 text-sm">ID: {selectedCharacter.id}</span>
          </div>
          <div className="mt-2 text-blue-100">
            <span className="font-bold">{selectedCharacter.name}</span> - {selectedCharacter.race} {selectedCharacter.class} (Level {selectedCharacter.level})
          </div>
          <div className="mt-2 text-blue-200 text-sm">
            Slot: {selectedCharacter.slotIndex} | HP: {selectedCharacter.hp}/{selectedCharacter.maxHp} | AC: {selectedCharacter.ac}
          </div>
        </div>
      )}

      <div className="mt-6">
        <CharacterSheet character={selectedCharacter || null} />
      </div>
    </div>
  );
};

export default CharacterSelector;

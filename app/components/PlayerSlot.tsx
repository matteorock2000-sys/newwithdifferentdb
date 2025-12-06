import type { Character } from '~/types';
import { Link } from '@remix-run/react';

interface PlayerSlotProps {
  slotIndex: number;
  character: Character | null;
  onEdit: (character: Character, slotIndex: number) => void;
  onNew: (slotIndex: number) => void;
  onDelete: (characterId: string) => void;
}

export default function PlayerSlot({ slotIndex, character, onEdit, onNew, onDelete }: PlayerSlotProps) {
  const isEmpty = character === null;

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent triggering onEdit/onNew
    if (character && confirm(`Are you sure you want to delete ${character.name}?`)) {
      onDelete(character.id);
    }
  };

  return (
    <div
      className={`relative flex flex-col items-center justify-center p-4 border-2 rounded-lg shadow-md transition-all duration-200 ease-in-out
        ${isEmpty
          ? 'border-gray-600 bg-gray-800 hover:border-red-500 hover:bg-gray-700 cursor-pointer'
          : 'border-red-700 bg-red-900 bg-opacity-20 hover:border-red-500 hover:bg-red-800 hover:bg-opacity-30 cursor-pointer'
        }`}
      onClick={() => isEmpty ? onNew(slotIndex) : onEdit(character!, slotIndex)}
    >
      {/* Slot Header */}
      <div className="absolute top-2 left-2 text-xs text-gray-400 font-semibold">
        Slot {slotIndex + 1}
      </div>
      
      {isEmpty ? (
        <>
          <span className="text-6xl text-gray-500 mb-2">+</span>
          <p className="text-gray-300 font-medieval text-xl">New Character</p>
          <p className="text-gray-400 text-sm">Click to create</p>
        </>
      ) : (
        <>
          <div className="flex items-center space-x-3 mb-2">
            <div className="w-12 h-12 bg-red-600 rounded-full flex items-center justify-center text-white font-bold text-lg">
              {character.name.charAt(0)}
            </div>
            <div className="text-left">
              <h4 className="text-red-400 font-medieval text-xl">{character.name}</h4>
              <p className="text-gray-200 text-sm">{character.race} {character.class}</p>
            </div>
          </div>
          <div className="flex items-center space-x-4 text-xs text-gray-300 mb-2">
            <span className="bg-gray-700 px-2 py-1 rounded">Lvl {character.level}</span>
            <span className="bg-gray-700 px-2 py-1 rounded">HP: {character.hp}/{character.maxHp}</span>
            <span className="bg-gray-700 px-2 py-1 rounded">AC: {character.ac}</span>
          </div>
          <p className="text-gray-400 text-xs">Click to edit</p>
          <button
            onClick={handleDelete}
            className="absolute top-2 right-2 bg-red-600 hover:bg-red-500 text-white text-xs p-2 rounded-full leading-none transition duration-200"
            aria-label={`Delete ${character.name}`}
          >
            ✕
          </button>
        </>
      )}
    </div>
  );
}

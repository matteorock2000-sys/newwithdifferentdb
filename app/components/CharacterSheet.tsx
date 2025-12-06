import React, { useState, useCallback } from 'react';
import type { Character } from "~/types";
import { RACE_DESCRIPTIONS, CLASS_DESCRIPTIONS } from "~/data/dnd";

interface CharacterSheetProps {
  character: Character | null;
}

// Helper component for collapsible sections
interface CollapsibleSectionProps {
  title: string;
  children: React.ReactNode;
  id: string;
  isOpen: boolean;
  onToggle: (id: string) => void;
}

const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({ title, children, id, isOpen, onToggle }) => {
  return (
    <div className="mb-4 border border-gray-700 rounded-lg overflow-hidden">
      <button
        onClick={() => onToggle(id)}
        className="w-full p-3 bg-gray-700 hover:bg-gray-600 text-left font-bold text-xl text-red-300 flex justify-between items-center transition duration-150"
      >
        <span>{title}</span>
        <span>{isOpen ? '▲' : '▼'}</span>
      </button>
      {isOpen && (
        <div className="p-4 bg-gray-800">
          {children}
        </div>
      )}
    </div>
  );
};


export default function CharacterSheet({ character }: CharacterSheetProps) {
  if (!character) {
    return (
      <div className="bg-gray-800 p-6 rounded-lg shadow-lg border border-gray-700 text-gray-300 h-full overflow-y-auto">
        <p className="text-center text-red-400 font-bold text-xl">No character selected.</p>
      </div>
    );
  }

  const getModifier = (score: number) => Math.floor((score - 10) / 2);

  const raceDescription = RACE_DESCRIPTIONS[character.race as keyof typeof RACE_DESCRIPTIONS] || "No description available.";
  const classDescription = CLASS_DESCRIPTIONS[character.class as keyof typeof CLASS_DESCRIPTIONS] || "No description available.";

  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    'character-sheet-wrapper': true,
    'core-stats': true,
    'saves-skills': false,
    'weapons': false,
    'spells': false,
    'equipment': false,
    'features': false,
    'personality': false,
  });

  const toggleSection = useCallback((id: string) => {
    setOpenSections(prev => ({
      ...prev,
      [id]: !prev[id],
    }));
  }, []);

  const renderSpellSlots = () => {
    if (!character.spellSlots) return null;

    const slots = Object.entries(character.spellSlots)
      .map(([levelKey, slotData]) => {
        if (!slotData) return null;
        const level = parseInt(levelKey.replace('level', ''), 10);
        return { level, ...slotData };
      })
      .filter((slot): slot is { level: number; current: number; max: number } => slot !== null && slot.max > 0)
      .sort((a, b) => a.level - b.level);

    if (slots.length === 0) return null;

    return slots.map(slot => (
      <p key={`slot-level-${slot.level}`}>
        <strong>Level {slot.level} Slots:</strong> {slot.current}/{slot.max}
      </p>
    ));
  };

  const renderSpellLists = () => {
    if (!character.spells) return null;

    const spellLevels = Object.entries(character.spells)
      .map(([levelKey, spellList]) => {
        if (!spellList || spellList.length === 0) return null;
        if (levelKey === 'cantrips') {
          return {
            level: 0, // for sorting
            name: 'Cantrips',
            spells: spellList.join(', ')
          };
        }
        const level = parseInt(levelKey.replace('level', ''), 10);
        return {
          level,
          name: `Level ${level} Spells`,
          spells: spellList.join(', ')
        };
      })
      .filter((levelInfo): levelInfo is { level: number; name: string; spells: string } => levelInfo !== null)
      .sort((a, b) => a.level - b.level);

    if (spellLevels.length === 0) return null;

    return spellLevels.map(levelInfo => (
      <p key={`spell-list-${levelInfo.level}`}>
        <strong>{levelInfo.name}:</strong> {levelInfo.spells}
      </p>
    ));
  };

  const hasSpells = character.spellcastingAbility || (character.spells && Object.values(character.spells).some(list => list && list.length > 0));

  return (
    <div className="bg-gray-800 p-4 rounded-lg shadow-xl border border-gray-700 text-gray-300 overflow-y-auto">
      <CollapsibleSection
        title={character.name}
        id="character-sheet-wrapper"
        isOpen={openSections['character-sheet-wrapper']}
        onToggle={toggleSection}
      >
        <h2 className="text-3xl font-medieval text-red-500 mb-2 text-center">{character.name}</h2>
        <p className="text-md text-gray-400 text-center mb-4">{character.race} {character.class} - Lvl {character.level}</p>

        <CollapsibleSection
          title="Summary"
          id="core-stats"
          isOpen={openSections['core-stats']}
          onToggle={toggleSection}
        >
          <div className="p-3 bg-gray-700/50 border border-gray-600 rounded-lg mb-6">
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <h4 className="text-lg font-bold text-red-300 mb-1 border-b border-gray-700 pb-0.5">Core Info</h4>
                <p className="text-sm"><strong>Alignment:</strong> {character.alignment}</p>
                <p className="text-sm"><strong>Background:</strong> {character.background}</p>
                <p className="text-sm"><strong>Speed:</strong> {character.speed} ft</p>
                <p className="text-sm"><strong>Hit Dice:</strong> {character.hitDice}</p>
                <p className="text-sm"><strong>Proficiency Bonus:</strong> +{character.proficiencyBonus}</p>
              </div>
              <div>
                <h4 className="text-lg font-bold text-red-300 mb-1 border-b border-gray-700 pb-0.5">Combat Stats</h4>
                <p className="text-sm"><strong>HP:</strong> {character.hp}/{character.maxHp}</p>
                <p className="text-sm"><strong>AC:</strong> {character.ac}</p>
                <p className="text-sm"><strong>Initiative:</strong> {character.initiative >= 0 ? '+' : ''}{character.initiative}</p>
                <p className="text-sm"><strong>Passive Perception:</strong> {character.passivePerception}</p>
                <p className="text-sm"><strong>Armor:</strong> {character.armor || 'None'}</p>
              </div>
            </div>
            <div className="mb-4">
              <h4 className="text-lg font-bold text-red-300 mb-2 border-b border-gray-700 pb-0.5">Attributes</h4>
              <div className="grid grid-cols-3 gap-2 text-center">
                {Object.entries(character.stats).map(([stat, value]) => (
                  <div key={stat} className="bg-gray-700 p-2 rounded">
                    <p className="text-xs uppercase">{stat.substring(0, 3)}</p>
                    <p className="text-base font-bold">{value} ({getModifier(value) >= 0 ? '+' : ''}{getModifier(value)})</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <p className="text-sm mt-2"><strong>Fighting Style:</strong> {character.fightStyle || 'None'}</p>
        </CollapsibleSection>

        <CollapsibleSection
          title="Saving Throws & Skills"
          id="saves-skills"
          isOpen={openSections['saves-skills']}
          onToggle={toggleSection}
        >
          <p><strong>Saving Throws:</strong> {character.savingThrows?.join(', ') || 'None'}</p>
          <p><strong>Skills:</strong> {character.skills?.join(', ') || 'None'}</p>
        </CollapsibleSection>

        <CollapsibleSection
          title="Weapons"
          id="weapons"
          isOpen={openSections['weapons']}
          onToggle={toggleSection}
        >
          {character.weapons?.primary && (
            <p><strong>Primary:</strong> {character.weapons.primary.name} ({character.weapons.primary.attackBonus}, {character.weapons.primary.damage})</p>
          )}
          {character.weapons?.ranged && (
            <p><strong>Ranged:</strong> {character.weapons.ranged.name} ({character.weapons.ranged.attackBonus}, {character.weapons.ranged.damage})</p>
          )}
          {(!character.weapons?.primary && !character.weapons?.ranged) && <p>No weapons equipped.</p>}
        </CollapsibleSection>

        {hasSpells && (
          <CollapsibleSection
            title="Spellcasting"
            id="spells"
            isOpen={openSections['spells']}
            onToggle={toggleSection}
          >
            {character.spellcastingAbility && <p><strong>Ability:</strong> {character.spellcastingAbility}</p>}
            {character.spellSaveDC && <p><strong>Save DC:</strong> {character.spellSaveDC}</p>}
            {character.spellAttackBonus && <p><strong>Attack Bonus:</strong> {character.spellAttackBonus}</p>}
            <div className="my-2 border-t border-gray-700"></div>
            {renderSpellSlots()}
            <div className="my-2 border-t border-gray-700"></div>
            {renderSpellLists()}
          </CollapsibleSection>
        )}

        <CollapsibleSection
          title="Equipment & Inventory"
          id="equipment"
          isOpen={openSections['equipment']}
          onToggle={toggleSection}
        >
          <p><strong>Equipment:</strong> {character.equipment?.join(', ') || 'None'}</p>
          <p><strong>Inventory:</strong> {character.inventory?.join(', ') || 'None'}</p>
        </CollapsibleSection>

        <CollapsibleSection
          title="Features & Traits"
          id="features"
          isOpen={openSections['features']}
          onToggle={toggleSection}
        >
          <p>{character.features?.join(', ') || 'None'}</p>
        </CollapsibleSection>

        <CollapsibleSection
          title="Personality"
          id="personality"
          isOpen={openSections['personality']}
          onToggle={toggleSection}
        >
          <p><strong>Trait:</strong> {character.personality?.trait}</p>
          <p><strong>Ideal:</strong> {character.personality?.ideal}</p>
          <p><strong>Bond:</strong> {character.personality?.bond}</p>
          <p><strong>Flaw:</strong> {character.personality?.flaw}</p>
        </CollapsibleSection>

        <div className="mt-6 p-3 bg-gray-700 rounded-md border border-gray-600">
          <h3 className="text-lg font-bold text-red-300 mb-1">Race Description</h3>
          <p className="text-sm">{raceDescription}</p>
        </div>

        <div className="mt-3 p-3 bg-gray-700 rounded-md border border-gray-600">
          <h3 className="text-lg font-bold text-red-300 mb-1">Class Description</h3>
          <p className="text-sm">{classDescription}</p>
        </div>
      </CollapsibleSection>
    </div>
  );
}

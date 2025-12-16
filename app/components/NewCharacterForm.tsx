import { useState, useEffect, useCallback } from 'react';
import { useLocation } from '@remix-run/react';
import type { Character, Weapon, SpellSlots, AbilityScores } from '~/types';
import { RACES, CLASSES, INVENTORY_ITEMS, CANTRIPS, LEVEL_1_SPELLS, LEVEL_2_SPELLS, TRAITS, IDEALS, BONDS, FLAWS, FIGHT_STYLES, ARMOR_TYPES, SKILLS, SAVING_THROWS } from '~/data/dnd';
import { Input, Select, TextArea, MultiSelect, WeaponInput, SpellSlotInput } from '~/components/CharacterFormHelpers';
import { rollAllStats } from '~/utils/dice';
import { STEPS } from '~/components/characterFormConstants';
import { useFetcher } from '@remix-run/react';
import ErrorBoundary from './ErrorBoundary';
import { logger } from '~/utils/logger';

interface NewCharacterFormProps {
  initialData?: Partial<Character> | null;
  onSave: (character: Character, slotIndex?: number, saveAsNewName?: string, originalIdToDelete?: string) => void;
  onClose: () => void;
  slotIndex?: number;
}

export default function NewCharacterForm({ initialData, onSave, onClose, slotIndex }: NewCharacterFormProps) {
  const location = useLocation();
  const [step, setStep] = useState(0);
  const [showConfirm, setShowConfirm] = useState(false);
  // const [isLoadingAI, setIsLoadingAI] = useState(false);
  const [isRandomizing, setIsRandomizing] = useState(false);
  const [isLoadingPortrait, setIsLoadingPortrait] = useState(false); // NEW: State for portrait loading
  const [isEditing, setIsEditing] = useState(!!initialData);
  const [editModeVerified, setEditModeVerified] = useState(!!initialData);

  // Verify edit mode is properly initialized
  useEffect(() => {
    if (isEditing && initialData) {
      setEditModeVerified(true);
      logger.debug('Edit mode verified for character', { characterName: initialData.name });
    } else if (!isEditing) {
      setEditModeVerified(false);
    }
  }, [initialData]);
  const [hasShownEditPortraitPrompt, setHasShownEditPortraitPrompt] = useState(false); // NEW: Track edit portrait prompt per session
  const [regenerationCount, setRegenerationCount] = useState(0); // NEW: Track regeneration count
  const MAX_REGENERATIONS = 999; // NEW: Maximum allowed regenerations (effectively unlimited)
  const [saveAsNewName, setSaveAsNewName] = useState('');
  const [confirmAction, setConfirmAction] = useState<'save' | 'overwrite' | 'saveAsNew' | null>(null);
  const [showPortraitConfirm, setShowPortraitConfirm] = useState(false); // NEW: State for edit-mode portrait prompt

  const fetcher = useFetcher<any>();
  const avatarFetcher = useFetcher<any>(); // NEW: Fetcher for avatar data

  const defaultCharacter: Character = {
    id: crypto.randomUUID(),
    name: '', race: RACES[0], class: CLASSES[0], level: 3, experience: 0,
    alignment: 'Neutral Good', background: 'Acolyte', speed: 30, hitDice: '1d8',
    hp: 10, maxHp: 10, proficiencyBonus: 2,
    stats: { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 },
    primaryAttribute: 'Strength', secondaryAttribute: 'Constitution',
    armor: ARMOR_TYPES[0], fightStyle: FIGHT_STYLES[0], ac: 10, initiative: 0, passivePerception: 10,
    savingThrows: [], skills: [],
    weapons: { 
      primary: { name: 'Unarmed Strike', attackBonus: '+0', damage: '1d1', damageAttribute: 'Strength' },
      secondary: undefined, // Explicitly set as undefined if optional and not present
      ranged: undefined,    // Explicitly set as undefined if optional and not present
    },
    equipment: [],
    spells: { 
      cantrips: [], 
      level1: [], 
      level2: [],
      // Ensure all levels that are optional in the Character interface are explicitly undefined here
      level3: undefined, level4: undefined, level5: undefined, level6: undefined,
      level7: undefined, level8: undefined, level9: undefined, level10: undefined,
      level11: undefined, level12: undefined, level13: undefined, level14: undefined,
      level15: undefined, level16: undefined, level17: undefined, level18: undefined,
      level19: undefined, level20: undefined,
    },
    spellSlots: { 
      level1: { current: 0, max: 0 }, 
      level2: { current: 0, max: 0 },
      // Ensure all levels that are optional in the Character interface are explicitly undefined here
      level3: undefined, level4: undefined, level5: undefined, level6: undefined,
      level7: undefined, level8: undefined, level9: undefined, level10: undefined,
      level11: undefined, level12: undefined, level13: undefined, level14: undefined,
      level15: undefined, level16: undefined, level17: undefined, level18: undefined,
      level19: undefined, level20: undefined,
    },
    spellcastingAbility: 'Charisma', spellSaveDC: 8, spellAttackBonus: '+0',
    features: [], inventory: [],
    personality: { trait: '', ideal: '', bond: '', flaw: '' },
    appearance: '',
    avatarUrl: '', // Initialize new field
    userId: '',
    slotIndex: 0,
  };

  const aiData = location.state?.aiGeneratedData as { 
    features: string[], 
    personality: Character['personality'], 
    selectedClass: string, 
    selectedRace: string, 
    selectedBackground: string,
    fullCharacterData?: Character
  } | undefined;

      const [character, setCharacter] = useState<Character>(() => {
      let initialChar: Character = { ...defaultCharacter };
  
      if (initialData) {
        initialChar = { ...initialChar, ...initialData };
        // If the loader stripped the avatarUrl due to it being base64, set it to null initially
        if ((initialData as any)._hasBase64Avatar) {
          initialChar.avatarUrl = null;
        }
      }
          if (aiData) {
      if (aiData.fullCharacterData) {
        initialChar = { ...initialChar, ...aiData.fullCharacterData };
      } else if (aiData.selectedClass) {
        initialChar = {
          ...initialChar,
          class: aiData.selectedClass,
          race: aiData.selectedRace,
          background: aiData.selectedBackground,
          features: Array.isArray(aiData.features) ? aiData.features : [aiData.features],
          personality: aiData.personality,
        };
      }
    }

    const mergedCharacter: Character = { // Explicitly cast to Character
      ...initialChar,
      // Ensure all required properties are explicitly set or defaulted
      id: initialChar.id || defaultCharacter.id,
      name: initialChar.name || defaultCharacter.name,
      race: initialChar.race || defaultCharacter.race,
      class: initialChar.class || defaultCharacter.class,
      level: initialChar.level || defaultCharacter.level,
      experience: initialChar.experience || defaultCharacter.experience,
      alignment: initialChar.alignment || defaultCharacter.alignment,
      background: initialChar.background || defaultCharacter.background,
      speed: initialChar.speed || defaultCharacter.speed,
      hitDice: initialChar.hitDice || defaultCharacter.hitDice,
      hp: initialChar.hp || defaultCharacter.hp,
      maxHp: initialChar.maxHp || defaultCharacter.maxHp,
      proficiencyBonus: initialChar.proficiencyBonus || defaultCharacter.proficiencyBonus,
      stats: initialChar.stats || defaultCharacter.stats,
      savingThrows: initialChar.savingThrows || defaultCharacter.savingThrows,
      skills: initialChar.skills || defaultCharacter.skills,
      equipment: initialChar.equipment || defaultCharacter.equipment,
      inventory: initialChar.inventory || defaultCharacter.inventory,
      ac: initialChar.ac || defaultCharacter.ac,
      initiative: initialChar.initiative || defaultCharacter.initiative,
      passivePerception: initialChar.passivePerception || defaultCharacter.passivePerception,
      features: initialChar.features || defaultCharacter.features,
      personality: initialChar.personality || defaultCharacter.personality,
      avatarUrl: initialChar.avatarUrl || defaultCharacter.avatarUrl,
      userId: initialChar.userId || defaultCharacter.userId,
      slotIndex: initialChar.slotIndex !== undefined ? initialChar.slotIndex : (slotIndex !== undefined ? slotIndex : defaultCharacter.slotIndex),

      // Ensure nested objects are also fully defined or defaulted
      // Ensure nested objects are also fully defined or defaulted
      weapons: {
        primary: { ...(defaultCharacter.weapons?.primary || {}), ...(initialChar.weapons?.primary || {}) } as Weapon,
        secondary: initialChar.weapons?.secondary || defaultCharacter.weapons?.secondary,
        ranged: initialChar.weapons?.ranged || defaultCharacter.weapons?.ranged,
      } as Character['weapons'], // Explicitly cast to ensure non-null
      spells: {
        cantrips: initialChar.spells?.cantrips || defaultCharacter.spells?.cantrips || [],
        level1: initialChar.spells?.level1 || defaultCharacter.spells?.level1 || [],
        level2: initialChar.spells?.level2 || defaultCharacter.spells?.level2 || [],
        level3: initialChar.spells?.level3 || defaultCharacter.spells?.level3,
        level4: initialChar.spells?.level4 || defaultCharacter.spells?.level4,
        level5: initialChar.spells?.level5 || defaultCharacter.spells?.level5,
        level6: initialChar.spells?.level6 || defaultCharacter.spells?.level6,
        level7: initialChar.spells?.level7 || defaultCharacter.spells?.level7,
        level8: initialChar.spells?.level8 || defaultCharacter.spells?.level8,
        level9: initialChar.spells?.level9 || defaultCharacter.spells?.level9,
        level10: initialChar.spells?.level10 || defaultCharacter.spells?.level10,
        level11: initialChar.spells?.level11 || defaultCharacter.spells?.level11,
        level12: initialChar.spells?.level12 || defaultCharacter.spells?.level12,
        level13: initialChar.spells?.level13 || defaultCharacter.spells?.level13,
        level14: initialChar.spells?.level14 || defaultCharacter.spells?.level14,
        level15: initialChar.spells?.level15 || defaultCharacter.spells?.level15,
        level16: initialChar.spells?.level16 || defaultCharacter.spells?.level16,
        level17: initialChar.spells?.level17 || defaultCharacter.spells?.level17,
        level18: initialChar.spells?.level18 || defaultCharacter.spells?.level18,
        level19: initialChar.spells?.level19 || defaultCharacter.spells?.level19,
        level20: initialChar.spells?.level20 || defaultCharacter.spells?.level20,
      } as Character['spells'], // Explicitly cast to ensure non-null
      spellSlots: {
        level1: initialChar.spellSlots?.level1 || defaultCharacter.spellSlots?.level1 || { current: 0, max: 0 },
        level2: initialChar.spellSlots?.level2 || defaultCharacter.spellSlots?.level2 || { current: 0, max: 0 },
        level3: initialChar.spellSlots?.level3 || defaultCharacter.spellSlots?.level3,
        level4: initialChar.spellSlots?.level4 || defaultCharacter.spellSlots?.level4,
        level5: initialChar.spellSlots?.level5 || defaultCharacter.spellSlots?.level5,
        level6: initialChar.spellSlots?.level6 || defaultCharacter.spellSlots?.level6,
        level7: initialChar.spellSlots?.level7 || defaultCharacter.spellSlots?.level7,
        level8: initialChar.spellSlots?.level8 || defaultCharacter.spellSlots?.level8,
        level9: initialChar.spellSlots?.level9 || defaultCharacter.spellSlots?.level9,
        level10: initialChar.spellSlots?.level10 || defaultCharacter.spellSlots?.level10,
        level11: initialChar.spellSlots?.level11 || defaultCharacter.spellSlots?.level11,
        level12: initialChar.spellSlots?.level12 || defaultCharacter.spellSlots?.level12,
        level13: initialChar.spellSlots?.level13 || defaultCharacter.spellSlots?.level13,
        level14: initialChar.spellSlots?.level14 || defaultCharacter.spellSlots?.level14,
        level15: initialChar.spellSlots?.level15 || defaultCharacter.spellSlots?.level15,
        level16: initialChar.spellSlots?.level16 || defaultCharacter.spellSlots?.level16,
        level17: initialChar.spellSlots?.level17 || defaultCharacter.spellSlots?.level17,
        level18: initialChar.spellSlots?.level18 || defaultCharacter.spellSlots?.level18,
        level19: initialChar.spellSlots?.level19 || defaultCharacter.spellSlots?.level19,
        level20: initialChar.spellSlots?.level20 || defaultCharacter.spellSlots?.level20,
      } as SpellSlots, // Explicitly cast to ensure non-null
      primaryAttribute: initialChar.primaryAttribute || defaultCharacter.primaryAttribute,
      secondaryAttribute: initialChar.secondaryAttribute || defaultCharacter.secondaryAttribute,
      armor: initialChar.armor || defaultCharacter.armor,
      fightStyle: initialChar.fightStyle || defaultCharacter.fightStyle,
      spellcastingAbility: initialChar.spellcastingAbility || defaultCharacter.spellcastingAbility,
      spellSaveDC: initialChar.spellSaveDC || defaultCharacter.spellSaveDC,
      spellAttackBonus: initialChar.spellAttackBonus || defaultCharacter.spellAttackBonus,
      statRolls: initialChar.statRolls || defaultCharacter.statRolls,
      modifiers: initialChar.modifiers || defaultCharacter.modifiers,
      totalAc: initialChar.totalAc || defaultCharacter.totalAc,
      appearance: initialChar.appearance || defaultCharacter.appearance,
    } as Character;

    logger.debug('NewCharacterForm: Initial character state', { 
      ...mergedCharacter, 
      avatarUrl: mergedCharacter.avatarUrl ? `${mergedCharacter.avatarUrl.substring(0, 50)}...` : mergedCharacter.avatarUrl 
    });
    return mergedCharacter;
  });

  // Effect to fetch base64 avatar if initialData indicates its presence
  useEffect(() => {
    if (initialData && (initialData as any)._hasBase64Avatar && initialData.id && !character.avatarUrl && avatarFetcher.state === 'idle' && !isLoadingPortrait) {
      logger.debug('[NewCharacterForm] InitialData has base64 avatar, fetching from API.');
      setIsLoadingPortrait(true);
      avatarFetcher.load(`/api/character.portrait.serve-base64?characterId=${initialData.id}`);
    }
  }, [initialData, character.avatarUrl, avatarFetcher, isLoadingPortrait]);

  // Effect to handle avatarFetcher response
  useEffect(() => {
    if (avatarFetcher.state === 'idle' && avatarFetcher.data) {
      if (avatarFetcher.data.avatarDataUri) {
        logger.debug('[NewCharacterForm] Fetched base64 avatar data successfully.');
        setCharacter(prev => ({ ...prev!, avatarUrl: avatarFetcher.data.avatarDataUri }));
      } else if (avatarFetcher.data.error) {
        logger.error('[NewCharacterForm] Failed to fetch base64 avatar data:', { error: avatarFetcher.data.error });
      }
      setIsLoadingPortrait(false);
    }
  }, [avatarFetcher.state, avatarFetcher.data]);

  // Track if we've already initialized stats for editing characters
  const [hasInitializedStats, setHasInitializedStats] = useState(false);

  useEffect(() => {
    logger.debug('Initializing state based on initialData/aiData');
    
    if (initialData && !hasInitializedStats) {
        logger.debug('Form initialized with initialData. Checking stats initialization');
        // Only roll stats if this is a new character being edited, not an existing one
        if (!character.stats?.strength || character.stats.strength === 10) { 
            // Check if this is actually a character with existing stats that got cleared
            if (initialData.stats && Object.values(initialData.stats).some(val => val > 10)) {
                logger.debug('Existing character has valid stats, preserving them');
                setHasInitializedStats(true);
                // Stats are valid, don't overwrite
            } else {
                logger.debug('Initial data loaded, forcing stat roll as stats appear uninitialized');
                setCharacter(prev => ({ ...prev!, stats: rollAllStats().stats }));
                setHasInitializedStats(true);
            }
        } else {
            logger.debug('Character has valid stats, skipping stat roll');
            setHasInitializedStats(true);
        }
        return;
    }
    
    if (aiData) {
        if (aiData.fullCharacterData) {
            if (!character.stats?.strength || character.stats.strength === 10) {
                logger.debug('Full AI data loaded via state, forcing stat roll');
                setCharacter(prev => ({ ...prev!, stats: rollAllStats().stats })); 
            }
        } else if (aiData.selectedClass) {
            if (!character.stats?.strength || character.stats.strength === 10) { 
                logger.debug('Partial AI data loaded via state, forcing stat roll');
                setCharacter(prev => ({ ...prev!, stats: rollAllStats().stats })); 
            }
        }
        return;
    }
    
    if (character && character.class && character.race && character.background && (!character.features?.length || !character.personality?.trait)) {
      logger.debug('Triggering AI details fetcher load based on partial data');
      fetcher.load(`/api/generate-character-details?class=${character.class}&race=${character.race}&background=${character.background}`);
    }
  }, [character?.class, character?.race, character?.background, character?.features, character?.personality, fetcher, aiData, character.stats?.strength, initialData, hasInitializedStats, character]);

  // Helper function to check if required portrait generation fields are complete
  const isPortraitGenerationReady = (): boolean => {
    return !!(
      character.race && 
      character.class && 
      character.appearance && 
      character.appearance.trim().length > 10
    );
  };

  // Helper function to get portrait readiness status for validation feedback
  const getPortraitReadinessStatus = useCallback(() => {
    const checks = {
      race: !!character.race,
      class: !!character.class,
      appearance: !!(character.appearance && character.appearance.trim().length > 10),
      personality: !!(character.personality?.trait && character.personality.trait.trim().length > 0),
      weapon: !!(character.weapons?.primary?.name && character.weapons.primary.name.trim().length > 0 && character.weapons.primary.name !== 'Unarmed Strike'),
      armor: !!(character.armor && (typeof character.armor === 'string' ? character.armor.trim().length > 0 : character.armor.name.trim().length > 0)),
    };
    
    const allReady = Object.values(checks).every(Boolean);
    return { checks, allReady };
  }, [character.race, character.class, character.appearance, character.personality?.trait, character.weapons?.primary?.name, character.armor?.name]);

  // Import Puter.js client functions

  // Import Puter.js client functions
  const [portraitRetryCount, setPortraitRetryCount] = useState(0);
  const [portraitCancelled, setPortraitCancelled] = useState(false);
  const MAX_PORTRAIT_RETRIES = 2;

  // Cancel portrait generation
  const handleCancelPortraitGeneration = () => {
    setIsLoadingPortrait(false);
    setPortraitRetryCount(0);
    setPortraitCancelled(true);
    logger.debug('Generation cancelled by user');
  };

  // Effect to trigger retries when portraitRetryCount changes
  useEffect(() => {
    if (portraitRetryCount > 0 && portraitRetryCount <= MAX_PORTRAIT_RETRIES) {
      logger.debug('Executing retry attempt', { retryCount: portraitRetryCount });
      // Use a timeout to prevent rapid-fire retries and allow state to settle
      const timer = setTimeout(() => handleGeneratePortrait(), 500);
      return () => clearTimeout(timer);
    }
  }, [portraitRetryCount]); // This hook now reliably handles retries

  const finalizeCharacter = useCallback((): Character => {
    const finalCharacter: Character = {
      ...defaultCharacter,
      ...character,
      name: character.name || `Unnamed Hero ${crypto.randomUUID().slice(0, 4)}`,
      id: character.id || crypto.randomUUID(),
      slotIndex: character.slotIndex !== undefined ? character.slotIndex : (slotIndex !== undefined ? slotIndex : 0),
      avatarUrl: character.avatarUrl || defaultCharacter.avatarUrl, // Ensure avatarUrl is passed
      stats: character.stats || defaultCharacter.stats,
      weapons: { 
        primary: { ...defaultCharacter.weapons!.primary, ...(character.weapons?.primary || {}) } as Weapon,
        secondary: { ...(defaultCharacter.weapons!.secondary || {}), ...(character.weapons?.secondary || {}) } as Weapon | undefined,
        ranged: { ...(defaultCharacter.weapons!.ranged || {}), ...(character.weapons?.ranged || {}) } as Weapon | undefined,
      },
      spellSlots: { 
        level1: { ...(defaultCharacter.spellSlots!.level1), ...(character.spellSlots?.level1 || {}) },
        level2: { ...(defaultCharacter.spellSlots!.level2), ...(character.spellSlots?.level2 || {}) },
        level3: character.spellSlots?.level3, level4: character.spellSlots?.level4, level5: character.spellSlots?.level5, level6: character.spellSlots?.level6,
        level7: character.spellSlots?.level7, level8: character.spellSlots?.level8, level9: character.spellSlots?.level9, level10: character.spellSlots?.level10,
        level11: character.spellSlots?.level11, level12: character.spellSlots?.level12, level13: character.spellSlots?.level13, level14: character.spellSlots?.level14,
        level15: character.spellSlots?.level15, level16: character.spellSlots?.level16, level17: character.spellSlots?.level17, level18: character.spellSlots?.level18,
        level19: character.spellSlots?.level19, level20: character.spellSlots?.level20,
      } as SpellSlots, // Cast to SpellSlots
      spells: { 
        cantrips: [...(defaultCharacter.spells!.cantrips || []), ...(character.spells?.cantrips || [])],
        level1: [...(defaultCharacter.spells!.level1 || []), ...(character.spells?.level1 || [])],
        level2: [...(defaultCharacter.spells!.level2 || []), ...(character.spells?.level2 || [])],
        level3: character.spells?.level3, level4: character.spells?.level4, level5: character.spells?.level5, level6: character.spells?.level6,
        level7: character.spells?.level7, level8: character.spells?.level8, level9: character.spells?.level9, level10: character.spells?.level10,
        level11: character.spells?.level11, level12: character.spells?.level12, level13: character.spells?.level13, level14: character.spells?.level14,
        level15: character.spells?.level15, level16: character.spells?.level16, level17: character.spells?.level17, level18: character.spells?.level18,
        level19: character.spells?.level19, level20: character.spells?.level20,
      } as Character['spells'], // Cast to Character['spells']
      personality: { ...defaultCharacter.personality, ...character.personality },
    };
    
    return finalCharacter;
  }, [character, defaultCharacter, slotIndex]);



  // Auto-trigger portrait generation when reaching Step 4 or when fields become complete
  useEffect(() => {
    const { allReady } = getPortraitReadinessStatus();
    
    if (
      step === 4 && // Personality step
      !character.avatarUrl && // No portrait exists
      !isLoadingPortrait && // Not already generating
      !isEditing && // Only for new characters
      allReady // Required fields complete
    ) {
      logger.debug('Triggering automatic portrait generation');
      handleGeneratePortrait();
    }
    
    // For editing: show prompt on first entry to step 4, regardless of appearance changes
    if (
      isEditing && 
      step === 4 && 
      !isLoadingPortrait && 
      allReady &&
      character.avatarUrl &&
      !hasShownEditPortraitPrompt
    ) {
      // Show confirmation prompt once per edit session
      setShowPortraitConfirm(true);
      setHasShownEditPortraitPrompt(true);
    } else if (!isEditing || step !== 4) {
      // Hide prompt when not editing or not in step 4
      setShowPortraitConfirm(false);
      setHasShownEditPortraitPrompt(false); // Reset for next edit session
    }
  }, [step, character.avatarUrl, isLoadingPortrait, isEditing, character.race, character.class, character.appearance, hasShownEditPortraitPrompt]);

  // Client-side Puter.js image generation
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    let processedValue: string | number = value || '';
    
    if (type === 'number') {
      processedValue = parseInt(value || '0', 10);
      if (isNaN(processedValue as number)) {
        processedValue = 0;
      }
    }
    
    setCharacter(prev => ({ ...prev!, [name]: processedValue }));
  }, []);
  
  const handleNestedChange = (category: keyof Character, field: string, value: string | number | Weapon | SpellSlots) => {
    setCharacter(prev => {
      const newChar = { ...prev! };
      if (newChar[category] === undefined || newChar[category] === null) {
        switch (category) {
          case 'stats':
            newChar.stats = { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 };
            break;
          case 'weapons':
            newChar.weapons = { primary: { name: 'Unarmed Strike', attackBonus: '+0', damage: '1d1', damageAttribute: 'Strength' } };
            break;
          case 'spellSlots':
            newChar.spellSlots = { level1: { current: 0, max: 0 }, level2: { current: 0, max: 0 } };
            break;
          case 'spells':
            newChar.spells = { cantrips: [], level1: [], level2: [] };
            break;
          case 'personality':
            newChar.personality = { trait: '', ideal: '', bond: '', flaw: '' };
            break;
          default:
            // For other nested object types that might be undefined, ensure they are initialized as objects
            // This is a defensive move, ideally all object types would be covered by cases above
            // Explicitly cast to Record<string, any> to allow property assignment
            if (typeof newChar[category] === 'object' && newChar[category] !== null) {
              // If it's already an object, just ensure it's not null
            } else {
              (newChar as Record<string, any>)[category] = {};
            }
        }
      }
      
      // Now, safely update the specific field within the nested object
      // This requires type assertion or careful handling as TypeScript doesn't know the exact type of newChar[category] here
      (newChar[category] as any)[field] = value || '';
      return newChar;
    });
  };  

  const handleMultiSelectChange = (category: 'inventory' | 'equipment' | 'savingThrows' | 'skills' | 'features', subCategory: undefined, value: string) => {
    setCharacter(prev => {
      const newChar = { ...prev! };
      const currentItems = (newChar[category] as string[]) || [];
      newChar[category] = currentItems.includes(value) ? currentItems.filter(item => item !== value) : [...currentItems, value];
      return newChar;
    });
  };

  const handleSpellMultiSelectChange = (spellCategory: 'cantrips' | 'level1' | 'level2', value: string) => {
    setCharacter(prev => {
      const newChar = { ...prev! };
      const spells = newChar.spells || { cantrips: [], level1: [], level2: [] };
      const spellList = spells[spellCategory] || [];
      spells[spellCategory] = spellList.includes(value) ? spellList.filter(spell => spell !== value) : [...spellList, value];
      newChar.spells = spells;
      return newChar;
    });
  };

  const handleWeaponChange = (weaponType: 'primary' | 'secondary' | 'ranged', weapon: Weapon) => {
    setCharacter(prev => ({
      ...prev!,
      weapons: { ...(prev!.weapons || {}), [weaponType]: weapon },
    }));
  };

  const handleSpellSlotsChange = (level: 'level1' | 'level2', type: 'current' | 'max', value: number) => {
    setCharacter(prev => {
      const currentSpellSlots = prev!.spellSlots || {
        level1: { current: 0, max: 0 },
        level2: { current: 0, max: 0 },
        level3: undefined, level4: undefined, level5: undefined, level6: undefined,
        level7: undefined, level8: undefined, level9: undefined, level10: undefined,
        level11: undefined, level12: undefined, level13: undefined, level14: undefined,
        level15: undefined, level16: undefined, level17: undefined, level18: undefined,
        level19: undefined, level20: undefined,
      };

      return {
        ...prev!,
        spellSlots: { 
          ...currentSpellSlots, 
          [level]: { 
            ...(currentSpellSlots[level] || { current: 0, max: 0 }), 
            [type]: value 
          } 
        } 
      };
    });
  };
  
  const handleRollStats = () => {
    const result = rollAllStats();
    setCharacter(prev => ({ ...prev!, stats: result.stats, statRolls: result.statRolls }));
    setIsRandomizing(false);
  };

  const handleGeneratePortrait = useCallback(async () => {
    if (isLoadingPortrait) return;
    
    // Check regeneration limit
    if (regenerationCount >= MAX_REGENERATIONS) {
      logger.debug('Regeneration limit reached. Cannot generate more portraits');
      return; // Prevent further generations
    }

    // Reset cancelled flag when starting a new generation
    setPortraitCancelled(false);
    setIsLoadingPortrait(true);
    
    // Increment regeneration count
    setRegenerationCount(prev => prev + 1);
    

    
    // Fallback to server-side generation
    logger.debug('Falling back to server-side generation');
    
    const formData = new FormData();
    formData.append('intent', 'generatePortrait');
    formData.append('characterData', JSON.stringify(finalizeCharacter()));
    // Explicitly tell the server which model/provider to use for the config
    formData.append('model', 'gemini-2.5-flash-image-preview');
    formData.append('provider', 'puter-js');
    if (character.id) {
      formData.append('characterId', character.id);
    }
    
    logger.debug('Submitting to action', { action: '/api/character/portrait/generate' });
    fetcher.submit(formData, { method: 'post', action: '/api/character/portrait/generate' });
    
  }, [isLoadingPortrait, regenerationCount, character, finalizeCharacter, fetcher]);

  const handleConfirm = useCallback(() => {
    const finalCharacter = finalizeCharacter();
    const originalId = initialData?.id;

    if (confirmAction === 'save' || confirmAction === 'overwrite') {
      onSave(finalCharacter, slotIndex);
    } else if (confirmAction === 'saveAsNew') {
      onSave(finalCharacter, undefined, saveAsNewName, isEditing ? originalId : undefined);
    }
    setShowConfirm(false);
  }, [confirmAction, saveAsNewName, initialData, onSave, slotIndex, finalizeCharacter, isEditing]);

  const handleSubmit = useCallback(() => {
    const finalCharacter = finalizeCharacter();

    if (isEditing && initialData && finalCharacter.name !== initialData.name) {
      setSaveAsNewName(finalCharacter.name);
      setConfirmAction('overwrite');
      setShowConfirm(true);
    } else {
      onSave(finalCharacter, slotIndex);
    }
    }, [finalizeCharacter, isEditing, initialData, onSave, slotIndex]);

  // Fix useEffect dependencies by using stable references
  useEffect(() => {
    logger.debug('Fetcher state changed', { state: fetcher.state });
    logger.debug('Fetcher data', { data: fetcher.data });
    
    if (fetcher.state === 'idle') {
      if (fetcher.data) { // Data is available, meaning the fetch is complete
        if (fetcher.data.success) {
          logger.debug('Server-side generation completed successfully');
          if (fetcher.data.portraitUrl) { 
            const imageUrl = fetcher.data.portraitUrl; 
            logger.debug("Client received portraitUrl:", { imageUrl });
            setCharacter(prev => ({ ...prev!, avatarUrl: imageUrl }));
            setPortraitRetryCount(0); // Reset retry count on success
          } else {
            // If success but no portraitBase64, it's an unexpected scenario for portrait generation
            logger.error('Server-side portrait generation succeeded but did not return portrait data.');
          }
        } else {
          logger.error('Server-side generation failed', { error: fetcher.data.error as string });
          if (portraitRetryCount < MAX_PORTRAIT_RETRIES && !portraitCancelled) {
            logger.debug('Retrying generation', { 
              attempt: portraitRetryCount + 1,
              maxRetries: MAX_PORTRAIT_RETRIES
            });
            // Let the dedicated useEffect handle the retry logic
            setPortraitRetryCount(prev => prev + 1);
          } else {
            logger.error('Max retries reached or generation cancelled');
            setPortraitRetryCount(0);
          }
        }
        // Always set isLoadingPortrait to false here, as the fetcher is now idle and data is processed.
        setIsLoadingPortrait(false);
      }
    }
  }, [fetcher.data, fetcher.state, portraitCancelled, portraitRetryCount]);

  // Auto-trigger portrait generation when reaching Step 4 or when fields become complete
  useEffect(() => {
    const { allReady } = getPortraitReadinessStatus();
    
    if (
      step === 4 && // Personality step
      !character.avatarUrl && // No portrait exists
      !isLoadingPortrait && // Not already generating
      !isEditing && // Only for new characters
      allReady // Required fields complete
    ) {
      logger.debug('Triggering automatic portrait generation');
      handleGeneratePortrait();
    }
    
    // For editing: show prompt on first entry to step 4, regardless of appearance changes
    if (
      isEditing && 
      step === 4 && 
      !isLoadingPortrait && 
      allReady &&
      character.avatarUrl &&
      !hasShownEditPortraitPrompt
    ) {
      // Show confirmation prompt once per edit session
      setShowPortraitConfirm(true);
      setHasShownEditPortraitPrompt(true);
    } else if (!isEditing || step !== 4) {
      // Hide prompt when not editing or not in step 4
      setShowPortraitConfirm(false);
      setHasShownEditPortraitPrompt(false); // Reset for next edit session
    }
  }, [step, character.avatarUrl, isLoadingPortrait, isEditing, character.race, character.class, character.appearance, hasShownEditPortraitPrompt, getPortraitReadinessStatus]);  const renderStep = () => {
    switch (step) {
      case 0: // Core
        return (
          <>
            <h2 className="text-3xl font-medieval text-red-500 mb-6">Choose Your Path</h2>
            <div className="space-y-4">
              <Input label="Name" name="name" value={character.name || ''} onChange={handleInputChange} />
              <Select label="Race" name="race" value={character.race} onChange={handleInputChange} options={RACES} />
              <Select label="Class" name="class" value={character.class} onChange={handleInputChange} options={CLASSES} />
              <Input label="Level" name="level" type="number" value={character.level || 1} onChange={handleInputChange} min="1" />
              <Input label="Experience" name="experience" type="number" value={character.experience || 0} onChange={handleInputChange} min="0" />
              <Input label="Alignment" name="alignment" value={character.alignment || ''} onChange={handleInputChange} />
              <Input label="Background" name="background" value={character.background || ''} onChange={handleInputChange} />
              <Input label="Speed (ft)" name="speed" type="number" value={character.speed || 0} onChange={handleInputChange} min="0" />
              <Input label="Hit Dice" name="hitDice" value={character.hitDice || ''} onChange={handleInputChange} placeholder="e.g., 1d8, 3d8" />
              <Input label="Current HP" name="hp" type="number" value={character.hp || 0} onChange={handleInputChange} min="0" />
              <Input label="Max HP" name="maxHp" type="number" value={character.maxHp || 0} onChange={handleInputChange} min="0" />
              <Input label="Proficiency Bonus" name="proficiencyBonus" type="number" value={character.proficiencyBonus || 0} onChange={handleInputChange} min="0" />
            </div>
          </>
        );
      case 1: // Stats
        return (
          <>
            <h2 className="text-3xl font-medieval text-red-500 mb-6">Define Your Abilities</h2>
            <button 
              onClick={() => { setIsRandomizing(true); handleRollStats(); }} 
              className="bg-red-700 hover:bg-red-600 text-white font-bold py-2 px-4 rounded mb-6 w-full flex items-center justify-center"
              type="button"
              disabled={isRandomizing}
            >
              {isRandomizing ? "Rolling..." : "Roll 4d6 Drop Lowest for All Stats"}
            </button>
            {/* Dice Rolling Animation Placeholder */}
            {isRandomizing && (
              <div className="dice-animation mb-6">
                <div className="dice">?</div>
                <div className="dice">?</div>
                <div className="dice">?</div>
                <div className="dice">?</div>
              </div>
            )}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
            {Object.keys(character.stats || {}).map((statKey) => { 
                const stat = statKey as keyof AbilityScores;
                return ( // Change stat type to string
                <Input 
                  key={stat}
                  label={stat.charAt(0).toUpperCase() + stat.slice(1)} 
                  name={stat} 
                  type="number"
                  value={character.stats?.[stat as keyof AbilityScores] || 10} // Cast here to ensure safe access
                  onChange={(e) => handleNestedChange('stats', stat as keyof AbilityScores, parseInt(e.target.value, 10))} 
                  min="1"
                />
              );
              })}
            </div>
            <div className="space-y-4">
              <Select label="Primary Attribute" name="primaryAttribute" value={character.primaryAttribute} onChange={handleInputChange} options={['Strength', 'Dexterity', 'Constitution', 'Intelligence', 'Wisdom', 'Charisma']} />
              <Select label="Secondary Attribute" name="secondaryAttribute" value={character.secondaryAttribute} onChange={handleInputChange} options={['Strength', 'Dexterity', 'Constitution', 'Intelligence', 'Wisdom', 'Charisma']} />
              <div>
                <h3 className="text-xl text-gray-300 mb-2">Saving Throws</h3>
                <MultiSelect options={SAVING_THROWS} selected={character.savingThrows || []} onChange={(val) => handleMultiSelectChange('savingThrows', undefined, val)} />
              </div>
              <div>
                <h3 className="text-xl text-gray-300 mb-2">Skills</h3>
                <MultiSelect options={SKILLS} selected={character.skills || []} onChange={(val) => handleMultiSelectChange('skills', undefined, val)} />
              </div>
            </div>
          </>
        );
      case 2: // Combat & Gear
        return (
          <>
            <h2 className="text-3xl font-medieval text-red-500 mb-6">Gear Up & Prepare for Battle</h2>
            <div className="space-y-4">
              <Input label="Armor Class (AC)" name="ac" type="number" value={character.ac || 10} onChange={handleInputChange} min="0" />
              <Input label="Initiative Bonus" name="initiative" type="number" value={character.initiative || 0} onChange={handleInputChange} />
              <Input label="Passive Perception" name="passivePerception" type="number" value={character.passivePerception || 10} onChange={handleInputChange} min="0" />
              <Select label="Armor Type" name="armor" value={character.armor || ''} onChange={handleInputChange} options={ARMOR_TYPES} />
              <Select label="Fighting Style" name="fightStyle" value={character.fightStyle || ''} onChange={handleInputChange} options={FIGHT_STYLES} />
              
              <h3 className="text-xl text-gray-300 mb-2 mt-6">Melee Weapons</h3>
              <WeaponInput label="Primary Weapon" weapon={character.weapons?.primary} onChange={(w) => handleWeaponChange('primary', w)} category="melee" />
              <WeaponInput label="Secondary Weapon (Optional)" weapon={character.weapons?.secondary} onChange={(w) => handleWeaponChange('secondary', w)} category="melee" />

              <h3 className="text-xl text-gray-300 mb-2 mt-6">Ranged Weapon (Optional)</h3>
              <WeaponInput label="Ranged Weapon" weapon={character.weapons?.ranged} onChange={(w) => handleWeaponChange('ranged', w)} category="ranged" />

              <h3 className="text-xl text-gray-300 mb-2 mt-6">Equipment (Worn/Carried Utility)</h3>
              <MultiSelect options={INVENTORY_ITEMS} selected={character.equipment || []} onChange={(val) => handleMultiSelectChange('equipment', undefined, val)} allowCustom={true} />
              
              <h3 className="text-xl text-gray-300 mb-2 mt-6">Inventory Items (In Backpack/Stash)</h3>
              <MultiSelect options={INVENTORY_ITEMS} selected={character.inventory || []} onChange={(val) => handleMultiSelectChange('inventory', undefined, val)} allowCustom={true} />
            </div>
          </>
        );
      case 3: { // Spells & Features
        const availableCantrips = CANTRIPS[(character.class || '') as keyof typeof CANTRIPS] || [];
        const availableLevel1Spells = LEVEL_1_SPELLS[(character.class || '') as keyof typeof LEVEL_1_SPELLS] || [];
        const availableLevel2Spells = LEVEL_2_SPELLS[(character.class || '') as keyof typeof LEVEL_2_SPELLS] || [];

        return (
          <>
            <h2 className="text-3xl font-medieval text-red-500 mb-6">Arcane Arts & Unique Talents</h2>
            <div className="space-y-4">
              <h3 className="text-xl text-gray-300 mb-2">Spellcasting Details</h3>
              <Select 
                label="Spellcasting Ability" 
                name="spellcastingAbility" 
                value={character.spellcastingAbility} 
                onChange={handleInputChange} 
                options={['Strength', 'Dexterity', 'Constitution', 'Intelligence', 'Wisdom', 'Charisma']} 
              />
              <Input label="Spell Save DC" name="spellSaveDC" type="number" value={character.spellSaveDC || 8} onChange={handleInputChange} min="8" />
              <Input label="Spell Attack Bonus" name="spellAttackBonus" value={character.spellAttackBonus || '+0'} onChange={handleInputChange} placeholder="+X" />

              <h3 className="text-xl text-gray-300 mb-2 mt-6">Spell Slots</h3>
              <SpellSlotInput label="Level 1 Slots" level="level1" spellSlots={character.spellSlots} onChange={handleSpellSlotsChange} />
              <SpellSlotInput label="Level 2 Slots" level="level2" spellSlots={character.spellSlots} onChange={handleSpellSlotsChange} />

              {availableCantrips.length > 0 && <div className="mt-4">
                <h3 className="text-xl text-gray-300 mb-2">Cantrips</h3>
                <MultiSelect options={availableCantrips} selected={character.spells?.cantrips || []} onChange={(val) => handleSpellMultiSelectChange('cantrips', val)} />
              </div>}
              {availableLevel1Spells.length > 0 && <div className="mt-4">
                <h3 className="text-xl text-gray-300 mb-2">Level 1 Spells</h3>
                <MultiSelect options={availableLevel1Spells} selected={character.spells?.level1 || []} onChange={(val) => handleSpellMultiSelectChange('level1', val)} />
              </div>}
              {availableLevel2Spells.length > 0 && (
                <div className="mt-4">
                  <h3 className="text-xl text-gray-300 mb-2">Level 2 Spells</h3>
                  <MultiSelect 
                    options={availableLevel2Spells} 
                    selected={character.spells?.level2 || []} 
                    onChange={(val) => handleSpellMultiSelectChange('level2', val)} 
                  />
                </div>
              )}

              <h3 className="text-xl text-gray-300 mb-2 mt-6">Features & Traits</h3>
              {/* {isLoadingAI && <p className="text-gray-400">Generating features...</p>} */}
              <MultiSelect options={character.features || []} selected={character.features || []} onChange={(val) => handleMultiSelectChange('features', undefined, val)} allowCustom={true} />
            </div>
          </>
        );
      } // End of case 3
      case 4: // Personality & Appearance
        return (
          <>
            <h2 className="text-3xl font-medieval text-red-500 mb-6">Who Are You?</h2>
            <div className="space-y-4">
              {/* {isLoadingAI && <p className="text-gray-400">Generating personality...</p>} */}
              <Select label="Trait" name="trait" value={character.personality?.trait || ''} onChange={(e) => handleNestedChange('personality', 'trait', e.target.value)} options={TRAITS} />
              <Select label="Ideal" name="ideal" value={character.personality?.ideal || ''} onChange={(e) => handleNestedChange('personality', 'ideal', e.target.value)} options={IDEALS} />
              <Select label="Bond" name="bond" value={character.personality?.bond || ''} onChange={(e) => handleNestedChange('personality', 'bond', e.target.value)} options={BONDS} />
              <Select label="Flaw" name="flaw" value={character.personality?.flaw || ''} onChange={(e) => handleNestedChange('personality', 'flaw', e.target.value)} options={FLAWS} />
              <TextArea label="Appearance" name="appearance" value={character.appearance || ''} onChange={handleInputChange} rows={4} />
              
              <div className="mt-6">
                <h3 className="text-xl text-gray-300 mb-2">Character Portrait</h3>
                
                {/* Auto-generation hint */}
                {!character.avatarUrl && !isLoadingPortrait && !isPortraitGenerationReady() && (
                  <div className="mb-3 p-3 bg-blue-900 bg-opacity-30 border border-blue-500 rounded-md">
                    <p className="text-sm text-blue-300">
                      💡 Fill in your appearance description above to auto-generate a portrait
                    </p>
                  </div>
                )}

                {/* Edit mode regeneration prompt */}
                {isEditing && editModeVerified && showPortraitConfirm && !isLoadingPortrait && (
                  <div className="mb-4 p-4 bg-yellow-900 bg-opacity-30 border border-yellow-500 rounded-md">
                    <p className="text-sm text-yellow-300 mb-3">
                      ✨ You're in edit mode with updated character details. Would you like to regenerate the portrait with these changes?
                    </p>
                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={() => {
                          handleGeneratePortrait();
                          setShowPortraitConfirm(false);
                        }}
                        className="bg-green-600 hover:bg-green-500 text-white font-bold py-2 px-4 rounded-md"
                      >
                        Yes, Regenerate
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowPortraitConfirm(false)}
                        className="bg-gray-600 hover:bg-gray-500 text-white font-bold py-2 px-4 rounded-md"
                      >
                        Keep Current
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowPortraitConfirm(false)}
                        className="bg-blue-600 hover:bg-blue-500 text-white font-bold py-2 px-4 rounded-md"
                      >
                        Preview Current Portrait
                      </button>
                    </div>
                  </div>
                )}

                {/* Validation checklist */}
                {!character.avatarUrl && !isLoadingPortrait && (
                  <div className="mb-4 p-3 bg-gray-800 rounded-md border border-gray-600">
                    <p className="text-sm font-semibold text-gray-300 mb-2">Portrait Requirements:</p>
                    <ul className="text-sm space-y-1">
                      <li className={getPortraitReadinessStatus().checks.race ? 'text-green-400' : 'text-gray-500'}>
                        {getPortraitReadinessStatus().checks.race ? '✓' : '○'} Race selected
                      </li>
                      <li className={getPortraitReadinessStatus().checks.class ? 'text-green-400' : 'text-gray-500'}>
                        {getPortraitReadinessStatus().checks.class ? '✓' : '○'} Class selected
                      </li>
                      <li className={getPortraitReadinessStatus().checks.appearance ? 'text-green-400' : 'text-gray-500'}>
                        {getPortraitReadinessStatus().checks.appearance ? '✓' : '○'} Appearance described (10+ characters)
                      </li>
                      <li className={getPortraitReadinessStatus().checks.personality ? 'text-blue-400' : 'text-gray-500'}>
                        {getPortraitReadinessStatus().checks.personality ? '✓' : '○'} Personality selected (recommended)
                      </li>
                      <li className={getPortraitReadinessStatus().checks.weapon ? 'text-blue-400' : 'text-gray-500'}>
                        {getPortraitReadinessStatus().checks.weapon ? '✓' : '○'} Primary weapon equipped (recommended)
                      </li>
                      <li className={getPortraitReadinessStatus().checks.armor ? 'text-blue-400' : 'text-gray-500'}>
                        {getPortraitReadinessStatus().checks.armor ? '✓' : '○'} Armor selected (recommended)
                      </li>
                    </ul>
                  </div>
                )}
                
                {/* Loading overlay */}
                {isLoadingPortrait && (
                  <div className="flex flex-col items-center gap-4 p-6 bg-gray-800 rounded-md border-2 border-purple-500 animate-pulse">
                    <div className="w-48 h-48 bg-gray-700 rounded-md flex flex-col items-center justify-center">
                      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500 mb-3"></div>
                      <p className="text-purple-400 font-semibold">Generating Portrait...</p>
                      <p className="text-gray-400 text-sm mt-2">This may take 10-15 seconds</p>
                    </div>
                    <button
                      type="button"
                      onClick={handleCancelPortraitGeneration}
                      className="text-sm text-gray-400 hover:text-gray-300 underline"
                    >
                      Cancel Generation
                    </button>
                  </div>
                )}
                
                {/* Existing portrait display */}
                {!isLoadingPortrait && character.avatarUrl && (
                  <div className="flex flex-col items-center gap-4">
                    <img 
                      src={character.avatarUrl} 
                      alt="Character Portrait" 
                      className="w-48 h-48 object-cover rounded-md border-2 border-red-500" 
                    />
                    <p className="text-sm text-gray-400">Generated {regenerationCount}/{MAX_REGENERATIONS}</p>
                    {regenerationCount >= MAX_REGENERATIONS && (
                      <p className="text-sm text-yellow-400">Maximum portrait regenerations reached. No further regenerations allowed.</p>
                    )}
                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={handleGeneratePortrait}
                        disabled={isLoadingPortrait || regenerationCount >= MAX_REGENERATIONS}
                        className={`font-bold py-2 px-4 rounded-md transition duration-200 disabled:opacity-50 disabled:cursor-not-allowed ${regenerationCount >= MAX_REGENERATIONS ? 'bg-gray-600 text-gray-400' : 'bg-purple-700 hover:bg-purple-600 text-white'}`}
                      >
                        {isLoadingPortrait ? 'Generating...' : 'Generate Another Portrait'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          // Keep this portrait - proceed to next step
                          setStep(s => Math.min(s + 1, STEPS.length - 1));
                        }}
                        className="bg-green-700 hover:bg-green-600 text-white font-bold py-2 px-4 rounded-md transition duration-200"
                      >
                        Keep This Portrait
                      </button>
                    </div>
                  </div>
                )}
                
                {/* No portrait yet */}
                {!isLoadingPortrait && !character.avatarUrl && (
                  <div className="flex flex-col items-center gap-4">
                    <div className="w-48 h-48 bg-gray-700 rounded-md flex items-center justify-center text-gray-400">
                      No Portrait Generated
                    </div>
                    <button
                      type="button"
                      onClick={handleGeneratePortrait}
                      disabled={isLoadingPortrait}
                      className="bg-blue-700 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded-md transition duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isLoadingPortrait ? 'Generating...' : 'Generate Portrait'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </>
        );
      case 5: // Review
        return (
          <>
            <h2 className="text-3xl font-medieval text-red-500 mb-6">Review Your Hero</h2>
            <div className="text-gray-300 space-y-2 bg-gray-800 p-4 rounded-md">
              {character.avatarUrl && (
                <div className="mb-6 text-center bg-gray-800 p-4 rounded-md border border-gray-700">
                  <h3 className="text-lg font-semibold text-red-400 mb-3">Character Portrait</h3>
                  <img 
                    src={character.avatarUrl} 
                    alt="Character Portrait" 
                    className="w-48 h-48 object-cover rounded-md border-2 border-red-500 mx-auto shadow-lg" 
                  />
                  <button
                    type="button"
                    onClick={() => setStep(4)} // Navigate back to personality step
                    className="mt-3 text-sm text-blue-400 hover:text-blue-300 underline"
                  >
                    Edit Portrait
                  </button>
                </div>
              )}
              {/* Portrait Regeneration Counter */}
              {character.avatarUrl && (
                <div className="mt-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-gray-300">Portrait Regenerations</span>
                    <span className={`text-sm font-semibold ${
                      regenerationCount >= MAX_REGENERATIONS 
                        ? 'text-red-400' 
                        : regenerationCount >= MAX_REGENERATIONS - 1 
                          ? 'text-yellow-400' 
                          : 'text-green-400'
                    }`}>
                      {regenerationCount}/{MAX_REGENERATIONS}
                    </span>
                  </div>
                  <div className="w-full bg-gray-700 rounded-full h-2">
                    <div 
                      className={`h-2 rounded-full transition-all duration-300 ${
                        regenerationCount >= MAX_REGENERATIONS 
                          ? 'bg-red-600' 
                          : regenerationCount >= MAX_REGENERATIONS - 1 
                            ? 'bg-yellow-600' 
                            : 'bg-green-600'
                      }`}
                      style={{ width: `${(regenerationCount / MAX_REGENERATIONS) * 100}%` }}
                    ></div>
                  </div>
                  {regenerationCount >= MAX_REGENERATIONS && (
                    <p className="text-red-400 text-xs mt-2">Maximum portrait regenerations reached. You cannot generate more portraits for this character.</p>
                  )}
                </div>
              )}
              <p><strong>Name:</strong> {character.name}</p>
              <p><strong>Race:</strong> {character.race}</p>
              <p><strong>Class:</strong> {character.class} (Level {character.level})</p>
              <p><strong>Experience:</strong> {character.experience}</p>
              <p><strong>Alignment:</strong> {character.alignment}</p>
              <p><strong>Background:</strong> {character.background}</p>
              <p><strong>Speed:</strong> {character.speed} ft</p>
              <p><strong>Hit Dice:</strong> {character.hitDice}</p>
              <p><strong>HP:</strong> {character.hp}/{character.maxHp}</p>
              <p><strong>Proficiency Bonus:</strong> +{character.proficiencyBonus}</p>
              <p><strong>Strength:</strong> {character.stats?.strength}</p>
              <p><strong>Dexterity:</strong> {character.stats?.dexterity}</p>
              <p><strong>Constitution:</strong> {character.stats?.constitution}</p>
              <p><strong>Intelligence:</strong> {character.stats?.intelligence}</p>
              <p><strong>Wisdom:</strong> {character.stats?.wisdom}</p>
              <p><strong>Charisma:</strong> {character.stats?.charisma}</p>
              <p><strong>Primary Attribute:</strong> {character.primaryAttribute}</p>
              <p><strong>Secondary Attribute:</strong> {character.secondaryAttribute}</p>
              <p><strong>Saving Throws:</strong> {character.savingThrows?.join(', ') || 'None'}</p>
              <p><strong>Skills:</strong> {character.skills?.join(', ') || 'None'}</p>
              <p><strong>Armor:</strong> {character.armor}</p>
              <p><strong>Fighting Style:</strong> {character.fightStyle}</p>
              <p><strong>AC:</strong> {character.ac}</p>
              <p><strong>Initiative:</strong> {character.initiative}</p>
              <p><strong>Passive Perception:</strong> {character.passivePerception}</p>
              <p><strong>Primary Weapon:</strong> {character.weapons?.primary?.name} ({character.weapons?.primary?.attackBonus}, {character.weapons?.primary?.damage})</p>
              {character.weapons?.secondary && <p><strong>Secondary Weapon:</strong> {character.weapons?.secondary?.name} ({character.weapons?.secondary?.attackBonus}, {character.weapons?.secondary?.damage})</p>}
              {character.weapons?.ranged && <p><strong>Ranged Weapon:</strong> {character.weapons?.ranged?.name} ({character.weapons?.ranged?.attackBonus}, {character.weapons?.ranged?.damage})</p>}
              <p><strong>Equipment (Utility):</strong> {character.equipment?.join(', ') || 'None'}</p>
              <p><strong>Inventory Items (Stash):</strong> {character.inventory?.join(', ') || 'None'}</p>
              
              <h6 className="font-semibold mt-2 text-red-300">Spellcasting:</h6>
              <p><strong>Ability:</strong> {character.spellcastingAbility}</p>
              <p><strong>Save DC:</strong> {character.spellSaveDC}</p>
              <p><strong>Attack Bonus:</strong> {character.spellAttackBonus}</p>
              <p><strong>Cantrips:</strong> {character.spells?.cantrips?.join(', ') || 'None'}</p>
              <p><strong>Level 1 Spells:</strong> {character.spells?.level1?.join(', ') || 'None'}</p>
              <p><strong>Level 2 Spells:</strong> {character.spells?.level2?.join(', ') || 'None'}</p>
              <p><strong>Level 1 Spell Slots:</strong> {character.spellSlots?.level1?.current}/{character.spellSlots?.level1?.max}</p>
              <p><strong>Level 2 Spell Slots:</strong> {character.spellSlots?.level2?.current}/{character.spellSlots?.level2?.max}</p>
              
              <h6 className="font-semibold mt-2 text-red-300">Features & Personality:</h6>
              <p><strong>Features:</strong> {character.features?.join(', ') || 'None'}</p>
              <p><strong>Trait:</strong> {character.personality?.trait}</p>
              <p><strong>Ideal:</strong> {character.personality?.ideal}</p>
              <p><strong>Bond:</strong> {character.personality?.bond}</p>
              <p><strong>Flaw:</strong> {character.personality?.flaw}</p>
              <p><strong>Appearance:</strong> {character.appearance}</p>
            </div>
          </>
        );
      default:
        return null;
    }
  };

  return (
    <ErrorBoundary
      fallback={
        <div className="bg-red-900 bg-opacity-20 border border-red-600 rounded-lg p-6">
          <h2 className="text-2xl font-bold text-red-400 mb-4">Character Form Error</h2>
          <p className="text-gray-300 mb-4">There was an error loading the character creation form. Please try refreshing the page.</p>
          <button
            onClick={() => window.location.reload()}
            className="bg-red-600 hover:bg-red-500 text-white font-bold py-2 px-4 rounded"
          >
            Refresh Page
          </button>
        </div>
      }
    >
      <div className="w-full max-w-3xl bg-black bg-opacity-50 p-8 rounded-lg border border-gray-700 shadow-lg relative max-h-[90vh] overflow-y-auto">
        <h1 className="text-5xl font-medieval text-red-600 text-center mb-4">
          {isEditing ? 'Edit Your Hero' : 'Create Your Hero'}
          {isEditing && editModeVerified && (
            <span className="ml-4 inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800 border border-green-200">
              <span className="w-2 h-2 bg-green-500 rounded-full mr-2"></span>
              Edit Mode Active
            </span>
          )}
        </h1>
      <div className="w-full mb-8">
        <div className="flex justify-between">
          {STEPS.map((s, i) => (
            <div key={s} className={`step-item ${i <= step ? 'text-red-500' : 'text-gray-500'}`}>{s}</div>
          ))}
        </div>
        <div className="bg-gray-700 h-1 w-full rounded-full mt-2">
          <div className="bg-red-600 h-1 rounded-full" style={{ width: `${(step / (STEPS.length - 1)) * 100}%` }}></div>
        </div>
        
        {/* Edit Mode Character Selection Validation */}
        {isEditing && editModeVerified && initialData && (
          <div className="mt-4 p-3 bg-blue-900 bg-opacity-20 border border-blue-600 rounded-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <span className="w-3 h-3 bg-blue-500 rounded-full mr-3"></span>
                <span className="text-blue-300 font-semibold">Editing Character:</span>
              </div>
              <span className="text-blue-200 text-sm">ID: {initialData.id}</span>
            </div>
            <div className="mt-2 text-blue-100">
              <span className="font-bold">{initialData.name}</span> - {initialData.race} {initialData.class} (Level {initialData.level})
            </div>
            <div className="mt-2 text-blue-200 text-sm">
              Slot: {slotIndex !== undefined ? `Slot ${slotIndex + 1}` : 'Not assigned to slot'}
            </div>
          </div>
        )}
      </div>

      <div className="min-h-[400px] overflow-y-auto pr-2">{renderStep()}</div>

      <div className="flex justify-between mt-8">
        <button onClick={onClose} className="bg-gray-600 hover:bg-gray-500 text-white font-bold py-2 px-4 rounded">Cancel</button>
        <div>
          {step > 0 && <button onClick={() => setStep(s => s - 1)} className="bg-gray-600 hover:bg-gray-500 text-white font-bold py-2 px-4 rounded mr-4">Back</button>}
          {step < STEPS.length - 1 && <button onClick={() => setStep(s => s + 1)} className="bg-red-700 hover:bg-red-600 text-white font-bold py-2 px-4 rounded">Next</button>}
          {step === STEPS.length - 1 && (
            <button onClick={handleSubmit} className="bg-green-700 hover:bg-green-600 text-white font-bold py-2 px-4 rounded">
              {isEditing ? 'Save Changes' : 'Confirm'}
            </button>
          )}
        </div>
      </div>

      {/* Confirmation Modal for Saving/Overwriting */}
      {showConfirm && (
        <div className="absolute inset-0 bg-black bg-opacity-80 flex flex-col items-center justify-center rounded-lg z-10">
          <h2 className="text-4xl font-medieval text-white mb-6">
            {isEditing && initialData && character.name !== initialData.name ? 'Name Changed!' : 'Finalize Your Hero?'}
          </h2>
          {isEditing && initialData && character.name !== initialData.name && (
            <div className="mb-4 w-full max-w-sm text-center">
              <p className="text-gray-300 mb-2">You changed the character's name from "{initialData.name}" to "{character.name}".</p>
              <p className="text-gray-300 mb-4">Do you want to:</p>
              <div className="flex flex-col gap-3">
                {slotIndex !== undefined ? (
                  // Option 1: Overwrite specific slot (if loaded from a player slot)
                  <button
                    onClick={() => { setConfirmAction('overwrite'); handleConfirm(); }}
                    className="bg-yellow-700 hover:bg-yellow-600 text-white font-bold py-2 px-4 rounded"
                  >
                    Overwrite Slot {slotIndex + 1} with "{character.name}"
                  </button>
                ) : (
                  // Option 2: Update existing character by ID (if loaded from general list/import)
                  <button
                    onClick={() => { setConfirmAction('overwrite'); handleConfirm(); }}
                    className="bg-yellow-700 hover:bg-yellow-600 text-white font-bold py-2 px-4 rounded"
                  >
                    Update Existing Character "{initialData.name}" to "{character.name}"
                  </button>
                )}
                <div className="flex items-center gap-2">
                  <input
                    id="save-as-new-name"
                    type="text"
                    value={saveAsNewName}
                    onChange={(e) => setSaveAsNewName(e.target.value)}
                    placeholder={`New ${character.name || 'Hero Name'}`}
                    className="flex-grow bg-gray-800 border border-gray-600 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500"
                  />
                  <button
                    onClick={() => { setConfirmAction('saveAsNew'); handleConfirm(); }}
                    className="bg-blue-700 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded"
                  >
                    Save as New
                  </button>
                </div>
              </div>
            </div>
          )}
          {(!isEditing || (isEditing && initialData && character.name === initialData.name)) && (
            <div className="flex gap-4">
              <button onClick={() => { setConfirmAction('save'); handleConfirm(); }} className="bg-green-700 hover:bg-green-600 text-white font-bold py-3 px-12 rounded text-xl">Yes</button>
              <button onClick={() => setShowConfirm(false)} className="bg-red-700 hover:bg-red-600 text-white font-bold py-3 px-12 rounded text-xl">No, go back</button>
            </div>
          )}
        </div>
      )}
    </div>
    </ErrorBoundary>
  );
}
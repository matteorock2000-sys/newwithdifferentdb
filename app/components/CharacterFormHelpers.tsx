import React, { useState, useEffect } from 'react';
import type { Weapon, SpellSlots } from '~/types';
import { MELEE_WEAPONS, RANGED_WEAPONS } from '~/data/dnd';

interface InputProps {
  label: string;
  name: string;
  value: string | number | undefined;
  onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => void;
  type?: 'text' | 'number';
  min?: string;
  placeholder?: string;
  rows?: number;
}

export const Input: React.FC<InputProps> = ({ label, name, value, onChange, type = 'text', min, placeholder }) => (
  <div className="space-y-1">
    <label htmlFor={name} className="block text-sm font-medium text-gray-400">{label}</label>
    <input
      id={name}
      name={name}
      type={type}
      value={value === undefined ? '' : value}
      onChange={onChange}
      min={min}
      placeholder={placeholder}
      className="w-full p-2 bg-gray-700 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
    />
  </div>
);

export const TextArea: React.FC<InputProps> = ({ label, name, value, onChange, rows = 3, placeholder }) => (
  <div className="space-y-1">
    <label htmlFor={name} className="block text-sm font-medium text-gray-400">{label}</label>
    <textarea
      id={name}
      name={name}
      value={value === undefined ? '' : value}
      onChange={onChange}
      rows={rows}
      placeholder={placeholder}
      className="w-full p-2 bg-gray-700 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
    />
  </div>
);

interface SelectProps {
  label: string;
  name: string;
  value: string | undefined;
  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  options: string[];
}

export const Select: React.FC<SelectProps> = ({ label, name, value, onChange, options }) => (
  <div className="space-y-1">
    <label htmlFor={name} className="block text-sm font-medium text-gray-400">{label}</label>
    <select
      id={name}
      name={name}
      value={value || ''}
      onChange={onChange}
      className="w-full p-2 bg-gray-700 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
    >
      <option value="" disabled>Select {label}</option>
      {options.map(option => (
        <option key={option} value={option}>{option}</option>
      ))}
    </select>
  </div>
);

interface MultiSelectProps {
  options: string[];
  selected: string[];
  onChange: (value: string) => void;
  allowCustom?: boolean;
}

export const MultiSelect: React.FC<MultiSelectProps> = ({ options, selected, onChange, allowCustom = false }) => {
  const [customInput, setCustomInput] = useState('');
  const [allOptions, setAllOptions] = useState(options);

  // Merge predefined options with currently selected custom options
  useEffect(() => {
    const customSelected = selected.filter(s => !options.includes(s));
    setAllOptions([...options, ...customSelected].sort());
  }, [options, selected]);

  const handleAddCustom = () => {
    if (customInput.trim() && !selected.includes(customInput.trim())) {
      onChange(customInput.trim());
      setCustomInput('');
    }
  };

  return (
    <div className="space-y-2">
      <div className="max-h-48 overflow-y-auto bg-gray-800 p-3 rounded-md border border-gray-700">
        {allOptions.map(option => (
          <label key={option} className="flex items-center gap-2 text-gray-300 hover:bg-gray-700 p-1 rounded cursor-pointer">
            <input
              type="checkbox"
              checked={selected.includes(option)}
              onChange={() => onChange(option)}
              className="form-checkbox h-4 w-4 text-red-600 bg-gray-600 border-gray-500 rounded"
            />
            {option}
          </label>
        ))}
      </div>
      {allowCustom && (
        <div className="flex gap-2">
          <input
            type="text"
            value={customInput}
            onChange={(e) => setCustomInput(e.target.value)}
            placeholder="Add custom item/feature"
            className="flex-grow p-2 bg-gray-700 border border-gray-600 rounded-md"
          />
          <button
            type="button"
            onClick={handleAddCustom}
            className="bg-blue-600 hover:bg-blue-500 text-white px-3 py-1 rounded-md text-sm"
          >
            Add
          </button>
        </div>
      )}
    </div>
  );
};

interface WeaponInputProps {
  label: string;
  weapon?: Weapon;
  onChange: (weapon: Weapon) => void;
  category: 'melee' | 'ranged';
}

export const WeaponInput: React.FC<WeaponInputProps> = ({ label, weapon, onChange, category }) => {
  const weaponOptions = category === 'melee' ? MELEE_WEAPONS : RANGED_WEAPONS;
  const defaultWeapon: Weapon = { name: '', attackBonus: '', damage: '', damageAttribute: 'Strength' };
  const currentWeapon = weapon || defaultWeapon;

  const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedName = e.target.value;
    const selectedWeapon = weaponOptions.find(w => w.name === selectedName);
    if (selectedWeapon) {
      onChange(selectedWeapon);
    } else {
      // If 'None' or empty is selected, clear the weapon
      onChange(defaultWeapon);
    }
  };

  const handleDetailChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    onChange({ ...currentWeapon, [name]: value });
  };

  return (
    <div className="p-3 bg-gray-800 rounded-md space-y-2 border border-gray-700">
      <h4 className="text-md font-bold text-gray-300">{label}</h4>
      <Select
        label="Weapon Type"
        name="name"
        value={currentWeapon.name}
        onChange={handleSelectChange}
        options={['', ...weaponOptions.map(w => w.name)]}
      />
      <Input
        label="Attack Bonus"
        name="attackBonus"
        value={currentWeapon.attackBonus}
        onChange={handleDetailChange}
        placeholder="+X"
      />
      <Input
        label="Damage"
        name="damage"
        value={currentWeapon.damage}
        onChange={handleDetailChange}
        placeholder="e.g., 1d8 + 3 slashing"
      />
      <Select
        label="Damage Attribute"
        name="damageAttribute"
        value={currentWeapon.damageAttribute}
        onChange={handleDetailChange}
        options={['Strength', 'Dexterity', 'Constitution', 'Intelligence', 'Wisdom', 'Charisma']}
      />
      <Input
        label="Special Properties"
        name="special"
        value={currentWeapon.special}
        onChange={handleDetailChange}
        placeholder="e.g., Finesse, Thrown (20/60)"
      />
    </div>
  );
};

interface SpellSlotInputProps {
  label: string;
  level: 'level1' | 'level2';
  spellSlots?: SpellSlots;
  onChange: (level: 'level1' | 'level2', type: 'current' | 'max', value: number) => void;
}

export const SpellSlotInput: React.FC<SpellSlotInputProps> = ({ label, level, spellSlots, onChange }) => {
  const currentSlots = spellSlots?.[level] || { current: 0, max: 0 };

  return (
    <div className="p-3 bg-gray-800 rounded-md space-y-2 border border-gray-700">
      <h4 className="text-md font-bold text-gray-300">{label}</h4>
      <div className="flex gap-4">
        <div className="flex-1">
          <label className="block text-sm font-medium text-gray-400">Current</label>
          <input
            type="number"
            value={currentSlots.current}
            onChange={(e) => onChange(level, 'current', parseInt(e.target.value, 10) || 0)}
            min="0"
            className="w-full p-2 bg-gray-700 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
          />
        </div>
        <div className="flex-1">
          <label className="block text-sm font-medium text-gray-400">Max</label>
          <input
            type="number"
            value={currentSlots.max}
            onChange={(e) => onChange(level, 'max', parseInt(e.target.value, 10) || 0)}
            min="0"
            className="w-full p-2 bg-gray-700 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
          />
        </div>
      </div>
    </div>
  );
};

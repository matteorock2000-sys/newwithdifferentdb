import React, { useState } from 'react';
import type { Character } from '~/types';

interface CharacterDisplayCardProps {
    character: Character;
    size?: 'small' | 'medium' | 'large';
}

export default function CharacterDisplayCard({ character, size = 'medium' }: CharacterDisplayCardProps) {
    const sizeClasses = {
        small: 'p-2',
        medium: 'p-3',
        large: 'p-4'
    };

    const textSize = {
        small: 'text-sm',
        medium: 'text-base',
        large: 'text-lg'
    };

    const titleSize = {
        small: 'text-base',
        medium: 'text-lg',
        large: 'text-xl'
    };

    const [imageError, setImageError] = useState(false);

    return (
        <div className={`${sizeClasses[size]} bg-gray-900 rounded border border-gray-700 ${textSize[size]}`}>
            <div className="flex flex-col items-center">
                {/* TOP SECTION: Portrait + Name + Level */}
                <div className="text-center mb-3">
                    {/* Character Portrait */}
                    <div className="mx-auto">
                        {character.avatarUrl && !imageError ? (
                            <img 
                                src={character.avatarUrl} 
                                alt={`${character.name} portrait`}
                                className="w-20 h-20 md:w-28 md:h-28 lg:w-32 lg:h-32 aspect-square object-cover border-3 border-gray-500 rounded-lg shadow-lg"
                                onError={() => setImageError(true)}
                            />
                        ) : (
                            <div className="fallback-avatar w-20 h-20 md:w-28 md:h-28 lg:w-32 lg:h-32 aspect-square border-3 border-gray-500 rounded-lg shadow-lg bg-gradient-to-br from-amber-500 via-orange-600 to-red-600 flex items-center justify-center text-white font-black text-3xl md:text-4xl lg:text-5xl ring-2 ring-amber-400/50 shadow-inner">
                                {character.name.charAt(0).toUpperCase()}
                            </div>
                        )}
                    </div>

                    {/* Name and Badges */}
                    <div className="mt-2 space-y-2">
                        <p className={`font-bold text-xl md:text-2xl text-yellow-400 truncate`}>
                            {character.name}
                        </p>
                        <div className="flex items-center justify-center space-x-2">
                            <span className="bg-blue-600 text-white text-xs px-2 py-1 rounded">
                                Lvl {character.level}
                            </span>
                            {character.alignment && (
                                <span className="bg-gray-600 text-gray-200 text-xs px-2 py-1 rounded">
                                    {character.alignment}
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                {/* MIDDLE SECTION: Race/Class + HP/AC */}
                <div className="w-full px-2 py-2 bg-gray-800 bg-opacity-50 rounded mb-3">
                    <div className="flex items-center justify-between">
                        <p className="text-gray-300 truncate text-sm">
                            {character.race} {character.class}
                        </p>
                        <div className="flex items-center space-x-3 text-xs">
                            <span className="text-green-400 font-semibold">HP: {character.hp}/{character.maxHp}</span>
                            <span className="text-blue-400 font-semibold">AC: {character.ac}</span>
                        </div>
                    </div>
                </div>

                {/* BOTTOM SECTION: Stats Grid */}
                <div className="w-full">
                    {/* Additional Stats Row */}
                    <div className="flex items-center justify-between mb-2 px-1">
                        <div className="flex items-center space-x-3 text-xs text-gray-400">
                            <span>Init: {character.initiative > 0 ? '+' : ''}{character.initiative}</span>
                            <span>PP: {character.passivePerception}</span>
                            {character.background && (
                                <span className="text-gray-500">•</span>
                            )}
                            {character.background && (
                                <span className="text-gray-400">{character.background}</span>
                            )}
                        </div>
                        
                        {/* Primary Attribute */}
                        {character.primaryAttribute && (
                            <span className="bg-purple-600 text-white text-xs px-2 py-1 rounded">
                                {character.primaryAttribute}
                            </span>
                        )}
                    </div>

                    {/* Quick Stats */}
                    <div className="grid grid-cols-6 gap-2">
                        <div className="text-center text-xs">
                            <div className="text-gray-400">STR</div>
                            <div className="text-white font-bold">
                                {character.stats?.strength || 10}
                            </div>
                        </div>
                        <div className="text-center text-xs">
                            <div className="text-gray-400">DEX</div>
                            <div className="text-white font-bold">
                                {character.stats?.dexterity || 10}
                            </div>
                        </div>
                        <div className="text-center text-xs">
                            <div className="text-gray-400">CON</div>
                            <div className="text-white font-bold">
                                {character.stats?.constitution || 10}
                            </div>
                        </div>
                        <div className="text-center text-xs">
                            <div className="text-gray-400">INT</div>
                            <div className="text-white font-bold">
                                {character.stats?.intelligence || 10}
                            </div>
                        </div>
                        <div className="text-center text-xs">
                            <div className="text-gray-400">WIS</div>
                            <div className="text-white font-bold">
                                {character.stats?.wisdom || 10}
                            </div>
                        </div>
                        <div className="text-center text-xs">
                            <div className="text-gray-400">CHA</div>
                            <div className="text-white font-bold">
                                {character.stats?.charisma || 10}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Equipment Preview */}
                {character.equipment && character.equipment.length > 0 && (
                    <div className="w-full mt-3 pt-3 border-t border-gray-700">
                        <p className="text-xs text-gray-400 mb-1">Equipment:</p>
                        <div className="flex flex-wrap gap-1">
                            {character.equipment.slice(0, 4).map((item, index) => (
                                <span key={index} className="bg-gray-700 text-gray-300 text-xs px-2 py-1 rounded">
                                    {item}
                                </span>
                            ))}
                            {character.equipment.length > 4 && (
                                <span className="bg-gray-700 text-gray-300 text-xs px-2 py-1 rounded">
                                    +{character.equipment.length - 4} more
                                </span>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

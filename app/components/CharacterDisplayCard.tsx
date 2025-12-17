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
    const [isImageLoading, setIsImageLoading] = useState(true);

    return (
        <div className={`${sizeClasses[size]} bg-gradient-to-br from-gray-900 to-gray-800 rounded border-2 border-gray-700 hover:border-yellow-500/50 shadow-lg hover:shadow-2xl transition-all duration-300 ${textSize[size]} min-h-[320px]`}>
            <div className="flex flex-col items-center">
                {/* TOP SECTION: Portrait + Name + Level */}
                <div className="text-center mb-4">
                    {/* Character Portrait */}
                    <div className="mx-auto relative group">
                        {character.avatarUrl && !imageError ? (
                            <img 
                                src={character.avatarUrl} 
                                alt={`${character.name} portrait`}
                                className={`w-28 h-28 md:w-32 md:h-32 lg:w-40 lg:h-40 object-cover rounded-lg border-2 border-gray-500 shadow-xl transition-transform duration-200 group-hover:scale-105 ${isImageLoading ? 'opacity-0' : 'opacity-100'}`}
                                onError={() => { setImageError(true); setIsImageLoading(false); }}
                                onLoad={() => setIsImageLoading(false)}
                            />
                        ) : (
                            <div className="fallback-avatar w-28 h-28 md:w-32 md:h-32 lg:w-40 lg:h-40 aspect-square border-2 border-gray-500 rounded-lg shadow-xl bg-gradient-to-br from-amber-600 via-orange-700 to-red-700 flex items-center justify-center text-white font-black text-4xl md:text-5xl lg:text-6xl ring-4 ring-amber-400/50 hover:ring-amber-400/80 transition-all duration-300">
                                {character.name.charAt(0).toUpperCase()}
                            </div>
                        )}
                        {/* Loading Skeleton */}
                        {isImageLoading && (
                            <div className="absolute inset-0 w-28 h-28 md:w-32 md:h-32 lg:w-40 lg:h-40 rounded-lg bg-gray-700 animate-pulse"></div>
                        )}
                    </div>

                    {/* Name and Badges */}
                    <div className="mt-3 space-y-2">
                        <p className={`font-bold text-xl md:text-2xl text-yellow-400 truncate`}>
                            {character.name}
                        </p>
                        <div className="flex items-center justify-center space-x-2">
                            <span className="bg-blue-600 text-white text-sm px-2 py-1 rounded">
                                Lvl {character.level}
                            </span>
                            {character.alignment && (
                                <span className="bg-gray-600 text-gray-200 text-sm px-2 py-1 rounded">
                                    {character.alignment}
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                {/* MIDDLE SECTION: Race/Class + HP/AC */}
                <div className="w-full px-3 py-3 bg-gradient-to-br from-gray-800/50 to-gray-900/50 border border-gray-600/30 rounded-lg mb-4 shadow-md">
                    <div className="flex items-center justify-between">
                        <p className="text-gray-300 truncate text-base">
                            {character.race} {character.class}
                        </p>
                        <div className="flex items-center space-x-4 text-base font-bold">
                            <span className="text-green-300">❤️ HP: {character.hp}/{character.maxHp}</span>
                            <span className="text-blue-300">🛡️ AC: {character.ac}</span>
                        </div>
                    </div>
                </div>

                {/* BOTTOM SECTION: Stats Grid */}
                <div className="w-full">
                    {/* Additional Stats Row */}
                    <div className="flex items-center justify-between mb-3 px-1">
                        <div className="flex items-center space-x-2 text-[10px] text-gray-500">
                            <span>Init: {character.initiative > 0 ? '+' : ''}{character.initiative}</span>
                            <span>•</span>
                            <span>PP: {character.passivePerception}</span>
                            {character.background && (
                                <>
                                    <span>•</span>
                                    <span className="truncate max-w-[120px]">{character.background}</span>
                                </>
                            )}
                        </div>
                        
                        {/* Primary Attribute */}
                        {character.primaryAttribute && (
                            <span className="bg-purple-600 text-white text-[10px] px-1.5 py-0.5 rounded">
                                {character.primaryAttribute}
                            </span>
                        )}
                    </div>

                    {/* Quick Stats */}
                    <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-2">Attributes</div>
                    <div className="grid grid-cols-6 gap-4">
                        {[
                            { key: 'strength', label: 'STR', icon: '⚔️' },
                            { key: 'dexterity', label: 'DEX', icon: '🏃' },
                            { key: 'constitution', label: 'CON', icon: '💪' },
                            { key: 'intelligence', label: 'INT', icon: '🧠' },
                            { key: 'wisdom', label: 'WIS', icon: '🦉' },
                            { key: 'charisma', label: 'CHA', icon: '💬' }
                        ].map(({ key, label, icon }) => {
                            const statValue = character.stats?.[key as keyof typeof character.stats] || 10;
                            const modifier = Math.floor((statValue - 10) / 2);
                            const modifierStr = modifier >= 0 ? `+${modifier}` : `${modifier}`;
                            const modifierColor = modifier > 0 ? 'text-green-400 font-bold' : modifier < 0 ? 'text-red-400 font-bold' : 'text-gray-500';
                            
                            return (
                                <div key={key} className="bg-gradient-to-br from-gray-700/40 to-gray-800/40 border border-gray-600/30 rounded-lg p-3 text-center hover:shadow-lg hover:border-yellow-500/30 transition-all hover:scale-105">
                                    <div className="text-gray-400 text-[10px] uppercase tracking-wider flex items-center justify-center space-x-1">
                                        <span>{icon}</span>
                                        <span>{label}</span>
                                    </div>
                                    <div className="text-white font-bold text-lg">{statValue}</div>
                                    <div className={`text-base ${modifierColor}`}>{modifierStr}</div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Equipment Preview */}
                {character.equipment && character.equipment.length > 0 && (
                    <div className="w-full mt-4 pt-4 border-t border-gray-700">
                        <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-2">Equipment</div>
                        <div className="grid grid-cols-2 gap-3">
                            {character.equipment.slice(0, 6).map((item, index) => (
                                <div key={index} className="bg-gradient-to-r from-gray-700 to-gray-600 text-gray-200 px-3 py-2 rounded-lg shadow-sm hover:shadow-md transition-all text-sm">
                                    {item}
                                </div>
                            ))}
                            {character.equipment.length > 6 && (
                                <div className="bg-yellow-600/20 text-yellow-300 px-3 py-2 rounded-lg shadow-sm text-sm flex items-center justify-center">
                                    +{character.equipment.length - 6} more
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

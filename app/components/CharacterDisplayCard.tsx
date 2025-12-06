import type { Character } from "~/types";

interface CharacterDisplayCardProps {
    character: Character;
}

export default function CharacterDisplayCard({ character }: CharacterDisplayCardProps) {
    return (
        <div className="p-2 bg-gray-900 rounded border border-gray-700 text-sm">
            <p className="font-bold text-lg text-yellow-400 truncate">{character.name}</p>
            <p className="text-gray-300">{character.race} {character.class} (Lvl {character.level})</p>
            <p className="text-gray-400">AC: {character.ac} | HP: {character.hp}</p>
        </div>
    );
}

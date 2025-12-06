import React, { useRef, useEffect, useState, useCallback, memo } from 'react';
import type { Character, PlayerSlot } from '~/types';
import { useFetcher } from '@remix-run/react'; // NEW: Import useFetcher

interface GameMapProps {
  mapImageBase64: string;
  party: { slot: PlayerSlot; character: Character | null }[];
  currentUserId: string;
  isHost: boolean;
  roomCode: string; // NEW: Pass roomCode for movement API calls
  onCharacterSelect?: (characterId: string | null) => void;
  // onMapClick?: (x: number, y: number) => void; // Replaced by internal logic
}

const CHARACTER_SIZE = 24; // Size of the character pawn

const GameMap: React.FC<GameMapProps> = ({ mapImageBase64, party, currentUserId, isHost, roomCode, onCharacterSelect }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(null);
  const fetcher = useFetcher(); // NEW: Initialize fetcher

  // Callback to draw the map and characters
  const drawMapAndCharacters = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    img.src = `data:image/jpeg;base64,${mapImageBase64}`;
    img.onload = () => {
      // Set canvas dimensions to match image
      canvas.width = img.width;
      canvas.height = img.height;

      // Draw map image
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      // Draw characters
      party.forEach(p => {
        if (p.character && p.slot.x !== undefined && p.slot.y !== undefined) {
          const charX = p.slot.x * canvas.width;
          const charY = p.slot.y * canvas.height;

          // Draw a rectangle for the character pawn
          ctx.fillStyle = p.character.userId === currentUserId ? 'blue' : 'red';
          ctx.fillRect(charX - CHARACTER_SIZE / 2, charY - CHARACTER_SIZE / 2, CHARACTER_SIZE, CHARACTER_SIZE);

          // Draw character name/initials
          ctx.font = '10px Arial';
          ctx.fillStyle = 'white';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(p.character.name.substring(0, 2), charX, charY);

          // Highlight if selected
          if (selectedCharacterId === p.character.id) {
            ctx.strokeStyle = 'yellow';
            ctx.lineWidth = 2;
            ctx.strokeRect(charX - CHARACTER_SIZE / 2, charY - CHARACTER_SIZE / 2, CHARACTER_SIZE, CHARACTER_SIZE);
          }
        }
      });
    };
  }, [mapImageBase64, party, currentUserId, selectedCharacterId]);

  useEffect(() => {
    drawMapAndCharacters();
  }, [drawMapAndCharacters]);

  // Handle click events on the canvas for character selection and movement
  const handleCanvasClick = useCallback((event: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    const clickX = (event.clientX - rect.left) * scaleX;
    const clickY = (event.clientY - rect.top) * scaleY;

    let characterClicked = false;
    party.forEach(p => {
      if (p.character && p.slot.x !== undefined && p.slot.y !== undefined) {
        const charX = p.slot.x * canvas.width;
        const charY = p.slot.y * canvas.height;

        // Check if click is within character bounds
        if (
          clickX > charX - CHARACTER_SIZE / 2 &&
          clickX < charX + CHARACTER_SIZE / 2 &&
          clickY > charY - CHARACTER_SIZE / 2 &&
          clickY < charY + CHARACTER_SIZE / 2
        ) {
          // A character was clicked
          if (selectedCharacterId === p.character.id) {
            // Already selected, deselect
            setSelectedCharacterId(null);
            onCharacterSelect?.(null);
          } else {
            // Select this character
            setSelectedCharacterId(p.character.id);
            onCharacterSelect?.(p.character.id);
          }
          characterClicked = true;
          return;
        }
      }
    });

    if (!characterClicked) {
      if (selectedCharacterId) {
        // A character is selected, and map was clicked (not another character)
        // Initiate movement
        const normalizedX = clickX / canvas.width;
        const normalizedY = clickY / canvas.height;

        const formData = new FormData();
        formData.append('roomCode', roomCode);
        formData.append('characterId', selectedCharacterId);
        formData.append('x', normalizedX.toString());
        formData.append('y', normalizedY.toString());

        fetcher.submit(formData, { method: 'post', action: '/api/room.move-character' });
        
        setSelectedCharacterId(null); // Deselect after sending move command
        onCharacterSelect?.(null);

      } else {
        // No character selected, and map was clicked
        setSelectedCharacterId(null);
        onCharacterSelect?.(null);
      }
    }
    // Redraw to reflect selection changes immediately
    drawMapAndCharacters();
  }, [party, selectedCharacterId, onCharacterSelect, roomCode, fetcher, drawMapAndCharacters]); // Added drawMapAndCharacters to deps


  return (
    <div className="relative w-full h-full bg-gray-800 rounded-lg overflow-hidden">
      <canvas 
        ref={canvasRef} 
        className="w-full h-full"
        onClick={handleCanvasClick}
      ></canvas>
      {/* Overlay for interaction or additional UI elements */}
      <div className="absolute inset-0 pointer-events-none">
        {/* Character interaction, movement controls, etc. */}
      </div>
    </div>
  );
};

export default memo(GameMap);
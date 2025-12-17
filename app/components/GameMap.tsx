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
  isLoading?: boolean; // NEW: Loading state for map rendering
  roomStatus?: 'lobby' | 'scenario_selection' | 'active' | 'active_game' | 'finished' | 'closed'; // NEW: Room status for movement validation
}

interface TouchEvent extends React.TouchEvent<HTMLCanvasElement> {
  clientX: number;
  clientY: number;
}

const CHARACTER_SIZE = 24; // Size of the character pawn

const GameMap: React.FC<GameMapProps> = ({ mapImageBase64, party, currentUserId, isHost, roomCode, onCharacterSelect, isLoading = false, roomStatus = 'active_game' }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(null);
  const [touchFeedback, setTouchFeedback] = useState<{ x: number; y: number; active: boolean }>({ x: 0, y: 0, active: false });
  const [lastTouchTime, setLastTouchTime] = useState<number>(0);
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

      // Draw touch feedback
      if (touchFeedback.active) {
        ctx.beginPath();
        ctx.arc(touchFeedback.x, touchFeedback.y, 15, 0, 2 * Math.PI);
        ctx.fillStyle = 'rgba(255, 255, 0, 0.3)';
        ctx.fill();
        ctx.strokeStyle = 'yellow';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
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

    // Add touch feedback
    setTouchFeedback({ x: clickX, y: clickY, active: true });
    setTimeout(() => setTouchFeedback(prev => ({ ...prev, active: false })), 300);

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
        // Check if movement is allowed
        if (roomStatus !== 'active' && roomStatus !== 'active_game') {
          showToast('Movement is only allowed during active gameplay', 'error');
          return;
        }
        
        if (!isHost && !party.some(p => p.character?.id === selectedCharacterId && p.character?.userId === currentUserId)) {
          showToast('You can only move your own characters', 'error');
          return;
        }
        
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
  }, [party, selectedCharacterId, onCharacterSelect, roomCode, fetcher, drawMapAndCharacters, isHost, currentUserId]); // Added isHost and currentUserId to deps

  // Handle touch events for mobile devices
  const handleCanvasTouchStart = useCallback((event: React.TouchEvent<HTMLCanvasElement>) => {
    if (event.touches.length > 1) return; // Ignore multi-touch
    
    const canvas = canvasRef.current;
    if (!canvas) return;

    const touch = event.touches[0];
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    const touchX = (touch.clientX - rect.left) * scaleX;
    const touchY = (touch.clientY - rect.top) * scaleY;

    // Add touch feedback
    setTouchFeedback({ x: touchX, y: touchY, active: true });

    // Check for character selection
    let characterClicked = false;
    party.forEach(p => {
      if (p.character && p.slot.x !== undefined && p.slot.y !== undefined) {
        const charX = p.slot.x * canvas.width;
        const charY = p.slot.y * canvas.height;

        if (
          touchX > charX - CHARACTER_SIZE / 2 &&
          touchX < charX + CHARACTER_SIZE / 2 &&
          touchY > charY - CHARACTER_SIZE / 2 &&
          touchY < charY + CHARACTER_SIZE / 2
        ) {
          if (selectedCharacterId === p.character.id) {
            setSelectedCharacterId(null);
            onCharacterSelect?.(null);
          } else {
            setSelectedCharacterId(p.character.id);
            onCharacterSelect?.(p.character.id);
          }
          characterClicked = true;
        }
      }
    });

    // For movement, we'll handle on touch end to avoid accidental moves
    setLastTouchTime(Date.now());
  }, [party, selectedCharacterId, onCharacterSelect, drawMapAndCharacters, isHost, currentUserId]);

  const handleCanvasTouchEnd = useCallback((event: React.TouchEvent<HTMLCanvasElement>) => {
    const touch = event.changedTouches[0];
    const canvas = canvasRef.current;
    if (!canvas || !touch) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    const touchX = (touch.clientX - rect.left) * scaleX;
    const touchY = (touch.clientY - rect.top) * scaleY;

    // Only move if enough time passed (to avoid accidental moves when selecting)
    const touchDuration = Date.now() - lastTouchTime;
    if (touchDuration > 200 && selectedCharacterId) {
      // Check if movement is allowed
      if (roomStatus !== 'active' && roomStatus !== 'active_game') {
        showToast('Movement is only allowed during active gameplay', 'error');
        return;
      }
      
      if (!isHost && !party.some(p => p.character?.id === selectedCharacterId && p.character?.userId === currentUserId)) {
        showToast('You can only move your own characters', 'error');
        return;
      }
      
      const normalizedX = touchX / canvas.width;
      const normalizedY = touchY / canvas.height;

      const formData = new FormData();
      formData.append('roomCode', roomCode);
      formData.append('characterId', selectedCharacterId);
      formData.append('x', normalizedX.toString());
      formData.append('y', normalizedY.toString());

      fetcher.submit(formData, { method: 'post', action: '/api/room.move-character' });
      
      setSelectedCharacterId(null);
      onCharacterSelect?.(null);
    }

    setTouchFeedback(prev => ({ ...prev, active: false }));
    drawMapAndCharacters();
  }, [selectedCharacterId, onCharacterSelect, roomCode, fetcher, lastTouchTime, drawMapAndCharacters, isHost, currentUserId]);

  // Handle keyboard navigation for accessibility
  const handleKeyDown = useCallback((event: React.KeyboardEvent<HTMLCanvasElement>) => {
    if (!selectedCharacterId) return;

    // Check if movement is allowed
    if (roomStatus !== 'active' && roomStatus !== 'active_game') {
      showToast('Movement is only allowed during active gameplay', 'error');
      return;
    }
    
    if (!isHost && !party.some(p => p.character?.id === selectedCharacterId && p.character?.userId === currentUserId)) {
      showToast('You can only move your own characters', 'error');
      return;
    }

    const moveMap = (dx: number, dy: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      // Find selected character
      const selectedParty = party.find(p => p.character?.id === selectedCharacterId);
      if (!selectedParty || selectedParty.slot.x === undefined || selectedParty.slot.y === undefined) return;

      let newX = selectedParty.slot.x + dx;
      let newY = selectedParty.slot.y + dy;

      // Keep within bounds
      newX = Math.max(0, Math.min(1, newX));
      newY = Math.max(0, Math.min(1, newY));

      const formData = new FormData();
      formData.append('roomCode', roomCode);
      formData.append('characterId', selectedCharacterId);
      formData.append('x', newX.toString());
      formData.append('y', newY.toString());

      fetcher.submit(formData, { method: 'post', action: '/api/room.move-character' });
    };

    switch (event.key) {
      case 'ArrowUp':
        event.preventDefault();
        moveMap(0, -0.01);
        break;
      case 'ArrowDown':
        event.preventDefault();
        moveMap(0, 0.01);
        break;
      case 'ArrowLeft':
        event.preventDefault();
        moveMap(-0.01, 0);
        break;
      case 'ArrowRight':
        event.preventDefault();
        moveMap(0.01, 0);
        break;
      case 'Escape':
        setSelectedCharacterId(null);
        onCharacterSelect?.(null);
        break;
    }
  }, [selectedCharacterId, party, roomCode, fetcher, onCharacterSelect, isHost, currentUserId]);


  return (
    <div className="relative w-full h-[400px] sm:h-[500px] lg:h-[600px] bg-gray-800 rounded-lg overflow-hidden">
      {/* Loading Overlay */}
      {isLoading && (
        <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center z-10">
          <div className="bg-gray-900 bg-opacity-90 p-6 rounded-lg border border-gray-600">
            <div className="flex items-center space-x-3">
              <div className="animate-spin rounded-full h-6 w-6 border-2 border-blue-500 border-t-transparent"></div>
              <span className="text-white font-semibold">Loading map...</span>
            </div>
          </div>
        </div>
      )}
      
      <canvas 
        ref={canvasRef} 
        className={`w-full h-full ${isLoading ? 'opacity-50' : ''}`}
        onClick={handleCanvasClick}
        onTouchStart={handleCanvasTouchStart}
        onTouchEnd={handleCanvasTouchEnd}
        onKeyDown={handleKeyDown}
        role="application"
        aria-label="Interactive game map with character positions"
        aria-roledescription="Drag and drop map for moving characters"
        tabIndex={isLoading ? -1 : 0}
      ></canvas>
      
      {/* Screen reader announcements */}
      <div className="sr-only" aria-live="polite">
        {selectedCharacterId ? `Character ${party.find(p => p.character?.id === selectedCharacterId)?.character?.name || 'selected'} is ready to move` : 'No character selected'}
      </div>
      
      {/* Touch feedback overlay */}
      <div className="absolute inset-0 pointer-events-none">
        {touchFeedback.active && (
          <div 
            className="absolute w-8 h-8 bg-yellow-400 bg-opacity-30 rounded-full animate-pulse"
            style={{
              left: touchFeedback.x - 16,
              top: touchFeedback.y - 16
            }}
            aria-hidden="true"
          />
        )}
      </div>
      
      {/* Keyboard navigation instructions */}
      <div className="absolute top-2 left-2 bg-black bg-opacity-50 text-white text-xs px-2 py-1 rounded">
        <span className="hidden sm:inline">Click a character, then click the map to move</span>
        <span className="sm:hidden">Tap a character, then tap the map to move</span>
        <span className="ml-2">Keyboard: ←↑↓→ to move, Esc to deselect</span>
      </div>
    </div>
  );
};

export default memo(GameMap);
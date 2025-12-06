import React, { useRef, useEffect, useState } from 'react';

interface Dice3DProps {
  onRollComplete: (result: number) => void;
  isRolling: boolean;
  slotIndex: number;
  result?: number;
}

export default function Dice3D({ onRollComplete, isRolling, slotIndex, result }: Dice3DProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [rotation, setRotation] = useState({ x: 0, y: 0, z: 0 });
  const animationRef = useRef<number | null>(null);

  const d20Faces = [
    1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
    11, 12, 13, 14, 15, 16, 17, 18, 19, 20
  ];

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    const draw = () => {
      // Clear canvas
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(0, 0, width, height);

      // Save context
      ctx.save();
      ctx.translate(width / 2, height / 2);

      // Apply rotation
      ctx.rotate(rotation.z);
      
      // Draw cube/dice
      const size = 40;
      
      // Determine which face to show based on rotation
      const faceIndex = Math.floor((rotation.y / (Math.PI / 10)) + rotation.x / (Math.PI / 5)) % 20;
      const displayNumber = d20Faces[Math.abs(faceIndex) % 20];

      // Draw die cube
      ctx.fillStyle = '#dc2626';
      ctx.strokeStyle = '#991b1b';
      ctx.lineWidth = 2;

      // Draw cube faces with perspective
      const drawFace = (x: number, y: number, size: number, opacity: number) => {
        ctx.globalAlpha = opacity;
        ctx.fillRect(x - size / 2, y - size / 2, size, size);
        ctx.strokeRect(x - size / 2, y - size / 2, size, size);
        ctx.globalAlpha = 1;
      };

      // Front face (main)
      drawFace(0, 0, size * 2, 1);

      // Side faces with perspective
      drawFace(size * 0.7, -size * 0.7, size * 1.5, 0.7);
      drawFace(-size * 0.7, -size * 0.7, size * 1.5, 0.5);

      // Draw number on front face
      if (result !== undefined) {
        ctx.fillStyle = '#fbbf24';
        ctx.font = 'bold 48px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(result.toString(), 0, 0);
      } else {
        ctx.fillStyle = '#fbbf24';
        ctx.font = 'bold 48px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(displayNumber.toString(), 0, 0);
      }

      ctx.restore();
    };

    if (isRolling) {
      const animate = () => {
        setRotation(prev => ({
          x: prev.x + 0.15,
          y: prev.y + 0.2,
          z: prev.z + 0.1
        }));
        animationRef.current = requestAnimationFrame(animate);
      };
      animationRef.current = requestAnimationFrame(animate);
    } else {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    }

    draw();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [rotation, isRolling, result]);

  return (
    <div className="flex flex-col items-center gap-2">
      <canvas
        ref={canvasRef}
        width={150}
        height={150}
        className="border-2 border-yellow-500 rounded-lg bg-gray-900"
      />
      <p className="text-sm text-gray-300">Slot {slotIndex + 1}</p>
      {result !== undefined && (
        <p className="text-2xl font-bold text-yellow-400">Result: {result}</p>
      )}
    </div>
  );
}

import { useState, useEffect, useRef } from 'react';
import { useFetcher } from '@remix-run/react';
import { subscribeToRoomChanges } from '~/services/realtime.client';
import { useGlobalToast } from '~/utils/toast';
import type { DBRoom } from '~/services/room.server';

type ChatMessage = {
  id: string;
  user_id: string;
  username: string;
  message: string;
  message_type: string;
  created_at: string;
};

interface ChatWindowProps {
  roomCode: string;
  currentUserId: string;
  currentUsername: string;
  isOpen: boolean;
  onClose: () => void;
}

export default function ChatWindow({ 
  roomCode, 
  currentUserId, 
  currentUsername, 
  isOpen, 
  onClose 
}: ChatWindowProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { showToast } = useGlobalToast();
  const fetcher = useFetcher();

  // Fetch initial messages
  useEffect(() => {
    if (!isOpen) return;

    const loadMessages = async () => {
      setIsLoading(true);
      try {
        const response = await fetch(`/api/room/chat?roomCode=${encodeURIComponent(roomCode)}`);
        if (response.ok) {
          const data = await response.json();
          setMessages(data.messages || []);
        } else {
          showToast('Failed to load chat messages', 'error');
        }
      } catch (error) {
        console.error('Error loading chat messages:', error);
        showToast('Failed to load chat messages', 'error');
      } finally {
        setIsLoading(false);
      }
    };

    loadMessages();
  }, [isOpen, roomCode]);

  // Auto-scroll to bottom when messages update
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Subscribe to real-time updates
  useEffect(() => {
    if (!isOpen) return;

    const unsubscribe = subscribeToRoomChanges(roomCode, (payload) => {
      // Check if chat messages were updated
      if (payload.new.room_chat_last_updated && 
          payload.new.room_chat_last_updated !== payload.old.room_chat_last_updated) {
        // Reload messages to get the latest ones
        fetch(`/api/room/chat?roomCode=${encodeURIComponent(roomCode)}`)
          .then(res => res.json())
          .then(data => {
            setMessages(data.messages || []);
          })
          .catch(error => {
            console.error('Error fetching updated chat messages:', error);
          });
      }
    });

    return () => unsubscribe();
  }, [isOpen, roomCode]);

  // Poll for new messages every 3 seconds as fallback
  useEffect(() => {
    if (!isOpen) return;

    const interval = setInterval(async () => {
      try {
        const response = await fetch(`/api/room/chat?roomCode=${encodeURIComponent(roomCode)}`);
        if (response.ok) {
          const data = await response.json();
          setMessages(prevMessages => {
            const newMessages = data.messages || [];
            // Only update if there are new messages
            if (newMessages.length !== prevMessages.length) {
              return newMessages;
            }
            return prevMessages;
          });
        }
      } catch (error) {
        console.error('Error polling chat messages:', error);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [isOpen, roomCode]);

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!newMessage.trim()) return;

    const formData = new FormData();
    formData.append('intent', 'sendMessage');
    formData.append('roomCode', roomCode);
    formData.append('message', newMessage.trim());
    formData.append('userId', currentUserId);
    formData.append('username', currentUsername);

    fetcher.submit(formData, { 
      method: 'post', 
      action: '/game' 
    });

    setNewMessage('');
  };

  const formatTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-gray-900 rounded-lg shadow-2xl w-full max-w-lg border border-gray-700">
        {/* Chat Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <div className="flex items-center space-x-3">
            <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
            <h2 className="text-white font-bold text-lg">Room Chat</h2>
            <span className="text-gray-400 text-sm">#{roomCode}</span>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Messages */}
        <div className="p-4 h-96 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
            </div>
          ) : messages.length === 0 ? (
            <div className="text-gray-500 text-center py-8">
              No messages yet. Start the conversation!
            </div>
          ) : (
            <div className="space-y-3">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex ${
                    message.user_id === currentUserId ? 'justify-end' : 'justify-start'
                  }`}
                >
                  <div
                    className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
                      message.user_id === currentUserId
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-700 text-white'
                    }`}
                  >
                    <div className="flex items-center space-x-2 mb-1">
                      <span className="text-xs font-semibold">
                        {message.username || 'Unknown Player'}
                      </span>
                      <span className="text-xs text-gray-300">
                        {formatTime(message.created_at)}
                      </span>
                    </div>
                    <p className="text-sm">{message.message}</p>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Message Input */}
        <div className="p-4 border-t border-gray-700">
          <fetcher.Form onSubmit={handleSendMessage} className="flex gap-2">
            <input
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="Type your message..."
              className="flex-1 bg-gray-800 border border-gray-600 rounded-md px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              maxLength={200}
            />
            <button
              type="submit"
              disabled={fetcher.state !== 'idle' || !newMessage.trim()}
              className="bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-bold py-2 px-4 rounded-md transition-colors"
            >
              Send
            </button>
          </fetcher.Form>
          <p className="text-xs text-gray-400 mt-2 text-right">
            {200 - newMessage.length} characters remaining
          </p>
        </div>
      </div>
    </div>
  );
}

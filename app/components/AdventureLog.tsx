import { Form } from "@remix-run/react";
import { useEffect, useRef } from "react";

type Message = {
  role: 'user' | 'model';
  text: string;
};

type AdventureLogProps = {
  messages: Message[];
  isLoading: boolean;
};

export default function AdventureLog({ messages, isLoading }: AdventureLogProps) {
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [messages]);

  return (
    <div className="flex flex-col h-full bg-black bg-opacity-30 rounded-lg border border-gray-700 shadow-lg">
      <div ref={logRef} className="flex-grow p-6 overflow-y-auto space-y-6">
        {messages.map((msg, index) => (
          <div key={index} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-xl p-4 rounded-lg shadow ${
                msg.role === 'user'
                  ? 'bg-blue-800 bg-opacity-50 text-right'
                  : 'bg-gray-700 bg-opacity-50'
              }`}
            >
              <p className="whitespace-pre-wrap">{msg.text}</p>
            </div>
          </div>
        ))}
        {isLoading && (
           <div className="flex justify-start">
             <div className="max-w-xl p-4 rounded-lg shadow bg-gray-700 bg-opacity-50">
                <div className="flex items-center space-x-2">
                    <div className="w-2 h-2 rounded-full bg-gray-400 animate-pulse"></div>
                    <div className="w-2 h-2 rounded-full bg-gray-400 animate-pulse [animation-delay:0.2s]"></div>
                    <div className="w-2 h-2 rounded-full bg-gray-400 animate-pulse [animation-delay:0.4s]"></div>
                </div>
             </div>
           </div>
        )}
      </div>
      <div className="p-4 border-t border-gray-700">
        <Form method="post">
          <input type="hidden" name="messages" value={JSON.stringify(messages)} />
          <fieldset disabled={isLoading} className="flex gap-4">
            <input
              type="text"
              name="userInput"
              className="flex-grow bg-gray-800 border border-gray-600 rounded-md px-4 py-2 focus:outline-none focus:ring-2 focus:ring-red-500 text-gray-200"
              placeholder="What do you do?"
              autoComplete="off"
            />
            <button
              type="submit"
              className="bg-red-700 hover:bg-red-600 text-white font-bold py-2 px-6 rounded-md transition-colors disabled:bg-gray-600"
            >
              Send
            </button>
          </fieldset>
        </Form>
      </div>
    </div>
  );
}

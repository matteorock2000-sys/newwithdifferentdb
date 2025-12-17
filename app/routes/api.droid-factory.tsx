
import { json, ActionFunctionArgs } from "@remix-run/node";
import {
  generateCharacterPortrait,
  parseCharacterDescription,
} from "~/services/gemini.server";
import { Character } from "~/types";

export const action = async ({ request }: ActionFunctionArgs) => {
  const body = await request.json();
  const { tool, parameters } = body;

  if (!tool || !parameters) {
    return json({ error: "Missing tool or parameters" }, { status: 400 });
  }

  try {
    let result;
    switch (tool) {
      case "ai.chat": {
        // For now, we'll use parseCharacterDescription as an example of a chat-like interaction
        if (!parameters.text) {
          return json({ error: "Missing 'text' parameter for ai.chat" }, { status: 400 });
        }
        result = await parseCharacterDescription(parameters.text, parameters.context || {});
        break;
      }
      
      case "image.generate": {
        if (!parameters.character) {
          return json({ error: "Missing 'character' parameter for image.generate" }, { status: 400 });
        }
        // Assuming the character object is passed in the parameters
        const character: Character = parameters.character;
        result = await generateCharacterPortrait(character);
        break;
      }

      default:
        return json({ error: `Unknown tool: ${tool}` }, { status: 400 });
    }

    return json({ success: true, tool, result });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
    return json({ success: false, error: errorMessage, tool }, { status: 500 });
  }
};

import { ActionFunctionArgs, json } from "@remix-run/node";
import { parseCharacterDescription } from "~/services/gemini.server";
import { requireUserId } from "~/services/auth.server";
import { getSession, commitSession } from "~/sessions";

export async function action({ request }: ActionFunctionArgs) {
  console.log("--- API character import action hit ---");
  
  // 1. Ensure user is authenticated
  await requireUserId(request); 

  const session = await getSession(request.headers.get("Cookie"));

  if (request.method !== "POST") {
    console.warn("Method Not Allowed. Expected POST, got:", request.method);
    session.flash("error", "Method Not Allowed");
    return json({ success: false, error: "Method Not Allowed" }, { status: 405, headers: { "Set-Cookie": await commitSession(session) } });
  }

  let description = "";
  try {
    const formData = await request.formData();
    description = String(formData.get("description") || "").trim();
    console.log("Received description (first 500 chars):", description.substring(0, 500));

    if (description === "") {
      console.error("Validation Error: Character description is required.");
      session.flash("error", "Character description is required.");
      return json({ success: false, error: "Character description is required." }, { status: 400, headers: { "Set-Cookie": await commitSession(session) } });
    }

    // Use the correct service function name
    const aiResponse = await parseCharacterDescription(description);

    // Handle different statuses from the AI parser
    if (aiResponse.status === 'error' || (aiResponse.status !== 'complete' && !aiResponse.partialCharacter)) {
      const errorMessage = `AI failed to parse character: ${aiResponse.message || 'Unknown error.'}`;
      console.error(errorMessage);
      session.flash("error", errorMessage);
      return json({ success: false, error: errorMessage }, { status: 500, headers: { "Set-Cookie": await commitSession(session) } });
    }

    // For now, we will accept both complete and incomplete characters.
    // The UI can decide how to handle asking more questions if needed.
    const parsedCharacter = aiResponse.character || aiResponse.partialCharacter;

    if (!parsedCharacter) {
        const errorMessage = `AI parsing did not return character data.`;
        console.error(errorMessage);
        session.flash("error", errorMessage);
        return json({ success: false, error: errorMessage }, { status: 500, headers: { "Set-Cookie": await commitSession(session) } });
    }

    console.log("Successfully parsed character (name):", parsedCharacter.name);

    // Add a temporary ID for the imported character if it doesn't have one
    if (!parsedCharacter.id) {
      parsedCharacter.id = `temp-import-${crypto.randomUUID()}`;
    }
    
    console.log("Returning success JSON with character.");
    // Success: return the parsed character data directly to the fetcher
    return json({ 
      success: true, 
      character: parsedCharacter, 
      questions: aiResponse.questions || null 
    });
    
  } catch (error) {
    console.error("Unhandled Error in /api/character.import action:", error);
    const errorMessage = `Failed to parse character description using AI. Please check the format or try again. Error: ${error instanceof Error ? error.message : String(error)}`;
    session.flash("error", errorMessage);
    // Commit session only on error to flash the message
    return json({ success: false, error: errorMessage }, { status: 500, headers: { "Set-Cookie": await commitSession(session) } });
  }
}

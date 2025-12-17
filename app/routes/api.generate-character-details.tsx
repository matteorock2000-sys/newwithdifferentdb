import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { generateCharacterFeatures, generateCharacterPersonality } from "~/services/gemini.server";
import { logger } from "~/utils/logger";

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const characterClass = url.searchParams.get("class");
  const characterRace = url.searchParams.get("race");
  const characterBackground = url.searchParams.get("background");

  if (!characterClass || !characterRace || !characterBackground) {
    return json({ error: "Missing character details for AI generation." }, { status: 400 });
  }

  try {
    const features = await generateCharacterFeatures(characterClass, characterRace, characterBackground);
    const personality = await generateCharacterPersonality(characterClass, characterRace, characterBackground);

    return json({ features, personality });
  } catch (error) {
    logger.error("Error generating character details via API", { error: error instanceof Error ? error.message : "Unknown error" });
    return json({ error: "Failed to generate character details." }, { status: 500 });
  }
}

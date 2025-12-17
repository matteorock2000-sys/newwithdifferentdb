import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { requireUser } from "~/services/auth.server";
import { getCharacterAvatarUrl } from "~/services/db.server";
import { logger } from "~/utils/logger";

export async function loader({ request }: ActionFunctionArgs) {
  const userId = (await requireUser(request)).id;
  const url = new URL(request.url);
  const characterId = url.searchParams.get("characterId");

  if (!characterId) {
    return json({ error: "Missing characterId" }, { status: 400 });
  }

  try {
    const avatarUrl = await getCharacterAvatarUrl(userId, characterId);

    if (!avatarUrl) {
      return json({ error: "Avatar not found for this character" }, { status: 404 });
    }

    // Check if the avatarUrl is a file path (starts with /uploads/)
    if (avatarUrl.startsWith("/uploads/")) {
      logger.debug(`[PORTRAIT SERVE] Returning file path for character: ${characterId}`);
      return json({ avatarUrl: avatarUrl }, { status: 200 });
    }
    // Check if the avatarUrl is a direct URL or already a data URI
    else if (avatarUrl.startsWith("http://") || avatarUrl.startsWith("https://") || avatarUrl.startsWith("/")) {
      logger.debug(`[PORTRAIT SERVE] Returning URL for character: ${characterId}`);
      return json({ avatarUrl: avatarUrl }, { status: 200 });
    } else if (avatarUrl.startsWith("data:")) {
      // Already a data URI, return as is
      logger.debug(`[PORTRAIT SERVE] Returning existing data URI for character: ${characterId}`);
      return json({ avatarDataUri: avatarUrl }, { status: 200 });
    } else {
      // Assume it's a raw base64 string and prefix it to form a data URI
      logger.debug(`[PORTRAIT SERVE] Prefixing and serving raw base64 as data URI for character: ${characterId}`);
      const dataUri = `data:image/jpeg;base64,${avatarUrl}`;
      return json({ avatarDataUri: dataUri }, { status: 200 });
    }
  } catch (error) {
    logger.error(`[PORTRAIT SERVE] Error serving avatar for character ${characterId}`, { error: error instanceof Error ? error.message : "Unknown error" });
    return json({ error: "Failed to retrieve avatar" }, { status: 500 });
  }
}
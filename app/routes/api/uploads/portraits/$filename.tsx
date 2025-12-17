import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { requireUser } from "~/services/auth.server";
import { getCharacterAvatarUrl } from "~/services/db.server";
import { logger } from "~/utils/logger";
import * as fs from "fs/promises";
import * as path from "path";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const userId = (await requireUser(request)).id;
  const { filename } = params;

  if (!filename) {
    return json({ error: "Missing filename" }, { status: 400 });
  }

  try {
    // Construct the file path
    const uploadsDir = path.join(process.cwd(), 'public', 'uploads', 'portraits');
    const filePath = path.join(uploadsDir, filename);

    // Check if file exists
    try {
      await fs.access(filePath);
    } catch (error) {
      return json({ error: "File not found" }, { status: 404 });
    }

    // Read the file
    const fileBuffer = await fs.readFile(filePath);

    // Return the file with appropriate headers
    return new Response(fileBuffer, {
      status: 200,
      headers: {
        "Content-Type": "image/jpeg",
        "Content-Length": fileBuffer.length.toString(),
        "Cache-Control": "public, max-age=31536000, immutable"
      }
    });
  } catch (error) {
    logger.error(`[PORTRAIT FILE SERVE] Error serving file ${filename}`, { error: error instanceof Error ? error.message : "Unknown error" });
    return json({ error: "Failed to serve image file" }, { status: 500 });
  }
}
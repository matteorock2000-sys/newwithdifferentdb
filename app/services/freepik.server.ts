import { json } from "@remix-run/node";
import * as logger from "../utils/logger";


const FREEPIK_API_BASE_URL = "https://api.freepik.com";
const API_KEY = process.env.X_FREEPIK_API_KEY;

if (!API_KEY) {
  logger.log(logger.LogLevel.ERROR,"X_FREEPIK_API_KEY is not set.");
  throw new Error("Freepik API key is not configured.");
}

async function callFreepikApi(
  endpoint: string,
  method: string = "GET",
  body?: any
) {
  const url = `${FREEPIK_API_BASE_URL}${endpoint}`;
  const headers = {
    "Content-Type": "application/json",
    "x-freepik-api-key": API_KEY!,
  };

  logger.log(logger.LogLevel.DEBUG,`Calling Freepik API: ${method} ${url}`);

  try {
    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    const responseText = await response.text();
    let responseJson;
    try {
      responseJson = JSON.parse(responseText);
    } catch (e) {
      logger.log(logger.LogLevel.ERROR,`Failed to parse JSON response from ${url}: ${responseText}`);
      throw new Error(`Invalid JSON response from Freepik API: ${responseText}`);
    }

    if (!response.ok) {
      const errorMessage =
        responseJson.error?.message ||
        responseJson.message ||
        `Freepik API error: ${response.status} ${response.statusText}`;
      logger.log(logger.LogLevel.ERROR,
        `Freepik API call failed: ${method} ${url} - ${errorMessage} (Response: ${responseText})`
      );
      throw new Error(errorMessage);
    }

    logger.log(logger.LogLevel.DEBUG, `Freepik API call successful. Response JSON: ${JSON.stringify(responseJson)}`);
    return responseJson;
  } catch (err: any) {
          logger.log(logger.LogLevel.ERROR,`Network or Freepik API call error: ${err.message}`);
    throw new Error(`Failed to connect to Freepik API: ${err.message}`);
  }
}

export async function createImageGenerationTask(
  prompt: string,
  aspectRatio: string = "square_1_1" // Default to square
) {
  logger.log(logger.LogLevel.DEBUG,
    `Creating image generation task for prompt: "${prompt}" with aspect ratio: ${aspectRatio}`
  );
  const response = await callFreepikApi("/v1/ai/text-to-image/flux-dev", "POST", {
    prompt,
    aspect_ratio: aspectRatio,
  });
  if (!response || !response.data || !response.data.task_id) {
    throw new Error("Failed to create image generation task: No task_id received.");
  }
  logger.log(logger.LogLevel.DEBUG,`Image generation task created, task_id: ${response.data.task_id}`);
  return response.data.task_id;
}

export async function pollTaskStatus(
  taskId: string,
  maxAttempts: number = 20,
  intervalMs: number = 3000
) {
  logger.log(logger.LogLevel.DEBUG,`Polling task status for task_id: ${taskId}`);
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const response = await callFreepikApi(
      `/v1/ai/text-to-image/flux-dev/${taskId}`
    );
    logger.log(logger.LogLevel.DEBUG,
      `Attempt ${attempt} for task ${taskId}: status = ${response.data.status}`
    );

    if (response.data.status === "COMPLETED") {
      if (response.data.generated && response.data.generated.length > 0) {
        const imageUrl = response.data.generated[0];
        logger.log(logger.LogLevel.DEBUG,`Task ${taskId} completed. Image URL: ${imageUrl}`);
        return imageUrl;
      } else {
        throw new Error(
          `Task ${taskId} completed, but no image URL found in generated data.`
        );
      }
    } else if (response.data.status === "FAILED" || response.data.status === "CANCELED") {
      const errorMessage =
        response.error?.message || `Task ${taskId} failed with status ${response.data.status}`;
      throw new Error(errorMessage);
    }

    if (attempt < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }
  throw new Error(`Image generation task ${taskId} timed out after ${maxAttempts} attempts.`);
}

export async function downloadImageAsBase64(imageUrl: string) {
  logger.log(logger.LogLevel.DEBUG,`Downloading image from URL: ${imageUrl}`);
  try {
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(
        `Failed to download image from ${imageUrl}: ${response.status} ${response.statusText}`
      );
    }
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64 = buffer.toString("base64");
    logger.log(logger.LogLevel.DEBUG,`Image downloaded and converted to base64 (length: ${base64.length})`);
    return base64;
  } catch (err: any) {
    logger.log(logger.LogLevel.ERROR,`Error downloading image from ${imageUrl}: ${err.message}`);
    throw new Error(`Failed to download image: ${err.message}`);
  }
}

export async function generateImage(prompt: string, aspectRatio?: string) {
  logger.log(logger.LogLevel.DEBUG,
    `Orchestrating image generation for prompt: "${prompt}" (aspectRatio: ${aspectRatio})`
  );
  try {
    const taskId = await createImageGenerationTask(prompt, aspectRatio);
    const imageUrl = await pollTaskStatus(taskId);
    const base64 = await downloadImageAsBase64(imageUrl);
    return base64;
  } catch (err: any) {
    logger.log(logger.LogLevel.ERROR,`Error in generateImage orchestration: ${err.message}`);
    throw err; // Re-throw to be handled by calling function
  }
}

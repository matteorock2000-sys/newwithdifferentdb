import pkg from "bcryptjs";
const { hash, compare } = pkg;
import { redirect } from "@remix-run/node";
import { getSession, commitSession, destroySession } from "~/sessions";
import { createUser, getUserByEmail, getUserByUsername, getUserById } from "./db.server";
import type { User } from "~/types"; // <-- Updated import path

const SESSION_SECRET = process.env.SESSION_SECRET || "s3cr3t";

/**
 * Registers a new user.
 */
export async function register({ email, password, username }: { email: string; password: string; username: string }): Promise<User> {
  const existingUserByEmail = await getUserByEmail(email);
  if (existingUserByEmail) {
    throw new Error("A user with this email already exists.");
  }

  const existingUserByUsername = await getUserByUsername(username);
  if (existingUserByUsername) {
    throw new Error("A user with this username already exists.");
  }

  const hashedPassword = await hash(password, 10);
  return createUser(email, hashedPassword, username);
}

/**
 * Logs in a user, accepting either email or username as the identifier.
 */
export async function login({ identifier, password }: { identifier: string; password: string }): Promise<User> {
  // 1. Try finding user by email
  let user = await getUserByEmail(identifier);

  // 2. If not found, try finding user by username
  if (!user) {
    user = await getUserByUsername(identifier);
  }

  if (!user) {
    throw new Error("Invalid username/email or password.");
  }

  // user.hashedPassword is now guaranteed to be defined due to the fix in db.server.ts
  const isPasswordValid = await compare(password, user.hashedPassword);
  if (!isPasswordValid) {
    throw new Error("Invalid username/email or password.");
  }

  return user;
}

/**
 * Gets the user ID from the session cookie.
 */
export async function getUserId(request: Request): Promise<string | undefined> {
  const session = await getSession(request.headers.get("Cookie"));
  const userId = session.get("userId");
  return userId;
}

/**
 * Gets the full user object from the session.
 */
export async function getUser(request: Request): Promise<User | null> {
  const userId = await getUserId(request);
  if (userId === undefined) return null;

  const user = await getUserById(userId);
  if (user) return user;

  // If user ID is in session but user doesn't exist in DB, destroy session
  // We rely on `await logout(request)` to execute the session destruction and re-throw the redirect response.
  await logout(request);
  return null; // Unreachable, but satisfies TS/Remix if the throw is somehow missed.
}

/**
 * Requires a user to be logged in, otherwise redirects to login.
 */
export async function requireUserId(request: Request, redirectTo: string = new URL(request.url).pathname): Promise<string> {
  const userId = await getUserId(request);
  if (!userId) {
    const loginParams = new URLSearchParams([["redirectTo", redirectTo]]);
    throw redirect(`/login?${loginParams}`);
  }
  return userId;
}

/**
 * Requires a user to be logged in and returns the full User object.
 * Redirects to login if the user is not found.
 */
export async function requireUser(request: Request): Promise<User> {
  const user = await getUser(request);
  if (!user) {
    const redirectTo = new URL(request.url).pathname;
    const loginParams = new URLSearchParams([["redirectTo", redirectTo]]);
    throw redirect(`/login?${loginParams}`);
  }
  return user;
}

/**
 * Creates a session and redirects to the specified path.
 */
export async function createUserSession({
  request,
  userId,
  redirectTo,
}: {
  request: Request;
  userId: string;
  redirectTo: string;
}) {
  const session = await getSession(request.headers.get("Cookie"));
  session.set("userId", userId);

  return redirect(redirectTo, {
    headers: {
      "Set-Cookie": await commitSession(session),
    },
  });
}

/**
 * Destroys the session and redirects to the index page.
 */
export async function logout(request: Request) {
  const session = await getSession(request.headers.get("Cookie"));
  return redirect("/", {
    headers: {
      "Set-Cookie": await destroySession(session),
    },
  });
}

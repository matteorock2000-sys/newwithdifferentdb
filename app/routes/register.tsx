import { useState } from "react";
import { Form, Link, useActionData, useSearchParams, useNavigation } from "@remix-run/react";
import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { register, createUserSession, getUserId } from "~/services/auth.server";

export const meta: MetaFunction = () => [{ title: "Register | D&D Campaign Manager" }];

export async function loader({ request }: LoaderFunctionArgs) {
  const userId = await getUserId(request);
  if (userId) {
    // If already logged in, redirect to the index page
    throw createUserSession({ request, userId, redirectTo: "/" });
  }
  return json({});
}

export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const email = formData.get("email");
  const password = formData.get("password");
  const username = formData.get("username"); // Get username
  const redirectTo = formData.get("redirectTo") || "/";

  if (
    typeof email !== "string" ||
    typeof password !== "string" ||
    typeof username !== "string" || // Validate username
    password.length < 6 ||
    username.length < 3
  ) {
    return json({ error: "Email, Username (min 3 chars), and Password (min 6 chars) are required." }, { status: 400 });
  }

  try {
    const user = await register({ email, password, username });
    return createUserSession({ request, userId: user.id, redirectTo: String(redirectTo) });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Registration failed.";
    return json({ error: errorMessage }, { status: 400 });
  }
}

export default function RegisterRoute() {
  const actionData = useActionData<typeof action>();
  const [searchParams] = useSearchParams();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  return (
    <main className="min-h-screen w-screen p-4 lg:p-8 bg-gray-900 flex flex-col items-center justify-center">
      <div className="w-full max-w-md bg-black bg-opacity-70 p-8 rounded-lg border border-gray-700 shadow-xl">
        <h1 className="text-4xl font-medieval text-red-600 text-center mb-6">Register</h1>
        <Form method="post" className="space-y-6">
          <input
            type="hidden"
            name="redirectTo"
            value={searchParams.get("redirectTo") ?? "/"}
          />
          <div>
            <label htmlFor="username-input" className="block text-sm font-medium text-gray-300">
              Username (min 3 characters)
            </label>
            <input
              id="username-input"
              name="username"
              type="text"
              minLength={3}
              required
              autoFocus={true}
              className="mt-1 block w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-md text-white placeholder-gray-400 focus:outline-none focus:ring-red-500 focus:border-red-500"
            />
          </div>
          <div>
            <label htmlFor="email-input" className="block text-sm font-medium text-gray-300">
              Email address
            </label>
            <input
              id="email-input"
              name="email"
              type="email"
              required
              className="mt-1 block w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-md text-white placeholder-gray-400 focus:outline-none focus:ring-red-500 focus:border-red-500"
            />
          </div>
          <div>
            <label htmlFor="password-input" className="block text-sm font-medium text-gray-300">
              Password (min 6 characters)
            </label>
            <input
              id="password-input"
              name="password"
              type="password"
              minLength={6}
              required
              className="mt-1 block w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-md text-white placeholder-gray-400 focus:outline-none focus:ring-red-500 focus:border-red-500"
            />
          </div>

          {actionData?.error && (
            <p className="text-red-400 text-sm text-center" role="alert">
              {actionData.error}
            </p>
          )}

          <button
            type="submit"
            className={`w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-lg font-medium text-white transition duration-200 ${
              isSubmitting
                ? "bg-red-800 cursor-not-allowed"
                : "bg-red-700 hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
            }`}
            disabled={isSubmitting}
          >
            {isSubmitting ? "Registering..." : "Register"}
          </button>
        </Form>
        <div className="mt-6 text-center">
          <p className="text-sm text-gray-400">
            Already have an account?{" "}
            <Link
              to={{
                pathname: "/login",
                search: searchParams.toString(),
              }}
              className="font-medium text-red-500 hover:text-red-400"
            >
              Log in
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}

import { Form, Link } from "@remix-run/react";
import type { User } from "~/types";

interface HeaderProps {
  user: User | null;
}

export default function Header({ user }: HeaderProps) {
  return (
    <header className="bg-gray-800 border-b border-gray-700 p-4 flex justify-between items-center">
      <Link to="/" className="text-3xl font-medieval text-red-500 tracking-wider">
        D&D Campaign Manager
      </Link>
      <div className="flex items-center space-x-4 text-lg">
        {user ? (
          <>
            <span className="text-gray-300">Welcome, <b>{user.username}</b></span>
            <Form action="/logout" method="post">
              <button
                type="submit"
                className="py-1 px-3 rounded bg-red-700 hover:bg-red-600 transition duration-150"
              >
                Logout
              </button>
            </Form>
          </>
        ) : (
          <>
            <Link to="/login" className="py-1 px-3 rounded bg-blue-700 hover:bg-blue-600 transition duration-150">
              Login
            </Link>
            <Link to="/register" className="py-1 px-3 rounded bg-green-700 hover:bg-green-600 transition duration-150">
              Register
            </Link>
          </>
        )}
      </div>
    </header>
  );
}

"use client";

import LoginPage from "@/app/login/page";

/**
 * Dedicated /signup route sharing the identical premium sequential entrance animation
 * sequence as /login, defaulted to the Sign Up view.
 */
export default function SignUpPage() {
  return <LoginPage initialSignUp={true} />;
}

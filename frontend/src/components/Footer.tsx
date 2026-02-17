"use client";

import { useAuth } from "@/context/AuthContext";

export default function Footer() {
  const { user } = useAuth();

  return (
    <footer className="flex items-center justify-center gap-2 py-8 text-base text-text-secondary">
      <span>TubeText</span>
      {user && (
        <>
          <span>·</span>
          <a href="mailto:contact@tubetext.app" className="hover:underline">
            Contact
          </a>
        </>
      )}
    </footer>
  );
}

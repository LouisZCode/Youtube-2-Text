"use client";

import { useAuth } from "@/context/AuthContext";

export default function Footer() {
  const { user } = useAuth();

  return (
    <footer className="flex items-center justify-center gap-2 py-8 text-base text-text-secondary">
      <span>TubeText</span>
      <span>·</span>
      <a href="/muse" className="hover:underline">
        Muse
      </a>
      <span>·</span>
      <a href="/privacy" className="hover:underline">
        Privacy
      </a>
      <span>·</span>
      <a href="/terms" className="hover:underline">
        Terms
      </a>
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

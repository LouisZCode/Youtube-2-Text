import type { Metadata } from "next";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

export const metadata: Metadata = {
  title: "Privacy Policy — TubeText",
  description: "How TubeText collects, uses, and protects your data.",
};

export default function PrivacyPage() {
  return (
    <>
      <Header />
      <main className="mx-auto w-full max-w-3xl px-4 py-10">
        <h1 className="text-3xl font-bold">Privacy Policy</h1>
        <p className="mt-3 text-sm text-text-secondary">Last updated: September 28, 2026</p>

        <section className="mt-8">
          <h2 className="text-xl font-bold">What TubeText does</h2>
          <p className="mt-2 text-text-secondary">
            TubeText converts YouTube videos into formatted transcripts with timestamps,
            and offers AI summaries and translations. All processing starts from a video
            URL or search term you provide.
          </p>
        </section>

        <section className="mt-8">
          <h2 className="text-xl font-bold">Data we process</h2>
          <ul className="mt-2 list-disc space-y-2 pl-6 text-text-secondary">
            <li>
              <strong className="text-foreground">Video URLs and search terms</strong> you
              submit, used to fetch public captions from YouTube.
            </li>
            <li>
              <strong className="text-foreground">Transcripts</strong> retrieved from
              YouTube&apos;s public caption tracks. Transcript fetching may be routed through
              a proxy service so requests are not blocked.
            </li>
            <li>
              <strong className="text-foreground">Transcripts you summarize or translate</strong>,
              which are sent to our AI provider (OpenRouter) for processing and not used
              for advertising.
            </li>
            <li>
              <strong className="text-foreground">Account data</strong> (email address)
              if you sign in, used for authentication, usage limits, and premium status.
            </li>
            <li>
              <strong className="text-foreground">Payment data</strong> if you purchase
              premium, processed by Stripe. We never see or store your card details.
            </li>
            <li>
              <strong className="text-foreground">Feedback</strong> you optionally submit
              about results, used to improve quality.
            </li>
          </ul>
        </section>

        <section className="mt-8">
          <h2 className="text-xl font-bold">What we don&apos;t do</h2>
          <ul className="mt-2 list-disc space-y-2 pl-6 text-text-secondary">
            <li>No advertising trackers and no sale of personal data.</li>
            <li>We don&apos;t download or store video or audio files — only text captions.</li>
            <li>The MCP connector endpoint is read-only and stores no user data.</li>
          </ul>
        </section>

        <section className="mt-8">
          <h2 className="text-xl font-bold">Retention &amp; deletion</h2>
          <p className="mt-2 text-text-secondary">
            Transcripts are processed transiently to serve your request. Account data is
            kept while your account exists. To delete your account and associated data,
            write to <a href="mailto:contact@tubetext.app" className="underline hover:no-underline">contact@tubetext.app</a>.
          </p>
        </section>

        <section className="mt-8">
          <h2 className="text-xl font-bold">Contact</h2>
          <p className="mt-2 text-text-secondary">
            Questions about this policy:{" "}
            <a href="mailto:contact@tubetext.app" className="underline hover:no-underline">
              contact@tubetext.app
            </a>
          </p>
        </section>
      </main>
      <Footer />
    </>
  );
}

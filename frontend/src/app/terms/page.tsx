import type { Metadata } from "next";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

export const metadata: Metadata = {
  title: "Terms of Service — TubeText",
  description: "The terms governing your use of TubeText.",
};

export default function TermsPage() {
  return (
    <>
      <Header />
      <main className="mx-auto w-full max-w-3xl px-4 py-10">
        <h1 className="text-3xl font-bold">Terms of Service</h1>
        <p className="mt-3 text-sm text-text-secondary">Last updated: September 28, 2026</p>

        <section className="mt-8">
          <h2 className="text-xl font-bold">The service</h2>
          <p className="mt-2 text-text-secondary">
            TubeText provides YouTube transcript extraction, AI summaries, translations,
            and related APIs (including a public MCP connector endpoint). The service is
            provided &quot;as is&quot;, without warranties of any kind.
          </p>
        </section>

        <section className="mt-8">
          <h2 className="text-xl font-bold">Acceptable use</h2>
          <ul className="mt-2 list-disc space-y-2 pl-6 text-text-secondary">
            <li>Use TubeText only for content you have the right to access.</li>
            <li>Don&apos;t abuse the service: no automated bulk scraping, no circumventing usage limits.</li>
            <li>Free AI features are rate-limited (currently 20 calls per day per IP). Premium plans raise these limits.</li>
          </ul>
        </section>

        <section className="mt-8">
          <h2 className="text-xl font-bold">Intellectual property</h2>
          <p className="mt-2 text-text-secondary">
            Transcripts belong to the respective video owners and YouTube&apos;s terms continue
            to apply to them. TubeText claims no ownership over video content; outputs are
            provided for personal and fair-use purposes such as study, research, and accessibility.
          </p>
        </section>

        <section className="mt-8">
          <h2 className="text-xl font-bold">Payments</h2>
          <p className="mt-2 text-text-secondary">
            Premium purchases are processed by Stripe and are subject to Stripe&apos;s terms.
            Subscriptions can be cancelled at any time; access continues until the end of
            the billing period.
          </p>
        </section>

        <section className="mt-8">
          <h2 className="text-xl font-bold">Liability</h2>
          <p className="mt-2 text-text-secondary">
            To the maximum extent permitted by law, TubeText is not liable for indirect or
            consequential damages, including inaccurate transcripts, summaries, or translations.
            AI outputs may contain errors — verify important information against the source video.
          </p>
        </section>

        <section className="mt-8">
          <h2 className="text-xl font-bold">Changes &amp; contact</h2>
          <p className="mt-2 text-text-secondary">
            We may update these terms; continued use after changes means acceptance.
            Questions:{" "}
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

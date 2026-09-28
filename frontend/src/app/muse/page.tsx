import type { Metadata } from "next";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import CopyButton from "@/components/CopyButton";

export const metadata: Metadata = {
  title: "TubeText for Muse — YouTube transcripts in Meta's AI agent",
  description:
    "Connect TubeText to Meta Muse via our hosted MCP server: YouTube transcripts, summaries, and translations right in your Muse chats.",
};

const MCP_ENDPOINT = "https://tubetext-mcp-production.up.railway.app/mcp";

const SETUP_PROMPT = `Set up TubeText as a custom connector.

- Endpoint: ${MCP_ENDPOINT} (hosted MCP server over streamable HTTP, JSON-RPC 2.0).
- Auth: none needed. Read tools are public; AI tools run on a shared daily quota.
- After connecting, list every tool it gives you and show me the results.
- Then save it as a reusable skill called "TubeText" so I can ask about YouTube videos from any conversation.

Confirm success by listing the available TubeText tools.`;

const TOOLS = [
  { name: "get_transcript", desc: "Fetch a YouTube video's transcript with timestamps." },
  { name: "list_languages", desc: "List caption languages available for a video." },
  { name: "search_videos", desc: "Search YouTube by topic or list a channel's latest videos." },
  { name: "resolve_channel", desc: "Find the right channel when given just a creator name." },
  { name: "summarize", desc: "Summarize a transcript into key takeaways." },
  { name: "translate", desc: "Translate a transcript into another language." },
];

const EXAMPLES = [
  "What are Fireship's latest videos about?",
  "Summarize this video for me: https://www.youtube.com/watch?v=…",
  "Translate this video's transcript to Spanish: https://www.youtube.com/watch?v=…",
];

export default function MusePage() {
  return (
    <>
      <Header />
      <main className="mx-auto w-full max-w-3xl px-4 py-10">
        <h1 className="text-3xl font-bold">TubeText for Muse</h1>
        <p className="mt-3 text-text-secondary">
          Bring YouTube transcripts, AI summaries, and translations into Meta Muse.
          TubeText runs a public, read-only MCP server — point Muse at it once and ask
          about any video from any chat.
        </p>

        <h2 className="mt-10 text-xl font-bold">Set it up (takes a minute)</h2>
        <ol className="mt-3 list-decimal space-y-2 pl-6 text-text-secondary">
          <li>Open Muse (iOS, Android, or web) and start a new chat.</li>
          <li>Paste the setup prompt below and send it.</li>
          <li>Muse connects, lists the tools, and saves TubeText as a skill.</li>
        </ol>
        <div className="mt-4 rounded-xl border border-border bg-card p-4">
          <pre className="whitespace-pre-wrap font-mono text-sm">{SETUP_PROMPT}</pre>
          <div className="mt-3">
            <CopyButton text={SETUP_PROMPT} />
          </div>
        </div>

        <h2 className="mt-10 text-xl font-bold">What Muse can do with it</h2>
        <ul className="mt-3 space-y-3">
          {TOOLS.map((t) => (
            <li key={t.name} className="rounded-xl border border-border bg-card p-4">
              <span className="font-mono text-sm font-bold">{t.name}</span>
              <p className="mt-1 text-sm text-text-secondary">{t.desc}</p>
            </li>
          ))}
        </ul>

        <h2 className="mt-10 text-xl font-bold">Example prompts</h2>
        <ul className="mt-3 space-y-2">
          {EXAMPLES.map((e) => (
            <li key={e} className="rounded-xl border border-border bg-card p-4 font-mono text-sm">
              “{e}”
            </li>
          ))}
        </ul>

        <h2 className="mt-10 text-xl font-bold">Access &amp; limits</h2>
        <ul className="mt-3 list-disc space-y-2 pl-6 text-text-secondary">
          <li>No account needed. Transcript and search tools are unlimited.</li>
          <li>AI tools (summarize, translate) run on a shared quota of 20 calls per day per IP.</li>
          <li>Read-only: TubeText never posts, uploads, or modifies anything.</li>
        </ul>

        <h2 className="mt-10 text-xl font-bold">Technical details</h2>
        <div className="mt-3 rounded-xl border border-border bg-card p-4 font-mono text-sm">
          <p>Endpoint: {MCP_ENDPOINT}</p>
          <p className="mt-1">Transport: streamable HTTP, stateless (no session headers needed)</p>
          <p className="mt-1">Protocol: MCP / JSON-RPC 2.0</p>
        </div>
        <p className="mt-3 text-sm text-text-secondary">
          Source code and integration docs:{" "}
          <a
            href="https://github.com/anomalyco/muse_connectors"
            className="underline hover:no-underline"
          >
            github.com/anomalyco/muse_connectors
          </a>
        </p>
        <p className="mt-3 text-sm text-text-secondary">
          How TubeText handles your data:{" "}
          <a href="/privacy" className="underline hover:no-underline">
            Privacy Policy
          </a>{" "}
          ·{" "}
          <a href="/terms" className="underline hover:no-underline">
            Terms of Service
          </a>
        </p>
      </main>
      <Footer />
    </>
  );
}

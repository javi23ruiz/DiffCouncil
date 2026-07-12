interface PromptShaLinkProps {
  sha: string;
  repo?: string;
}

export function PromptShaLink({ sha, repo }: PromptShaLinkProps) {
  if (!sha || sha === "mock" || sha === "pending" || sha === "unknown") {
    return (
      <code className="text-xs text-zinc-500 bg-zinc-800 px-1 rounded">
        {sha}
      </code>
    );
  }
  const short = sha.slice(0, 7);
  const href = repo
    ? `https://github.com/${repo}/commit/${sha}`
    : `https://github.com/search?q=${sha}&type=commits`;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-xs text-blue-400 hover:text-blue-300 font-mono bg-zinc-800 px-1 rounded transition-colors"
      title={sha}
    >
      {short}
    </a>
  );
}

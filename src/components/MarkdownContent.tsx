import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface Props {
  content: string;
  compact?: boolean;
}

export default function MarkdownContent({ content, compact = false }: Props) {
  if (!content?.trim()) return null;

  return (
    <div className={`markdown-body${compact ? " markdown-body--compact" : ""}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

function safeHref(url) {
  const u = String(url || "").trim();
  if (!u) return null;
  if (/^https?:\/\//i.test(u)) return u;
  if (/^mailto:/i.test(u)) return u;
  if (u.startsWith("/") && !u.startsWith("//")) return u;
  if (u.startsWith("#")) return u;
  return null;
}

/**
 * Markdown da resposta da IA, sem HTML bruto; links só http(s), mailto, âncoras e caminhos relativos.
 * @param {{ markdown: string }} props
 */
export default function IaMarkdownContent({ markdown }) {
  const text = String(markdown || "");
  return (
    <div className="ia-md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a({ href, children, ...rest }) {
            const safe = safeHref(href);
            if (!safe) {
              return <span className="ia-md-badlink">{children}</span>;
            }
            const external = /^https?:/i.test(safe) || /^mailto:/i.test(safe);
            return (
              <a
                {...rest}
                href={safe}
                {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
              >
                {children}
              </a>
            );
          },
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}

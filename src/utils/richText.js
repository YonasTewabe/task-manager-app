const SAFE_URL_PROTOCOL = /^(https?:\/\/|\/)/i;
const HTML_TAG_PATTERN = /<[^>]+>/;
const ALLOWED_TAGS = new Set([
  "P",
  "BR",
  "STRONG",
  "B",
  "EM",
  "I",
  "U",
  "S",
  "UL",
  "OL",
  "LI",
  "A",
  "IMG",
  "BLOCKQUOTE",
  "CODE",
  "PRE",
]);

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function sanitizeUrl(rawUrl) {
  const value = String(rawUrl || "").trim();
  if (!value) return "";
  if (!SAFE_URL_PROTOCOL.test(value)) return "";
  return value;
}

function markdownToHtml(text) {
  let html = escapeHtml(text);
  html = html.replace(
    /!\[([^\]]*)\]\(([^)]+)\)/g,
    (_m, alt, url) => {
      const safeUrl = sanitizeUrl(url);
      if (!safeUrl) return "";
      return `<img src="${escapeHtml(safeUrl)}" alt="${escapeHtml(alt)}" />`;
    },
  );
  html = html.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    (_m, label, url) => {
      const safeUrl = sanitizeUrl(url);
      if (!safeUrl) return escapeHtml(label);
      return `<a href="${escapeHtml(safeUrl)}" target="_blank" rel="noreferrer">${escapeHtml(label)}</a>`;
    },
  );
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*([^*\n]+)\*/g, "<em>$1</em>");
  html = html.replace(/`([^`\n]+)`/g, "<code>$1</code>");
  const paragraphs = html
    .split(/\n{2,}/)
    .map((chunk) => chunk.trim())
    .filter(Boolean);
  return paragraphs.map((p) => `<p>${p.replace(/\n/g, "<br/>")}</p>`).join("");
}

export function sanitizeRichHtml(value) {
  const source = String(value || "");
  if (!source.trim()) return "";
  if (typeof window === "undefined" || typeof DOMParser === "undefined") {
    return escapeHtml(source);
  }
  const parser = new DOMParser();
  const doc = parser.parseFromString(source, "text/html");
  const nodes = [...doc.body.querySelectorAll("*")];
  nodes.forEach((node) => {
    const tag = node.tagName.toUpperCase();
    if (!ALLOWED_TAGS.has(tag)) {
      const text = doc.createTextNode(node.textContent || "");
      node.replaceWith(text);
      return;
    }
    [...node.attributes].forEach((attribute) => {
      const name = attribute.name.toLowerCase();
      if (tag === "A" && name === "href") {
        const safeUrl = sanitizeUrl(attribute.value);
        if (!safeUrl) {
          node.removeAttribute("href");
        } else {
          node.setAttribute("href", safeUrl);
          node.setAttribute("target", "_blank");
          node.setAttribute("rel", "noreferrer");
        }
        return;
      }
      if (tag === "IMG" && (name === "src" || name === "alt")) {
        if (name === "src") {
          const safeUrl = sanitizeUrl(attribute.value);
          if (!safeUrl) {
            node.remove();
          } else {
            node.setAttribute("src", safeUrl);
          }
        }
        return;
      }
      node.removeAttribute(attribute.name);
    });
  });
  return doc.body.innerHTML.trim();
}

export function toDisplayRichText(value) {
  const text = String(value || "");
  if (!text.trim()) return "";
  const html = HTML_TAG_PATTERN.test(text) ? text : markdownToHtml(text);
  return sanitizeRichHtml(html);
}

export function isRichTextEmpty(value) {
  const html = sanitizeRichHtml(value);
  if (!html) return true;
  if (typeof window === "undefined" || typeof DOMParser === "undefined") {
    return !String(html).replace(/\s+/g, "").length;
  }
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  return !(doc.body.textContent || "").trim() && !doc.body.querySelector("img");
}

export function toEditorRichText(value) {
  const text = String(value || "");
  if (!text.trim()) return "";
  if (HTML_TAG_PATTERN.test(text)) return sanitizeRichHtml(text);
  return sanitizeRichHtml(markdownToHtml(text));
}

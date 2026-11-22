const clean = (value) => String(value ?? "").trim();

const needUrl = (url) => {
  const link = clean(url);
  if (!/^https?:\/\//i.test(link)) throw new Error("invalid_url");
  return link;
};

export function shareTargets({ url, text = "" } = {}) {
  const link = needUrl(url);
  const note = clean(text);
  const message = note ? `${note} ${link}` : link;
  return {
    whatsapp: `https://wa.me/?text=${encodeURIComponent(message)}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(link)}`,
    x: `https://x.com/intent/post?${new URLSearchParams({ url: link, ...(note ? { text: note } : {}) })}`,
  };
}

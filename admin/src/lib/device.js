/** A short, human label for a user-agent string: "Chrome on Windows". Falls back to "Unknown device". */
export function describeDevice(userAgent) {
  if (!userAgent) return "Unknown device";
  const ua = userAgent;
  const os = /iPhone|iPad|iPod/.test(ua) ? "iOS"
    : /Android/.test(ua) ? "Android"
    : /Windows/.test(ua) ? "Windows"
    : /Mac OS X|Macintosh/.test(ua) ? "macOS"
    : /CrOS/.test(ua) ? "ChromeOS"
    : /Linux/.test(ua) ? "Linux" : null;
  const browser = /Edg\//.test(ua) ? "Edge"
    : /OPR\/|Opera/.test(ua) ? "Opera"
    : /Firefox\//.test(ua) ? "Firefox"
    : /Chrome\/|CriOS\//.test(ua) ? "Chrome"
    : /Safari\//.test(ua) ? "Safari" : null;
  if (browser && os) return `${browser} on ${os}`;
  return browser ?? os ?? "Unknown device";
}

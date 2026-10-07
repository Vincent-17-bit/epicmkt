import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { joinUrl } from "@epicmkt/shared";
import { useAppLinks } from "../hooks/useAppLinks.js";

export default function AppRedirect({ app, prefix }) {
  const { pathname, search, hash } = useLocation();
  const links = useAppLinks();
  const target = app === "admin" ? links.adminUrl : links.sellerUrl;

  useEffect(() => {
    if (!links.ready) return;
    const rest = pathname.slice(prefix.length);
    window.location.replace(`${joinUrl(target, rest)}${search}${hash}`);
  }, [links.ready, target, pathname, search, hash, prefix]);

  return null;
}

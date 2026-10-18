import { useEffect, useState } from "react";
import { motionAllowed } from "../../lib/motion.js";
import { t } from "../../i18n/index.js";
import styles from "./item.module.css";

export default function ItemTabs({ tabs }) {
  const [active, setActive] = useState(tabs[0]?.id);
  const key = tabs.map((tab) => tab.id).join("|");

  useEffect(() => {
    setActive((current) => (tabs.some((tab) => tab.id === current) ? current : tabs[0]?.id));
    if (typeof IntersectionObserver === "undefined") return undefined;
    const seen = new Map();
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => seen.set(entry.target.id, entry.isIntersecting ? entry.boundingClientRect.top : null));
        const visible = [...seen.entries()].filter(([, top]) => top !== null).sort((a, b) => a[1] - b[1]);
        if (visible.length) setActive(visible[0][0]);
      },
      { rootMargin: "-120px 0px -55% 0px" }
    );
    tabs.forEach((tab) => {
      const node = document.getElementById(tab.id);
      if (node) observer.observe(node);
    });
    return () => observer.disconnect();
  }, [key]);

  const go = (id) => {
    setActive(id);
    document.getElementById(id)?.scrollIntoView({ behavior: motionAllowed() ? "smooth" : "auto", block: "start" });
  };

  if (tabs.length < 2) return null;

  return (
    <nav className={styles.tabs} aria-label={t("item.tabs")}>
      <ul className={styles.tabList}>
        {tabs.map((tab) => (
          <li key={tab.id}>
            <button type="button" className={styles.tab} aria-current={tab.id === active ? "true" : undefined} onClick={() => go(tab.id)}>
              {tab.label}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}

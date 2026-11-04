import { Link } from "react-router-dom";
import { Accordion } from "@epicmkt/ui";

/** One accordion for a list from data/faqs.js. An item with a link shows it after the answer. */
export default function FaqList({ items, idPrefix, level = 3 }) {
  const rows = items.map((item) => ({
    q: item.q,
    a: item.link ? (
      <>
        {item.a} <Link to={item.link.to}>{item.link.label}</Link>
      </>
    ) : (
      item.a
    )
  }));
  return <Accordion items={rows} idPrefix={idPrefix} level={level} />;
}

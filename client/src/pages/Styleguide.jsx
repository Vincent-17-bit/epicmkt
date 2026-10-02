import { useLayoutEffect, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCheck,
  faXmark,
  faScissors,
  faDroplet,
  faPills,
  faTag,
  faDoorClosed,
  faPhone,
  faStore
} from "@fortawesome/free-solid-svg-icons";
import Container from "../components/Container.jsx";
import Button from "../components/Button.jsx";
import IconButton from "../components/IconButton.jsx";
import Skeleton from "../components/Skeleton.jsx";
import BusinessCard from "../components/BusinessCard.jsx";
import Img from "../components/Img.jsx";
import { FeaturedBadge, VerifiedBadge } from "../components/Badges.jsx";
import { usePageTitle } from "../hooks/usePageTitle.js";
import styles from "./Styleguide.module.css";

const groups = [
  { name: "Surfaces", tokens: ["bg", "surface", "surface-2", "surface-3", "header-bg", "footer-bg"] },
  { name: "Lines", tokens: ["border", "border-strong", "input-border"] },
  { name: "Text", tokens: ["text", "text-muted", "text-inverse"] },
  { name: "Primary", tokens: ["primary", "primary-hover", "primary-pressed", "on-primary", "primary-tint", "on-primary-tint"] },
  { name: "Links", tokens: ["link", "link-hover-bg", "link-underline", "verified"] },
  { name: "Featured", tokens: ["featured-bg", "featured-text", "featured-star"] },
  { name: "Utility", tokens: ["scrim", "skeleton-base", "skeleton-shine", "focus-ring", "ring-gap"] }
];

const sizes = ["xs", "sm", "md", "lg", "xl", "2xl", "3xl"];

const pairs = [
  ["text", "bg", 4.5],
  ["text", "surface", 4.5],
  ["text", "header-bg", 4.5],
  ["text", "footer-bg", 4.5],
  ["text-muted", "bg", 4.5],
  ["text-muted", "surface", 4.5],
  ["text-muted", "surface-3", 4.5],
  ["on-primary", "primary", 4.5],
  ["on-primary", "primary-hover", 4.5],
  ["on-primary", "primary-pressed", 4.5],
  ["on-primary-tint", "primary-tint", 4.5],
  ["featured-text", "featured-bg", 4.5],
  ["featured-star", "featured-bg", 3],
  ["link", "surface", 4.5],
  ["verified", "surface", 3],
  ["input-border", "surface-2", 3]
];

const sample = {
  id: "styleguide",
  slug: "mwangi-barbers",
  hue: 210,
  name: "Mwangi Barbers",
  plan: "premium",
  verified: true,
  categoryIcon: "scissors",
  categoryName: "Barbershops",
  area: "Milimani",
  county: "Kisumu",
  tagline: "Clean cuts, fades and beard trims. Walk-ins welcome.",
  rating: 4.6,
  reviewCount: 38,
  isOpen: true,
  phone: "+254700000000",
  whatsapp: "+254700000000",
  lat: -0.0917,
  lng: 34.768
};

const photo =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#d9d9d9"/><stop offset="1" stop-color="#8a8a8a"/></linearGradient></defs><rect width="640" height="360" fill="url(#g)"/></svg>'
  );

const read = (pane, name) => {
  const probe = document.createElement("span");
  probe.style.color = `var(--${name})`;
  pane.appendChild(probe);
  const [r, g, b, a = 1] = getComputedStyle(probe).color.match(/[\d.]+/g).map(Number);
  probe.remove();
  return { r, g, b, a };
};

const mix = (top, base) => ({
  r: top.r * top.a + base.r * (1 - top.a),
  g: top.g * top.a + base.g * (1 - top.a),
  b: top.b * top.a + base.b * (1 - top.a),
  a: 1
});

const channel = (value) => {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

const luminance = ({ r, g, b }) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);

const ratio = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

function Block({ title, children }) {
  return (
    <section className={styles.block}>
      <h3 className={styles.blockTitle}>{title}</h3>
      {children}
    </section>
  );
}

function Contrast({ paneRef }) {
  const [rows, setRows] = useState([]);

  useLayoutEffect(() => {
    const pane = paneRef.current;
    const base = read(pane, "surface");
    setRows(
      pairs.map(([fg, bg, min]) => {
        const back = mix(read(pane, bg), base);
        const front = mix(read(pane, fg), back);
        return { fg, bg, min, value: ratio(front, back) };
      })
    );
  }, [paneRef]);

  return (
    <table className={styles.table}>
      <thead>
        <tr>
          <th scope="col">Pair</th>
          <th scope="col">Ratio</th>
          <th scope="col">Needs</th>
          <th scope="col">Result</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const pass = row.value >= row.min;
          return (
            <tr key={`${row.fg}-${row.bg}`}>
              <td>
                <span className={styles.pair} style={{ color: `var(--${row.fg})`, background: `var(--${row.bg})` }}>
                  Aa
                </span>
                {row.fg} on {row.bg}
              </td>
              <td>{row.value.toFixed(2)}</td>
              <td>{row.min}:1</td>
              <td>
                <span className={pass ? styles.pass : styles.fail}>
                  <FontAwesomeIcon icon={pass ? faCheck : faXmark} />
                  {pass ? "Pass" : "Fail"}
                </span>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function Pane({ theme }) {
  const paneRef = useRef(null);

  return (
    <div ref={paneRef} data-theme={theme} className={styles.pane}>
      <h2 className={styles.paneTitle}>{theme === "light" ? "Light" : "Dark"}</h2>

      <Block title="Tokens">
        {groups.map((group) => (
          <div key={group.name} className={styles.group}>
            <h4 className={styles.groupTitle}>{group.name}</h4>
            <ul className={styles.swatches}>
              {group.tokens.map((token) => (
                <li key={token} className={styles.swatch}>
                  <span className={styles.chip} style={{ background: `var(--${token})` }} />
                  <code>--{token}</code>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </Block>

      <Block title="Typography">
        {sizes.map((size) => (
          <p key={size} className={styles.type} style={{ fontSize: `var(--text-${size})` }}>
            <span>text-{size}</span> Find local businesses
          </p>
        ))}
        <p className={styles.type}>
          Body text with a <a href="#styleguide" onClick={(e) => e.preventDefault()}>sample link</a> inside it.
        </p>
        <p className={styles.muted}>Muted text for secondary details.</p>
      </Block>

      <Block title="Buttons">
        <div className={styles.row}>
          <Button icon={faPhone}>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="dark">Dark</Button>
          <Button variant="ghost">Ghost</Button>
        </div>
        <div className={styles.row}>
          <Button size="sm">Small</Button>
          <Button size="lg" icon={faStore}>
            Large
          </Button>
          <Button disabled>Disabled</Button>
          <IconButton icon={faPhone} label="Call" />
        </div>
      </Block>

      <Block title="Chips and badges">
        <div className={styles.row}>
          <FeaturedBadge />
          <VerifiedBadge />
          <span className={styles.open}>Open now</span>
          <span className={styles.closed}>
            <FontAwesomeIcon icon={faDoorClosed} />
            Closed
          </span>
          <span className={styles.sale}>
            <FontAwesomeIcon icon={faTag} />
            Sale
          </span>
        </div>
      </Block>

      <Block title="Inputs">
        <label className={styles.field}>
          <span>Search businesses</span>
          <input type="search" placeholder="Barbershop, chemist, gym" className={styles.input} />
        </label>
        <label className={styles.field}>
          <span>Disabled</span>
          <input type="text" placeholder="Unavailable" disabled className={styles.input} />
        </label>
      </Block>

      <Block title="Cards">
        <BusinessCard business={sample} />
        <div className={styles.photo}>
          <Img src={photo} alt="" width={640} height={360} />
          <div className={styles.overlay}>
            <strong>Cover text stays readable</strong>
            <span>Gradient from transparent to black</span>
          </div>
        </div>
      </Block>

      <Block title="Menu items">
        <ul className={styles.menu}>
          <li className={styles.item}>
            <FontAwesomeIcon icon={faScissors} />
            Default
          </li>
          <li className={`${styles.item} ${styles.itemHover}`}>
            <FontAwesomeIcon icon={faDroplet} />
            Hover
          </li>
          <li className={`${styles.item} ${styles.itemActive}`}>
            <FontAwesomeIcon icon={faPills} />
            Active
          </li>
        </ul>
      </Block>

      <Block title="Panel">
        <div className={styles.panel}>
          <strong>Panel surface</strong>
          <p className={styles.muted}>Border and elevation as used by the menu panel and modals.</p>
        </div>
      </Block>

      <Block title="Skeletons">
        <div className={styles.skeletons}>
          <Skeleton height="44px" radius="var(--radius-pill)" />
          <Skeleton height="1rem" width="70%" />
          <Skeleton height="1rem" width="45%" />
          <Skeleton height="120px" radius="var(--radius-card)" />
        </div>
      </Block>

      <Block title="Contrast">
        <Contrast paneRef={paneRef} />
      </Block>
    </div>
  );
}

export default function Styleguide() {
  usePageTitle("Styleguide");
  return (
    <Container className={styles.page}>
      <h1 className={styles.title}>Styleguide</h1>
      <div className={styles.panes}>
        <Pane theme="light" />
        <Pane theme="dark" />
      </div>
    </Container>
  );
}

import { Link } from "react-router-dom";
import LegalPage from "../components/LegalPage.jsx";
import { usePageTitle } from "../hooks/usePageTitle.js";

const highlights = [
  { title: "No advertising cookies", text: "We do not use advertising or cross-site tracking cookies." },
  { title: "Only what is needed", text: "We store your settings and cached pages so EpicMKT works the way you set it up." },
  { title: "Easy to clear", text: "Remove everything at any time from your browser settings." }
];

const stored = [
  { item: "Theme", purpose: "Remembers light, dark or system appearance.", kind: "Preference", life: "Until you clear it" },
  { item: "Town and location choice", purpose: "Remembers the town you pick, or that you declined location sharing.", kind: "Preference", life: "Until you clear it" },
  { item: "Recent searches", purpose: "Lets you repeat a search quickly. Kept on your device only.", kind: "Preference", life: "Until you clear it" },
  { item: "Cached pages and images", purpose: "Speeds up loading and lets pages open offline.", kind: "Performance", life: "Until replaced or cleared" }
];

const sections = [
  {
    id: "what",
    title: "What these technologies are",
    body: (
      <p>
        Cookies are small text files placed on your device by a website. Similar technologies, such as local storage and the cache, let a website
        remember information on your device. This notice uses &ldquo;cookies&rdquo; to mean all of them.
      </p>
    )
  },
  {
    id: "use",
    title: "What EpicMKT stores",
    body: (
      <>
        <p>EpicMKT stores only the items below. All of them are strictly necessary to provide the features you ask for.</p>
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th scope="col">Item</th>
                <th scope="col">Purpose</th>
                <th scope="col">Type</th>
                <th scope="col">Duration</th>
              </tr>
            </thead>
            <tbody>
              {stored.map((row) => (
                <tr key={row.item}>
                  <th scope="row">{row.item}</th>
                  <td>{row.purpose}</td>
                  <td>{row.kind}</td>
                  <td>{row.life}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>
    )
  },
  {
    id: "not",
    title: "What we do not do",
    body: (
      <ul>
        <li>We do not use advertising cookies or sell data gathered through them.</li>
        <li>We do not build advertising profiles or track you across other websites.</li>
        <li>We do not store payment details; EpicMKT does not handle payments.</li>
      </ul>
    )
  },
  {
    id: "third",
    title: "Third-party content",
    body: (
      <p>
        Map previews on business pages are provided by OpenStreetMap, which may set its own cookies. When you tap Call, WhatsApp or Directions you
        leave EpicMKT and those services handle their own cookies and data under their own policies. We do not control them.
      </p>
    )
  },
  {
    id: "controls",
    title: "Your choices",
    body: (
      <>
        <p>
          Because we use only essential storage, we do not ask for consent before setting it. You remain in control: every major browser lets you
          view, block and delete cookies and site data in its settings.
        </p>
        <p>
          If you clear this data, EpicMKT will forget your theme and town and you may need to choose them again. Blocking all storage may stop
          some features, such as offline use, from working.
        </p>
      </>
    )
  },
  {
    id: "law",
    title: "Legal basis",
    body: (
      <p>
        Essential storage is used to provide the service you request and in our legitimate interest in keeping it secure and working. Where any
        personal data is involved it is handled under our <Link to="/privacy">Privacy Policy</Link> and the Data Protection Act, 2019. If we ever
        introduce non-essential cookies we will ask for your consent first.
      </p>
    )
  },
  {
    id: "changes",
    title: "Changes to this notice",
    body: (
      <p>
        We may update this notice if the way we use storage changes. The current version is always published on this page. For questions,{" "}
        <Link to="/contact">contact us</Link>.
      </p>
    )
  }
];

export default function Cookies() {
  usePageTitle("Cookie notice");
  return (
    <LegalPage
      current="Cookie notice"
      eyebrow="Legal"
      title="Cookie notice"
      intro="What EpicMKT stores on your device, why it is needed, and how you can control it."
      highlights={highlights}
      sections={sections}
    />
  );
}

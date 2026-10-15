import { useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowRotateRight, faBell, faDownload, faPlus, faTrash } from "@fortawesome/free-solid-svg-icons";
import {
  Button,
  Card,
  Chip,
  ConfirmDialog,
  CountUp,
  Drawer,
  EMPTY_ILLUSTRATIONS,
  EmptyState,
  IconButton,
  Modal,
  Skeleton,
  Sparkline,
  STATUS_MAP,
  StatusChip,
  Tabs,
  cx,
  useToast,
} from "../components/index.js";
import styles from "./KitPage.module.css";

const TREND = [4, 6, 5, 9, 8, 12, 10, 15, 14, 18, 17, 22];
const FLAT = [5, 5, 5, 5, 5];

const VIEWS = [
  ["both", "Side by side"],
  ["light", "Light"],
  ["dark", "Dark"],
];

export default function KitPage() {
  const [view, setView] = useState("both");
  const themes = view === "both" ? ["light", "dark"] : [view];
  return (
    <div className={styles.page}>
      <header className={styles.top}>
        <div>
          <h1 className={styles.h1}>Admin component kit</h1>
          <p className={styles.lead}>Every base component, in both themes. Hover, focus (Tab) and press states are live.</p>
        </div>
        <div role="group" aria-label="Theme view" className={styles.views}>
          {VIEWS.map(([id, label]) => (
            <Button key={id} size="sm" variant={view === id ? "primary" : "secondary"} aria-pressed={view === id} onClick={() => setView(id)}>
              {label}
            </Button>
          ))}
        </div>
      </header>
      <div className={styles.panes} data-count={themes.length}>
        {themes.map((theme) => (
          <KitPane key={theme} theme={theme} />
        ))}
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <section className={styles.section}>
      <h2 className={styles.h2}>{title}</h2>
      {children}
    </section>
  );
}

function KitPane({ theme }) {
  const toast = useToast();
  const [modal, setModal] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [removed, setRemoved] = useState(false);
  const [tab, setTab] = useState("overview");
  const [countKey, setCountKey] = useState(0);
  const deleteButton = useRef(null);

  const simulateLoad = () => {
    setLoading(true);
    setTimeout(() => setLoading(false), 1600);
  };

  const removeRow = () => {
    setRemoved(true);
    toast.undo({ theme, message: "Mara Fresh Mart removed", onUndo: () => setRemoved(false) });
  };

  return (
    <div data-theme={theme} className={styles.pane} aria-label={`${theme} theme`} role="region">
      <h2 className={styles.paneTitle}>{theme === "light" ? "Light theme" : "Dark theme"}</h2>

      <Section title="Buttons">
        <div className={styles.row}>
          <Button variant="primary">Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger" icon={<FontAwesomeIcon icon={faTrash} />}>Danger</Button>
          <Button variant="primary" disabled>Disabled</Button>
          <Button variant="secondary" disabled>Disabled</Button>
          <Button variant="primary" loading={loading} onClick={simulateLoad} icon={<FontAwesomeIcon icon={faArrowRotateRight} />}>
            {loading ? "Saving" : "Click to load"}
          </Button>
        </div>
        <div className={styles.row}>
          <Button size="sm" variant="secondary">Small</Button>
          <Button size="md" variant="secondary">Medium</Button>
          <Button size="lg" variant="secondary">Large</Button>
          <Button variant="secondary" iconRight={<FontAwesomeIcon icon={faDownload} />}>Export</Button>
        </div>
      </Section>

      <Section title="Icon buttons (aria-label required)">
        <div className={styles.row}>
          <IconButton aria-label="Notifications" icon={<FontAwesomeIcon icon={faBell} />} />
          <IconButton aria-label="Add" variant="secondary" icon={<FontAwesomeIcon icon={faPlus} />} />
          <IconButton aria-label="Add" variant="primary" icon={<FontAwesomeIcon icon={faPlus} />} />
          <IconButton aria-label="Delete" variant="danger" icon={<FontAwesomeIcon icon={faTrash} />} />
          <IconButton aria-label="Small" size="sm" variant="secondary" icon={<FontAwesomeIcon icon={faBell} />} />
          <IconButton aria-label="Disabled" disabled variant="secondary" icon={<FontAwesomeIcon icon={faBell} />} />
        </div>
      </Section>

      <Section title="Status chips (icon + label + tone)">
        <div className={styles.row}>
          {Object.keys(STATUS_MAP).map((status) => (
            <StatusChip key={status} status={status} />
          ))}
          <StatusChip status="something_new" />
        </div>
        <div className={styles.row}>
          {["neutral", "info", "success", "warning", "danger"].map((tone) => (
            <Chip key={tone} tone={tone}>{tone}</Chip>
          ))}
        </div>
      </Section>

      <Section title="Cards, count-up and sparkline">
        <div className={styles.cards}>
          <Card title="Applications waiting" description="Submitted or under review" actions={<StatusChip status="under_review" />}>
            <div className={styles.stat}>
              <span className={styles.statValue}><CountUp key={countKey} value={1284} /></span>
              <Sparkline label="Applications per day, last 12 days" values={TREND} series={1} />
            </div>
          </Card>
          <Card
            title="Revenue this month"
            footer={<Button size="sm" variant="ghost" onClick={() => setCountKey((k) => k + 1)}>Replay count</Button>}
          >
            <div className={styles.stat}>
              <span className={styles.statValue}>
                KES <CountUp key={countKey} value={348500} duration={1100} />
              </span>
              <Sparkline label="Revenue per day, last 12 days" values={[...TREND].reverse()} series={3} />
            </div>
          </Card>
          <Card as="button" type="button" interactive padding="lg" aria-label="Interactive card example">
            <strong className={styles.block}>Interactive card</strong>
            <span className={cx(styles.muted, styles.block)}>Lifts on hover (hover devices only).</span>
            <Sparkline label="Flat trend" values={FLAT} series={5} />
          </Card>
        </div>
      </Section>

      <Section title="Skeleton">
        <Card title="Loading" aria-busy="true">
          <div className={styles.skeletons}>
            <Skeleton variant="circle" width={40} />
            <div className={styles.grow}>
              <Skeleton variant="text" lines={3} />
            </div>
            <Skeleton width={96} height={36} />
          </div>
        </Card>
      </Section>

      <Section title="Tabs">
        <Tabs
          label={`${theme} tabs`}
          value={tab}
          onChange={setTab}
          items={[
            { id: "overview", label: "Overview", content: <p className={styles.muted}>Arrow keys move between tabs. Home and End jump to the ends.</p> },
            { id: "documents", label: "Documents", count: 3, content: <p className={styles.muted}>Three documents on file.</p> },
            { id: "history", label: "History", count: 12, content: <p className={styles.muted}>Twelve events.</p> },
            { id: "locked", label: "Locked", disabled: true, content: null },
          ]}
        />
      </Section>

      <Section title="Empty states">
        <div className={styles.empties}>
          {EMPTY_ILLUSTRATIONS.map((illustration) => (
            <Card key={illustration} padding="sm">
              <EmptyState
                illustration={illustration}
                title={{ inbox: "Nothing waiting", search: "No matches", list: "No payments yet", error: "Could not load", lock: "Owner only" }[illustration]}
                description="Say what is missing and what to do next."
                action={<Button size="sm" variant="secondary">Action</Button>}
              />
            </Card>
          ))}
        </div>
      </Section>

      <Section title="Toasts, modal, drawer, confirm">
        <div className={styles.row}>
          <Button variant="secondary" onClick={() => toast.success("Application approved", { theme })}>Success</Button>
          <Button variant="secondary" onClick={() => toast.info("Synced 12 records", { theme, title: "Up to date" })}>Info</Button>
          <Button variant="secondary" onClick={() => toast.warning("Payment code looks unusual", { theme })}>Warning</Button>
          <Button variant="secondary" onClick={() => toast.error("Could not save. Check your connection.", { theme })}>Error</Button>
        </div>
        <div className={styles.row}>
          <Button variant="secondary" onClick={() => setModal(true)}>Open modal</Button>
          <Button variant="secondary" onClick={() => setDrawer(true)}>Open drawer</Button>
          <Button variant="danger" onClick={() => setConfirm(true)}>Suspend business…</Button>
        </div>
        <Card title="Undo example" padding="sm">
          {removed ? (
            <p className={styles.muted}>Removed. Use Undo in the toast to bring it back.</p>
          ) : (
            <div className={styles.undoRow}>
              <span>Mara Fresh Mart</span>
              <Button ref={deleteButton} size="sm" variant="danger" icon={<FontAwesomeIcon icon={faTrash} />} onClick={removeRow}>
                Remove
              </Button>
            </div>
          )}
        </Card>
      </Section>

      <Modal
        open={modal}
        onClose={() => setModal(false)}
        theme={theme}
        title="Edit plan"
        description="Changes apply from the next billing period."
        footer={
          <>
            <Button variant="secondary" onClick={() => setModal(false)}>Cancel</Button>
            <Button variant="primary" onClick={() => { setModal(false); toast.success("Plan saved", { theme }); }}>Save</Button>
          </>
        }
      >
        <p className={styles.muted}>Focus is trapped here. Tab cycles, Escape closes, focus returns to the button.</p>
        <label className={styles.fieldLabel} htmlFor={`${theme}-plan`}>Plan name</label>
        <input id={`${theme}-plan`} className={styles.input} defaultValue="Premium" />
      </Modal>

      <Drawer open={drawer} onClose={() => setDrawer(false)} theme={theme} title="Application APP-2049" description="Mara Fresh Mart · Nairobi">
        <div className={styles.drawerBody}>
          <StatusChip status="under_review" />
          <Skeleton variant="text" lines={4} />
          <Button variant="primary" onClick={() => setDrawer(false)}>Done</Button>
        </div>
      </Drawer>

      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        theme={theme}
        title="Suspend Mara Fresh Mart?"
        description="The business disappears from search straight away. You can reinstate it later."
        confirmLabel="Suspend business"
        confirmText="Mara Fresh Mart"
        onConfirm={async ({ reason }) => {
          await new Promise((r) => setTimeout(r, 700));
          setConfirm(false);
          toast.success(`Suspended. Reason saved: “${reason}”`, { theme });
        }}
      />
    </div>
  );
}

import Button from "../components/Button.jsx";

export default function SettingsPage() {
  return (
    <div className="page-shell">
      <section className="panel">
        <div className="panel__header">
          <h3>System settings</h3>
          <Button variant="primary">Save changes</Button>
        </div>

        <div className="settings-grid">
          <div className="setting-group">
            <label htmlFor="setting-grace">Grace period (days)</label>
            <input id="setting-grace" type="number" defaultValue={1} />
          </div>
          <div className="setting-group">
            <label htmlFor="setting-strikes">Strike threshold</label>
            <input id="setting-strikes" type="number" defaultValue={3} />
          </div>
          <div className="setting-group">
            <label htmlFor="setting-sender">SMS sender</label>
            <input id="setting-sender" type="text" defaultValue="EpicMKT" />
          </div>
          <div className="setting-group">
            <label htmlFor="setting-quiet">Quiet hours</label>
            <input id="setting-quiet" type="text" defaultValue="21:00-07:00 EAT" />
          </div>
        </div>
      </section>
    </div>
  );
}

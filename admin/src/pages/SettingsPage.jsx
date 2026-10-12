export default function SettingsPage() {
  return (
    <div className="page-shell">
      <section className="panel">
        <div className="panel__header">
          <h3>System settings</h3>
          <button type="button" className="secondary-button">Save changes</button>
        </div>

        <div className="settings-grid">
          <div className="setting-group">
            <label>Grace period (days)</label>
            <input type="number" defaultValue={1} />
          </div>
          <div className="setting-group">
            <label>Strike threshold</label>
            <input type="number" defaultValue={3} />
          </div>
          <div className="setting-group">
            <label>SMS sender</label>
            <input type="text" defaultValue="EpicMKT" />
          </div>
          <div className="setting-group">
            <label>Quiet hours</label>
            <input type="text" defaultValue="21:00-07:00 EAT" />
          </div>
        </div>
      </section>
    </div>
  );
}

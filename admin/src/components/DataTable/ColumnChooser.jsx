import { faTableColumns } from "@fortawesome/free-solid-svg-icons";
import Popover from "./Popover.jsx";

export default function ColumnChooser({ columns, hidden, onToggle, onReset }) {
  return (
    <Popover label="Columns" icon={faTableColumns}>
      <ul className="dt__list">
        {columns.map((column) => (
          <li key={column.key}>
            <label className="dt__check">
              <input
                type="checkbox"
                checked={column.locked || !hidden.includes(column.key)}
                disabled={column.locked}
                onChange={() => onToggle(column.key)}
              />
              {column.label ?? column.header}
            </label>
          </li>
        ))}
      </ul>
      <button type="button" className="dt__link" onClick={onReset}>Show all</button>
    </Popover>
  );
}

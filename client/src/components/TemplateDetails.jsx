import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCheck, faXmark } from "@fortawesome/free-solid-svg-icons";
import { formatKes, formatValue, visibleFields } from "@epicmkt/shared";
import styles from "./TemplateDetails.module.css";

const isEmpty = (value) => value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0);

const BLOCK_TYPES = ["longtext", "itemlist", "image", "multiselect"];

function Scalar({ field, value }) {
  if (field.type === "boolean") {
    return (
      <span className={value ? styles.yes : styles.no}>
        <FontAwesomeIcon icon={value ? faCheck : faXmark} aria-hidden="true" />
        <span>{value ? "Yes" : "No"}</span>
      </span>
    );
  }
  if (field.type === "url") {
    return (
      <a href={value} target="_blank" rel="noopener noreferrer" className={styles.link}>
        {value.replace(/^https?:\/\//, "")}
      </a>
    );
  }
  return <span>{formatValue(field, value)}</span>;
}

function Block({ field, value }) {
  if (field.type === "longtext") return <p className={styles.long}>{value}</p>;

  if (field.type === "multiselect") {
    return (
      <ul className={styles.chips}>
        {value.map((v) => (
          <li key={v} className={styles.chip}>
            {field.options.find((o) => o.value === v)?.label ?? v}
          </li>
        ))}
      </ul>
    );
  }

  if (field.type === "image") return <img src={value} alt={field.label} loading="lazy" decoding="async" className={styles.image} />;

  return (
    <ul className={styles.items}>
      {value.map((item) => (
        <li key={item.name} className={styles.item}>
          <span>{item.name}</span>
          {item.price != null && <strong>{formatKes(item.price)}</strong>}
        </li>
      ))}
    </ul>
  );
}

export default function TemplateDetails({ fields, attributes }) {
  const shown = visibleFields(fields, attributes).filter((f) => !isEmpty(attributes?.[f.key]));
  if (!shown.length) return null;

  const groups = [];
  for (const field of shown) {
    const name = field.group ?? "";
    let group = groups.find((g) => g.name === name);
    if (!group) {
      group = { name, scalars: [], blocks: [] };
      groups.push(group);
    }
    (BLOCK_TYPES.includes(field.type) ? group.blocks : group.scalars).push(field);
  }

  return (
    <div className={styles.groups}>
      {groups.map((group) => (
        <div key={group.name} className={styles.group}>
          {group.name && <h3 className={styles.groupTitle}>{group.name}</h3>}
          {group.scalars.length > 0 && (
            <dl className={styles.list}>
              {group.scalars.map((field) => (
                <div key={field.key} className={styles.row}>
                  <dt className={styles.label}>{field.label}</dt>
                  <dd className={styles.value}>
                    <Scalar field={field} value={attributes[field.key]} />
                  </dd>
                </div>
              ))}
            </dl>
          )}
          {group.blocks.map((field) => (
            <div key={field.key} className={styles.block}>
              <h4 className={styles.label}>{field.label}</h4>
              <Block field={field} value={attributes[field.key]} />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

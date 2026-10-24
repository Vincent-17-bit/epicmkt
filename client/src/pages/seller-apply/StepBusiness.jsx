import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSliders, faStore } from "@fortawesome/free-solid-svg-icons";
import CategoryPicker from "./CategoryPicker.jsx";
import TemplateFields from "./TemplateFields.jsx";
import { TextField } from "./Field.jsx";
import form from "./form.module.css";
import styles from "./steps.module.css";

export default function BusinessStep({ catalog, category }) {
  const needed = (category?.template ?? []).filter((f) => f.required).length;
  return (
    <div className={styles.stack}>
      <CategoryPicker catalog={catalog} />

      <section className={styles.block} aria-labelledby="biz-title">
        <div className={styles.blockHead}>
          <span className={styles.blockIcon} aria-hidden="true">
            <FontAwesomeIcon icon={faStore} />
          </span>
          <div>
            <h3 id="biz-title">Name your business</h3>
            <p>This is how customers will see you.</p>
          </div>
        </div>
        <div className={form.grid}>
          <TextField
            name="business.name"
            label="Business name"
            className={form.span2}
            placeholder="For example Mama Njeri Bakery"
            autoComplete="organization"
            autoCapitalize="words"
            maxLength={60}
            hint="3 to 60 characters. No emoji or web links."
          />
          <TextField
            name="business.shortDescription"
            label="Short description"
            type="textarea"
            maxLength={160}
            counter
            optional
            className={form.span2}
            placeholder="For example Fresh bread, cakes and mandazi baked every morning"
            hint="One or two lines that tell customers what you do. No links."
          />
        </div>
        <p className={styles.note}>Your public link will look like epicmkt.app/s/your-shop. We create it when you are approved and it never changes.</p>
      </section>

      {category && (
        <section className={styles.block} aria-labelledby="details-title">
          <div className={styles.blockHead}>
            <span className={styles.blockIcon} aria-hidden="true">
              <FontAwesomeIcon icon={faSliders} />
            </span>
            <div>
              <h3 id="details-title">{category.name} details</h3>
              <p>
                {needed
                  ? "Customers use these to find and choose you. Fill what applies."
                  : "All optional. Add what you can now, and edit it any time after you are live."}
              </p>
            </div>
          </div>
          <TemplateFields fields={category.template} />
        </section>
      )}
    </div>
  );
}

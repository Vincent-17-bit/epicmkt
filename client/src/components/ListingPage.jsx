import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Container, Field, Select, Button } from "@epicmkt/ui";
import { t } from "../i18n/index.js";
import PageBreadcrumbs from "./PageBreadcrumbs.jsx";
import styles from "./ListingPage.module.css";

/**
 * The shared frame of the Offers and Flash sales pages: breadcrumb, hero, category and town selects, any extra
 * filters, the sort select, the clear link, and the loading, error, empty and load-more states. Each page keeps its
 * own copy, icon, filters, data and cards, and passes them in.
 *
 * `tone="flash"` is the flash-sale colouring of the hero and the wider filter columns.
 */
export default function ListingPage({
  tone = "default",
  icon,
  title,
  count,
  subtitle,
  facets,
  categoryName,
  category,
  town,
  sort,
  sorts,
  onChange,
  extraFilters = null,
  active,
  onClear,
  query,
  entries,
  total,
  pending,
  list,
  failedText,
  noMatchText,
  emptyText,
  offlineText = null,
  online = true
}) {
  const offline = Boolean(offlineText) && !online;
  return (
    <>
      <Container className={styles.crumbRow}>
        <PageBreadcrumbs />
      </Container>
      <section className={styles.hero} data-tone={tone}>
        <Container>
          <div className={styles.heroInner}>
            <h1 className={styles.title}>
              <FontAwesomeIcon icon={icon} className={styles.icon} aria-hidden="true" />
              {title}
              {count && <span className={styles.count}>{count}</span>}
            </h1>
            {tone === "flash" && <span className={styles.underline} aria-hidden="true" />}
            <p className={styles.lead}>{subtitle}</p>
          </div>
        </Container>
      </section>

      <section className={styles.body}>
        <Container>
          <div className={styles.controls} data-tone={tone}>
            <Field label={t("flash.filter.category")}>
              <Select variant="filter" value={category} onChange={(e) => onChange({ category: e.target.value })}>
                <option value="">{t("flash.filter.all")}</option>
                {facets?.categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {categoryName(c.id)} ({c.count})
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t("flash.filter.town")}>
              <Select variant="filter" value={town} onChange={(e) => onChange({ town: e.target.value })}>
                <option value="">{t("flash.filter.all")}</option>
                {facets?.towns.map((tw) => (
                  <option key={tw.slug} value={tw.slug}>
                    {tw.name} ({tw.count})
                  </option>
                ))}
              </Select>
            </Field>
            {extraFilters}
            <Field label={t("flash.sort")}>
              <Select variant="filter" value={sort} onChange={(e) => onChange({ sort: e.target.value === "ending" ? "" : e.target.value })}>
                {sorts.map((value) => (
                  <option key={value} value={value}>
                    {t(`flash.sort.${value}`)}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          {active && (
            <Button variant="ghost" size="sm" className={styles.clear} onClick={onClear}>
              {t("flash.filter.clear")}
            </Button>
          )}

          {query.isPending && offline ? (
            <div className={styles.message} role="status">
              <p>{offlineText}</p>
            </div>
          ) : query.isPending ? (
            pending
          ) : query.isError && entries.length === 0 ? (
            <div className={styles.message} role="alert">
              <p>{failedText}</p>
              <Button onClick={() => query.refetch()}>{t("flash.retry")}</Button>
            </div>
          ) : entries.length === 0 ? (
            <div className={styles.message}>
              <p>{active ? noMatchText : emptyText}</p>
            </div>
          ) : (
            <>
              {offline && (
                <p className={styles.offline} role="status">
                  {offlineText}
                </p>
              )}
              <p className={styles.shown} aria-live="polite">
                {t("flash.shown")} {entries.length} {t("flash.of")} {total}
              </p>
              {list}
              {query.hasNextPage && (
                <div className={styles.more}>
                  {query.isFetchNextPageError && <p role="alert">{failedText}</p>}
                  <Button onClick={() => query.fetchNextPage()} disabled={query.isFetchingNextPage}>
                    {query.isFetchingNextPage ? t("flash.loading") : query.isFetchNextPageError ? t("flash.retry") : t("flash.loadMore")}
                  </Button>
                </div>
              )}
            </>
          )}
        </Container>
      </section>
    </>
  );
}

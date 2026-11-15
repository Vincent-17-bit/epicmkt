import { Link, useParams } from "react-router-dom";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { faLayerGroup, faRotateRight } from "@fortawesome/free-solid-svg-icons";
import { formatKes } from "@epicmkt/shared";
import { getDepartmentBrowse, getDepartments } from "../api/departments.js";
import { usePageTitle } from "../hooks/usePageTitle.js";
import { useNoindex } from "../hooks/useRouteSeo.js";
import { t } from "../i18n/index.js";
import { Button, Container, Skeleton, StateCard } from "@epicmkt/ui";
import PageBanner from "../components/PageBanner.jsx";
import PageBreadcrumbs from "../components/PageBreadcrumbs.jsx";
import ProductTile from "../components/ProductTile.jsx";
import NotFound from "./NotFound.jsx";
import styles from "./Department.module.css";

const PAGE = 24;
const fill = (key, values) => Object.entries(values).reduce((text, [k, v]) => text.replace(`{${k}}`, String(v)), t(key));

export const priceLabel = (item) => {
  if (item.price == null) return "";
  const from = item.priceType === "from" || item.hasOptions || (item.priceMax != null && item.priceMax > item.price);
  return `${from ? `${t("dept.from")} ` : ""}${formatKes(item.price, { decimals: 0 })}`;
};

/** A department row in the shape the site's product card reads, so this page shows the same card as everywhere else. */
export const asCardItem = (item) => {
  const from = item.price != null && (item.priceType === "from" || item.hasOptions || (item.priceMax != null && item.priceMax > item.price));
  return {
    id: item.id,
    name: item.name,
    hasOptions: item.hasOptions,
    images: item.image ? [{ id: "i1", url: item.image, caption: item.name }] : [],
    pricing: item.price == null ? null : { salePrice: item.price, regularPrice: item.price, savings: 0, discountPercent: 0, hasRange: from, priceMin: item.price },
    business: item.shop ? { id: item.shop.id, slug: item.shop.slug, name: item.shop.name, town: item.shop.town } : null
  };
};

function ItemTile({ item }) {
  const href = item.shop ? `/b/${item.shop.slug}/i/${item.id}` : "/";
  return <ProductTile item={asCardItem(item)} href={href} delivery={item.shop?.town ? { kind: "place", text: item.shop.town } : null} />;
}

/** Everything in one department (/d/phones) or one type of it (/d/phones/phone), from every shop, whatever the shop's category. */
export default function Department() {
  const { department, type } = useParams();
  const { data: departments, isPending: loadingDepartments } = useQuery({ queryKey: ["departments"], queryFn: getDepartments, staleTime: 5 * 60_000 });
  const dept = departments?.find((d) => d.id === department);
  const typeInfo = type ? dept?.types?.find((x) => x.id === type) : null;
  const title = typeInfo?.name ?? dept?.name ?? "";
  usePageTitle(title);
  useNoindex(!loadingDepartments && (!dept || (type && !typeInfo)));

  const query = useInfiniteQuery({
    queryKey: ["department-browse", department, type ?? null],
    initialPageParam: 0,
    queryFn: ({ pageParam }) => getDepartmentBrowse(department, type ?? null, { limit: PAGE, offset: pageParam }),
    getNextPageParam: (last, all) => {
      const loaded = all.reduce((sum, page) => sum + page.items.length, 0);
      return loaded < last.total ? loaded : undefined;
    },
    staleTime: 30_000
  });

  if (!loadingDepartments && (!dept || (type && !typeInfo))) return <NotFound />;

  const entries = query.data?.pages.flatMap((page) => page.items) ?? [];
  const total = query.data?.pages[0]?.total ?? 0;

  return (
    <>
      <PageBanner crumbs={<PageBreadcrumbs />} icon={faLayerGroup} title={title || " "} subtitle={dept && type ? dept.name : undefined} />
      <section className={styles.section} aria-label={title}>
        <Container>
          {dept?.types?.length > 0 && (
            <nav className={styles.types} aria-label={fill("dept.types", { name: dept.name })}>
              <Link to={`/d/${dept.id}`} className={styles.chip} aria-current={type ? undefined : "page"}>{t("dept.all")}</Link>
              {dept.types.map((x) => (
                <Link key={x.id} to={`/d/${dept.id}/${x.id}`} className={styles.chip} aria-current={x.id === type ? "page" : undefined}>
                  {x.name} <span className={styles.n}>{x.count}</span>
                </Link>
              ))}
            </nav>
          )}
          {!query.isPending && !query.isError && entries.length > 0 && (
            <p className={styles.count} role="status">{total === 1 ? t("dept.count.one") : fill("dept.count", { n: total })}</p>
          )}
          {query.isError ? (
            <StateCard role="alert" message={t("dept.error")}>
              <Button icon={faRotateRight} onClick={() => query.refetch()}>{t("dept.retry")}</Button>
            </StateCard>
          ) : query.isPending ? (
            <ul className={styles.grid} aria-busy="true">
              {Array.from({ length: 6 }, (_, i) => <li key={i}><Skeleton height="16rem" radius="var(--radius-card)" /></li>)}
            </ul>
          ) : entries.length === 0 ? (
            <StateCard message={t("dept.empty")}>
              <Button as={Link} to="/" variant="secondary">{t("dept.home")}</Button>
            </StateCard>
          ) : (
            <>
              <ul className={styles.grid}>{entries.map((item) => <li key={item.id} className={styles.cell}><ItemTile item={item} /></li>)}</ul>
              {query.hasNextPage && (
                <div className={styles.more}>
                  <Button variant="secondary" disabled={query.isFetchingNextPage} onClick={() => query.fetchNextPage()}>{t("dept.more")}</Button>
                </div>
              )}
            </>
          )}
        </Container>
      </section>
    </>
  );
}

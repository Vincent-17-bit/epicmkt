import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { items } from "../api/index.js";
import { t } from "../i18n/index.js";
import Container from "./Container.jsx";
import ItemCard from "./ItemCard.jsx";
import Skeleton from "./Skeleton.jsx";
import styles from "./HomeProducts.module.css";

export const HOME_PRODUCT_LIMIT = 12;

// Opens the item on its store page, the same view the store's own product cards open.
export const itemPath = (item) => `/b/${item.business?.slug ?? item.businessSlug}?item=${encodeURIComponent(item.id)}`;

export default function HomeProducts() {
  const navigate = useNavigate();
  const { data, isPending } = useQuery({
    queryKey: ["home-products", HOME_PRODUCT_LIMIT],
    queryFn: () => items.getHome({ limit: HOME_PRODUCT_LIMIT }),
    staleTime: 60_000
  });

  if (!isPending && !data?.length) return null;

  return (
    <section className={styles.section} aria-labelledby="home-products-title">
      <Container>
        <h2 id="home-products-title" className={styles.heading}>
          {t("home.products")}
        </h2>
        <ul className={styles.grid} aria-busy={isPending} aria-label={isPending ? t("home.productsLoading") : undefined}>
          {isPending
            ? Array.from({ length: 6 }, (_, i) => (
                <li key={i} className={styles.cell}>
                  <Skeleton height="11rem" radius="var(--radius-card)" />
                </li>
              ))
            : data.map((item) => (
                <li key={item.id} className={styles.cell}>
                  <ItemCard item={item} onSelect={() => navigate(itemPath(item), { state: { sheetFrom: "page" } })} />
                  <Link to={`/b/${item.business.slug}`} className={styles.store}>
                    {t("home.productsFrom")} {item.business.name}
                  </Link>
                </li>
              ))}
        </ul>
      </Container>
    </section>
  );
}

import { Navigate, useLocation, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { faRotateRight } from "@fortawesome/free-solid-svg-icons";
import { resolveShortcode } from "../api/index.js";
import { itemPath } from "../config/breadcrumbs.js";
import Container from "../components/Container.jsx";
import Button from "../components/Button.jsx";
import Skeleton from "../components/Skeleton.jsx";
import NotFound from "./NotFound.jsx";
import styles from "./Business.module.css";

export default function ShortLink() {
  const { shortcode } = useParams();
  const { search } = useLocation();
  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: ["shortcode", shortcode],
    queryFn: () => resolveShortcode(shortcode),
    retry: false
  });

  if (data) {
    const itemId = new URLSearchParams(search).get("item");
    return <Navigate to={itemId ? itemPath(data.slug, itemId) : `/b/${data.slug}`} replace />;
  }
  if (isError && error?.name === "NotFoundError") return <NotFound />;
  if (isError) {
    return (
      <Container className={styles.state} role="alert">
        <p>We could not open this link.</p>
        <Button icon={faRotateRight} onClick={() => refetch()}>
          Try again
        </Button>
      </Container>
    );
  }
  return (
    <Container className={styles.state} aria-busy={isPending}>
      <Skeleton height="1rem" width="12rem" />
    </Container>
  );
}

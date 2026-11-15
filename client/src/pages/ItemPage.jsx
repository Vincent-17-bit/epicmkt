import { useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { BusinessPageError, BusinessPageSkeleton } from "@epicmkt/ui";
import { distanceKm } from "@epicmkt/shared";
import { getBusiness, items } from "../api/index.js";
import { useGeoStore } from "../stores/geo.js";
import ItemDetail from "../components/ItemDetail.jsx";
import ReportDialog from "../components/ReportDialog.jsx";
import NotFound from "./NotFound.jsx";

// One product on a page of its own: /b/<store>/i/<item>.
export default function ItemPage() {
  const { slug, itemId } = useParams();
  const navigate = useNavigate();
  const geo = useGeoStore();
  const [reporting, setReporting] = useState(false);

  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: ["business", slug],
    queryFn: () => getBusiness(slug),
    retry: false
  });

  // An item the seller combined into another (Bread 400g -> Bread) opens the combined item with the old choice picked.
  const moved = useQuery({
    queryKey: ["item-redirect", itemId],
    queryFn: async () => (await items.getRedirect?.(itemId)) ?? null,
    staleTime: 5 * 60 * 1000,
    retry: false
  });
  if (moved.data?.itemId && moved.data.itemId !== itemId) {
    return <Navigate replace to={`/b/${slug}/i/${encodeURIComponent(moved.data.itemId)}${moved.data.param ? `?v=${encodeURIComponent(moved.data.param)}` : ""}`} />;
  }

  if (isError && error?.name === "NotFoundError") return <NotFound />;
  if (isError) return <BusinessPageError onRetry={() => refetch()} />;
  if (isPending) return <BusinessPageSkeleton />;

  const origin = geo.coords;
  const distance = origin ? distanceKm(origin, data) : null;

  return (
    <>
      <ItemDetail
        layout="page"
        business={data}
        itemId={itemId}
        distanceKm={distance}
        onClose={() => navigate(`/b/${data.slug}`)}
        onSelect={(next) => navigate(`/b/${data.slug}/i/${encodeURIComponent(next)}`)}
        onReport={() => setReporting(true)}
      />
      <ReportDialog business={data} open={reporting} onClose={() => setReporting(false)} />
    </>
  );
}

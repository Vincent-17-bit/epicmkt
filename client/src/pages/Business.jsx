import { useEffect, useState } from "react";
import { useNavigate, useLocation, useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { BusinessPage, BusinessPageError, BusinessPageSkeleton } from "@epicmkt/ui";
import { distanceKm } from "@epicmkt/shared";
import { getBusiness, logContactEvent } from "../api/index.js";
import { categoryIcon } from "../lib/categoryIcons.js";
import { DAY_NAMES, WEEK, expiryText, formatTime, socialLinks, statusText, todayKey } from "../lib/businessView.js";
import { useGeoStore } from "../stores/geo.js";
import { usePageTitle } from "../hooks/usePageTitle.js";
import { visibleFields } from "@epicmkt/shared";
import TemplateDetails from "../components/TemplateDetails.jsx";
import PageBreadcrumbs from "../components/PageBreadcrumbs.jsx";
import ItemDetail from "../components/ItemDetail.jsx";
import FlashStrip from "../components/FlashStrip.jsx";
import QrCode from "../components/QrCode.jsx";
import ReportDialog from "../components/ReportDialog.jsx";
import NotFound from "./NotFound.jsx";

export default function Business() {
  const { slug } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const itemId = searchParams.get("item");
  const [reporting, setReporting] = useState(false);
  const [shareNote, setShareNote] = useState("");
  const geo = useGeoStore();
  const [live, setLive] = useState(null);

  useEffect(() => {
    if (geo.status !== "granted" || geo.source !== "device") return undefined;
    const id = navigator.geolocation.watchPosition(
      (pos) => setLive({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {},
      { enableHighAccuracy: false, maximumAge: 30000 }
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [geo.status, geo.source]);

  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: ["business", slug],
    queryFn: () => getBusiness(slug),
    retry: false
  });

  usePageTitle(data ? `${data.name} | ${data.category?.name ?? ""}`.replace(/ \| $/, "") : undefined);

  const sectionId = searchParams.get("section");
  const [hit, setHit] = useState(null);
  useEffect(() => {
    if (!data || !sectionId) return undefined;
    const node = document.getElementById(`section-${sectionId}`);
    if (!node) return undefined;
    node.scrollIntoView({ block: "start" });
    setHit(sectionId);
    const timer = setTimeout(() => setHit(null), 2500);
    return () => clearTimeout(timer);
  }, [data, sectionId]);

  useEffect(() => {
    if (data && location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView();
  }, [data, location.hash]);

  const openItem = (id) => setSearchParams({ item: id }, { state: { sheetFrom: "page" } });
  const swapItem = (id) => setSearchParams({ item: id }, { replace: true, state: location.state });
  const closeItem = () => {
    if (location.state?.sheetFrom === "page") navigate(-1);
    else
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.delete("item");
          return next;
        },
        { replace: true }
      );
  };

  if (isError && error?.name === "NotFoundError") return <NotFound />;

  if (isError) return <BusinessPageError onRetry={() => refetch()} />;

  if (isPending) return <BusinessPageSkeleton breadcrumbs={<PageBreadcrumbs />} />;

  const icon = categoryIcon(data.category?.icon);
  const shortUrl = `${window.location.origin}/s/${data.shortcode}`;
  const today = todayKey();
  const origin = live ?? geo.coords;
  const distance = origin ? distanceKm(origin, data) : null;
  const hasDetails = visibleFields(data.category?.fields, data.attributes).some((f) => f.key in (data.attributes ?? {}));
  const reviews = data.reviewCount > 0 ? `${data.rating.toFixed(1)} (${data.reviewCount})` : "New";

  const share = async () => {
    const payload = { title: data.name, text: `${data.name} on EpicMKT`, url: shortUrl };
    try {
      if (navigator.share) {
        await navigator.share(payload);
        return;
      }
      await navigator.clipboard.writeText(shortUrl);
      setShareNote("Link copied");
    } catch (err) {
      if (err?.name !== "AbortError") setShareNote("Could not share");
    }
    window.setTimeout(() => setShareNote(""), 2500);
  };

  const hoursRows = WEEK.map((day) => ({
    day,
    name: DAY_NAMES[day],
    today: day === today,
    text: data.hours[day] ? `${formatTime(data.hours[day][0])} to ${formatTime(data.hours[day][1])}` : "Closed"
  }));

  const locateLabel =
    geo.status === "asking" ? "Finding you" : geo.status === "denied" || geo.status === "unsupported" ? "Choose your town to see distance" : "Show distance from me";

  return (
    <BusinessPage
      business={data}
      icon={icon}
      statusText={statusText(data)}
      reviewsText={reviews}
      distanceKm={distance}
      fromTown={geo.town}
      locate={{ label: locateLabel, onClick: geo.request, disabled: geo.status === "asking" }}
      hoursRows={hoursRows}
      formatExpiry={expiryText}
      details={hasDetails ? <TemplateDetails fields={data.category.fields} attributes={data.attributes} /> : null}
      detailsTitle={`${data.category?.singular} details`}
      flash={<FlashStrip id="business-flash-title" businessId={data.id} heat={false} />}
      socials={socialLinks(data.socials)}
      qr={<QrCode value={shortUrl} label={`QR code linking to ${data.name}`} />}
      shortUrl={shortUrl}
      hitSection={hit}
      shareNote={shareNote}
      crumbInert={Boolean(itemId)}
      breadcrumbs={<PageBreadcrumbs />}
      onContact={(business, type) => logContactEvent({ businessId: business.id, type })}
      onShare={share}
      onOpenItem={openItem}
      onReport={() => setReporting(true)}
    >
      {itemId && (
        <ItemDetail
          business={data}
          itemId={itemId}
          distanceKm={distance}
          onClose={closeItem}
          onSelect={swapItem}
          onReport={() => setReporting(true)}
        />
      )}
      <ReportDialog business={data} open={reporting} onClose={() => setReporting(false)} />
    </BusinessPage>
  );
}

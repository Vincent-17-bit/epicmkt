import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getMyBusiness, listBranches, listCategories, listChanges } from "../api/index.js";
import { errorMessage } from "../lib/errors.js";
import BranchesCard from "../components/account/BranchesCard.jsx";
import {
  AmenitiesCard, AnnouncementCard, BasicsCard, CategoryDetailsCard, ContactCard, DeliveryCard, ImagesCard, LanguagesCard, PaymentsCard, SocialsCard, TagsCard,
} from "../components/account/EditableCards.jsx";
import { CategoryCard, LicenceCard, LocationCard, NameCard, PhoneCard, TownCard } from "../components/account/LockedCards.jsx";
import ReadOnlyCard from "../components/account/ReadOnlyCard.jsx";

const queries = [
  { key: "business", fn: getMyBusiness },
  { key: "categories", fn: listCategories },
  { key: "changes", fn: listChanges },
  { key: "branches", fn: listBranches },
];

export default function Account() {
  const navigate = useNavigate();
  const [business, categories, changes, branches] = queries.map((q) => useQuery({ queryKey: [q.key], queryFn: q.fn })); // eslint-disable-line react-hooks/rules-of-hooks
  const failed = [business, categories, changes, branches].find((q) => q.isError);

  useEffect(() => { document.title = "My Account · EpicMKT Seller"; }, []);
  useEffect(() => {
    if (failed?.error?.code === "unauthorized") navigate("/login", { replace: true });
  }, [failed, navigate]);

  if (failed) {
    return (
      <main className="sx-page">
        <h1>My Account</h1>
        <p className="sx-error" role="alert">{errorMessage(failed.error)}</p>
        <button type="button" className="sx-btn" onClick={() => [business, categories, changes, branches].forEach((q) => q.isError && q.refetch())}>Try again</button>
      </main>
    );
  }
  if (!business.data || !categories.data || !changes.data || !branches.data) {
    return <main className="sx-page"><h1>My Account</h1><p role="status">Loading your account…</p></main>;
  }

  const b = business.data;
  const prices = categories.data.find((c) => c.id === b.category_id)?.plans;
  const upgradePrice = prices?.premium && prices?.standard ? prices.premium.price - prices.standard.price : null;

  return (
    <main className="sx-page">
      <h1>My Account</h1>
      <p className="sx-muted">{b.name}</p>
      <nav className="sx-jump" aria-label="Jump to a group of settings">
        <a href="#group-listing">Your listing</a>
        <a href="#group-approval">Needs approval</a>
        <a href="#group-edit">Edit any time</a>
        <a href="#group-premium">Premium</a>
      </nav>

      <div id="group-listing" className="sx-group">
        <ReadOnlyCard business={b} />
      </div>

      <div id="group-approval" className="sx-group">
        <h2 className="sx-group__title">Changes that need approval</h2>
        <p className="sx-muted">These affect how customers find and trust you, so our team checks them. Your current details stay live until a change is approved.</p>
        <NameCard business={b} changes={changes.data} />
        <CategoryCard business={b} categories={categories.data} changes={changes.data} />
        <LocationCard business={b} changes={changes.data} />
        <PhoneCard business={b} changes={changes.data} />
        <TownCard business={b} changes={changes.data} />
        <LicenceCard business={b} changes={changes.data} />
      </div>

      <div id="group-edit" className="sx-group">
        <h2 className="sx-group__title">Edit any time</h2>
        <p className="sx-muted">These save straight away.</p>
        <BasicsCard business={b} />
        <ImagesCard business={b} />
        <ContactCard business={b} />
        <SocialsCard business={b} />
        <LanguagesCard business={b} />
        <AmenitiesCard business={b} />
        <PaymentsCard business={b} />
        <DeliveryCard business={b} />
        <CategoryDetailsCard business={b} categories={categories.data} />
        <TagsCard business={b} />
      </div>

      <div id="group-premium" className="sx-group">
        <h2 className="sx-group__title">Premium</h2>
        <AnnouncementCard business={b} upgradePrice={upgradePrice} />
        <BranchesCard business={b} branches={branches.data} upgradePrice={upgradePrice} />
      </div>
    </main>
  );
}

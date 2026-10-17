import { useEffect, useState } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { PlanPicker } from "@epicmkt/shared/plans";
import Button from "../../components/Button.jsx";
import { CatalogError, CatalogLoading } from "./CatalogState.jsx";
import { ErrorLine, fieldId } from "./Field.jsx";

export default function PlanStep({ catalog }) {
  const { control, setValue, formState } = useFormContext();
  const categoryId = useWatch({ control, name: "categoryId" });
  const planKey = useWatch({ control, name: "planKey" });
  const { refetch } = catalog;
  const category = catalog.category(categoryId);
  const error = formState.errors.planKey?.message;

  const [syncedFor, setSyncedFor] = useState(null);

  useEffect(() => {
    if (!categoryId) return;
    let live = true;
    refetch().finally(() => live && setSyncedFor(categoryId));
    return () => {
      live = false;
    };
  }, [categoryId]);

  if (catalog.isLoading || (categoryId && syncedFor !== categoryId && !catalog.isError)) return <CatalogLoading rows={2} />;
  if (catalog.isError) return <CatalogError onRetry={catalog.refetch} />;

  return (
    <PlanPicker
      category={category}
      planKey={planKey}
      onChoose={(key) => setValue("planKey", key, { shouldDirty: true, shouldValidate: true })}
      error={<ErrorLine message={error} />}
      groupId={fieldId("planKey")}
      Button={Button}
    />
  );
}

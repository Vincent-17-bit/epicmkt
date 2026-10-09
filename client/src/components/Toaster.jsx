import { Toaster as UiToaster } from "@epicmkt/ui";
import { useToastStore } from "../stores/toast.js";

export default function Toaster() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);
  return <UiToaster toasts={toasts} onDismiss={dismiss} />;
}

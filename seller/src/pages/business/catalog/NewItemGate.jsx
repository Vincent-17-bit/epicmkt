import { Navigate, useLocation } from "react-router-dom";
import { OTHER_TYPE_ID } from "@epicmkt/shared";
import ItemEditor from "./editor/ItemEditor.jsx";
import { pickerAvailable } from "./AddItem.data.js";

const CATALOG = "/business/catalog";

// A NEW item opens only once it has a type (the server refuses to save one without it: migration 0141). Anyone who lands on
// /business/catalog/new without choosing one (a bookmark, a reload that lost the route state) goes through the picker first, which is also
// where a name typed in the search box is turned into a one-tap suggestion. "Other" is a real choice there, so nobody is ever blocked.
export default function NewItemGate() {
  const { state } = useLocation();
  if (typeof state?.productTypeId === "string" && state.productTypeId.trim()) return <ItemEditor />;
  if (pickerAvailable()) return <Navigate to={`${CATALOG}/add`} replace state={state} />;
  // No type list to pick from (the picker is not available): Other keeps adding an item possible.
  return <Navigate to={`${CATALOG}/new`} replace state={{ ...state, productTypeId: OTHER_TYPE_ID }} />;
}

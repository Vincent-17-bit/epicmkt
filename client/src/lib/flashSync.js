export const FLASH_QUERY_KEYS = [
  ["flash-strip"],
  ["flash-page"],
  ["flash-facets"],
  ["item"],
  ["store-selective"],
  ["business"],
  ["businesses"]
];

export const invalidateFlash = (queryClient) => {
  FLASH_QUERY_KEYS.forEach((queryKey) => queryClient.invalidateQueries({ queryKey }));
};
